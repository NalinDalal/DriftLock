import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import type { AIFixConfig } from "@driftlock/aiFix";

export interface ProviderChange {
  provider: string;
  fromVersion?: string;
  toVersion?: string;
  source: { type: string; url?: string };
  summary: string;
  affectedAreas: Array<{ type: string; name: string; change: string }>;
}

export async function runMigrate(opts: {
  repo: string;
  changePath: string;
  dryRun?: boolean;
  ai?: AIFixConfig;
}) {
  const change: ProviderChange = JSON.parse(readFileSync(opts.changePath, "utf8"));
  console.log(`[MIGRATE] ${change.provider} ${change.fromVersion} → ${change.toVersion}: ${change.summary}`);

  // 1. Scan — for p5 wedge, grep for affectedAreas names in repo
  const repoPath = opts.repo.includes("/") && !opts.repo.startsWith("/") && !opts.repo.startsWith(".")
    ? `/tmp/driftlock-migrate-${Date.now()}`
    : opts.repo;

  let localPath = opts.repo;
  if (opts.repo.includes("/")) {
    // Assume owner/repo — clone to /tmp
    const tmp = `/tmp/driftlock-migrate-${Date.now()}`;
    console.log(`[CLONE] ${opts.repo} → ${tmp}`);
    execSync(`git clone --depth 1 https://github.com/${opts.repo}.git ${tmp}`, { stdio: "inherit" });
    localPath = tmp;
  }

  const affected: string[] = [];
  for (const area of change.affectedAreas) {
    try {
      const out = execSync(`grep -rn "${area.name}" ${localPath} --include="*.js" --include="*.ts" | head -n 20`, { encoding: "utf8" });
      if (out.trim()) {
        console.log(`[SCAN] ${area.name}:`, out.trim().split("\n").slice(0, 3).join(" | "));
        affected.push(area.name);
      }
    } catch {}
  }
  if (affected.length === 0) {
    console.log("[SCAN] No affected files found — check affectedAreas names");
    return;
  }

  // 2. For each affected file, call agent
  const files = execSync(`grep -rn "${affected[0]}" ${localPath} --include="*.js" --include="*.ts" -l 2>&1`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  console.log(`[FILES] ${files.join(", ")}`);

  for (const file of files) {
    const fullPath = file.startsWith("/") ? file : join(localPath, file);
    const source = readFileSync(fullPath, "utf8");
    const diffSummary = `Provider ${change.provider} ${change.fromVersion}→${change.toVersion}: ${affected.join(", ")}`;
    console.log(`\n[AGENT] ${file} — ${diffSummary}`);

    if (!opts.ai) {
      console.log("[AGENT] No AI config — dry-run would propose patch here");
      if (opts.dryRun) console.log(`[DRY-RUN] Would patch ${file}`);
      continue;
    }

    try {
      const { generateAIFix } = await import("@driftlock/aiFix");
      const result = await generateAIFix(
        {
          diff: { addedFields: [], removedFields: [], typeChanges: [], optionalityChanges: [], breakingChanges: [], nonBreakingChanges: [], confidence: "high", changes: [] } as any,
          works: [] as any,
          sourceCode: source,
          filePath: file,
        },
        opts.ai,
      );
      console.log(`[AI] confidence=${result.confidence} — ${result.explanation.slice(0, 80)}`);
      if (opts.dryRun) {
        console.log("[DRY-RUN] Fixed code preview:\n", result.fixedCode.slice(0, 300));
      } else {
        // Write patched file, validate via build
        const patched = result.fixedCode;
        if (!patched.endsWith("\n")) {
          // preserve newline
        }
        // Would write and run npm run build here, then push PR
        console.log(`[WRITE] ${file} → ${patched.length} chars`);
      }
    } catch (e) {
      console.error(`[AI] failed for ${file}:`, (e as Error).message);
    }
  }

  if (!opts.dryRun) {
    console.log(`[PR] Would create branch driftlock/${change.provider}-${change.fromVersion}-to-${change.toVersion} and PR via FixPRRunner`);
  }
}
