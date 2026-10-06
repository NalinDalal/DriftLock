import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Octokit } from "octokit";
import {
    diffShapes,
    fixWorksForDiff,
    type FixWork,
    type ShapeDiffResult,
    type Shape,
    type ShapeNode,
} from "@driftlock/diff";
import { PRWriter, type WriteFile } from "@driftlock/git";
import { resolveFixedSource, type AIFixConfig } from "@driftlock/aiFix";
import type { DriftAlert } from "./driftDetector";
import type { FlatSchema } from "./schemaFlattener";

export interface WebhookPRInput {
    owner: string;
    repo: string;
    base: string;
    repoPath: string;
    alert: DriftAlert;
    token: string;
    ai?: AIFixConfig;
}

export interface WebhookPRResult {
    status: "opened" | "already_open" | "no_fixable_files" | "no_matches";
    url?: string;
    number?: number;
    branch?: string;
    filesChanged: string[];
}

function flatToShape(flat: FlatSchema): Shape {
    const shape: Shape = {};
    for (const [path, kind] of Object.entries(flat)) {
        shape[path] = { kind: kind as ShapeNode["kind"] };
    }
    return shape;
}

function alertToWorks(alert: DriftAlert): FixWork[] {
    const oldShape = flatToShape(alert.previous);
    const newShape = flatToShape(alert.current);

    const responseDiff: ShapeDiffResult = diffShapes(oldShape, newShape);

    return fixWorksForDiff(responseDiff);
}

/**
 * Pure content matcher behind the repo scan, exported for tests. A file is
 * affected when any work matches: renames by token, null checks by member
 * access, removals by member access OR by brace-bound leaf
 * (`const { source } = obj`, `{ source }` shorthand, `{ source: ... }`
 * keys). The brace arm closes a real miss: files that only destructure the
 * removed field never matched the dotted-access regex, so their usages
 * went unfound and no PR opened.
 */
export function contentMatchesWorks(content: string, works: FixWork[]): boolean {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const work of works) {
        if (work.kind === "field_rename" && work.from && work.to) {
            const regex = new RegExp(`(?<![\\w])${esc(work.from)}(?![\\w])`, "g");
            if (regex.test(content)) return true;
        } else if (work.kind === "null_check" && work.field) {
            const fieldParts = work.field.split(".");
            const leaf = fieldParts[fieldParts.length - 1];
            const regex = new RegExp(
                `(?<![\\w.])[\\w$]+(?:\\.[\\w$]+)*\\.${esc(leaf)}(?![\\w])`,
                "g",
            );
            if (regex.test(content)) return true;
        } else if (work.kind === "custom" && work.field) {
            const fieldParts = work.field.split(".");
            const leaf = fieldParts[fieldParts.length - 1];
            const access = new RegExp(`[\\w$]+(?:\\.[\\w$]+)*\\.${esc(leaf)}`, "g");
            // Brace-bound matches may over-match same-named keys in
            // unrelated objects; that is the safe direction for a
            // Flag-titled PR a human reviews.
            const braced = new RegExp(`[{,]\\s*${esc(leaf)}\\b`, "g");
            if (access.test(content) || braced.test(content)) return true;
        }
    }
    return false;
}

function scanForAffectedFiles(
    repoPath: string,
    works: FixWork[],
): Array<{ filePath: string; fullPath: string }> {
    const results: Array<{ filePath: string; fullPath: string }> = [];
    const seen = new Set<string>();

    const files = readdirSync(repoPath, { recursive: true })
        .filter(
            (file): file is string =>
                typeof file === "string" &&
                /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file),
        )
        .filter((file) => !file.includes("node_modules"));

    for (const file of files) {
        const fullPath = join(repoPath, file);
        let content: string;
        try {
            content = readFileSync(fullPath, "utf8");
        } catch {
            continue;
        }

        if (contentMatchesWorks(content, works) && !seen.has(fullPath)) {
            results.push({ filePath: file, fullPath });
            seen.add(fullPath);
        }
    }

    return results;
}

export async function createWebhookFixPR(
    input: WebhookPRInput,
): Promise<WebhookPRResult> {
    const works = alertToWorks(input.alert);
    if (works.length === 0) {
        return { status: "no_matches", filesChanged: [] };
    }

    const affectedFiles = scanForAffectedFiles(input.repoPath, works);
    if (affectedFiles.length === 0) {
        return { status: "no_matches", filesChanged: [] };
    }

    // Prompt context for the model: the schema diff behind `works`.
    const diff: ShapeDiffResult = {
        addedFields: input.alert.diff.added,
        removedFields: input.alert.diff.removed,
        typeChanges: input.alert.diff.typeChanged.map((c) => ({
            field: c.field,
            oldType: c.from,
            newType: c.to,
        })),
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        confidence: "high",
        changes: [],
    };

    // Single fix path: deterministic works, upgraded to a model fix when
    // configured, confident, and valid (see @driftlock/aiFix).
    const files: WriteFile[] = [];
    for (const { filePath, fullPath } of affectedFiles) {
        const content = readFileSync(fullPath, "utf8");

        const { fixed } = await resolveFixedSource({
            works,
            source: content,
            filePath,
            eventType: input.alert.eventType,
            diff,
            ai: input.ai,
        });

        if (fixed) {
            files.push({ path: filePath, content: fixed });
        }
    }

    if (files.length === 0) {
        return { status: "no_fixable_files", filesChanged: [] };
    }

    const branch = `driftlock/webhook-fix-${input.alert.endpointId.slice(0, 8)}`;
    const title = buildWebhookPRTitle(input.alert, works);
    const body = buildWebhookPRBody(input.alert, works, files);
    const commitMessage = `driftlock: fix webhook schema drift for ${input.alert.eventType}`;

    const octokit = new Octokit({ auth: input.token });
    const writer = new PRWriter(octokit);

    let result: Awaited<ReturnType<PRWriter["writeFixPR"]>>;
    try {
        result = await writer.writeFixPR({
            owner: input.owner,
            repo: input.repo,
            base: input.base,
            branch,
            title,
            body,
            commitMessage,
            files,
            octokit,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as { status?: number })?.status;
        if (status === 422 && message.includes("already exists")) {
            return {
                status: "already_open",
                branch,
                filesChanged: files.map((f) => f.path),
            };
        }
        throw error;
    }

    return {
        status: "opened",
        url: result.url,
        number: result.number,
        branch: result.branch,
        filesChanged: files.map((f) => f.path),
    };
}

export function buildWebhookPRTitle(alert: DriftAlert, works: FixWork[]): string {
    const primary = works[0];
    // A custom work comments out the removed field's usages: that flags the
    // breakage for a human, it does not fix it. The title must say Flag so
    // the PR never reads as a completed migration.
    const action =
        primary.kind === "field_rename"
            ? "Rename"
            : primary.kind === "null_check"
              ? "Add null check for"
              : primary.kind === "type_coercion"
                ? "Update type for"
                : "Flag";
    return `driftlock: ${action} ${alert.eventType} webhook handler`;
}

function buildWebhookPRBody(
    alert: DriftAlert,
    works: FixWork[],
    files: WriteFile[],
): string {
    const changes = works
        .map((w) => `- **${w.kind}:** ${w.description}`)
        .join("\n");

    const added = alert.diff.added.length
        ? `  - Added: ${alert.diff.added.join(", ")}`
        : "";
    const removed = alert.diff.removed.length
        ? `  - Removed: ${alert.diff.removed.join(", ")}`
        : "";
    const changed = alert.diff.typeChanged.length
        ? `  - Type changed: ${alert.diff.typeChanged.map((c) => `${c.field}: ${c.from}→${c.to}`).join(", ")}`
        : "";

    return `## DriftLock Webhook Schema Drift Fix

### What changed
The schema for \`${alert.eventType}\` changed:
${added}
${removed}
${changed}

### Fixes applied
${changes}

### Files changed
${files.map((f) => `- \`${f.path}\``).join("\n")}

### Schema diff
\`\`\`
Previous: ${Object.entries(alert.previous).map(([k, v]) => `${k}: ${v}`).join(", ")}
Current:  ${Object.entries(alert.current).map(([k, v]) => `${k}: ${v}`).join(", ")}
\`\`\`

---
*Generated by [DriftLock](https://github.com/nerdev-co/DriftLock). Self-maintaining APIs.*`;
}
