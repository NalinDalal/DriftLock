#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { TypeScriptExtractor, detectLanguage } from "@driftlock/parser";
import { SandboxRunner } from "@driftlock/sandbox";
import { GitTracker } from "@driftlock/git";
import { analyzeAndCompare, applyDriftFix } from "@driftlock/pipeline";
import type { CallSite, Fix } from "@driftlock/core";
import type { DriftResult } from "@driftlock/pipeline";
import { SnapshotStore, commitBaselines } from "./drift";
import { aiConfigFromEnv } from "./aiEnv";
import { harToConsumerContract } from "@driftlock/webhookCapture";
import { runMigrate } from "./migrate";
import { runWatch } from "./watch";

const program = new Command();

program
    .name("driftlock")
    .description("Self-maintaining APIs. Detect drift, generate fix PRs")
    .version("0.1.0")
    .addHelpText(
        "after",
        `
Examples:
  $ driftlock analyze ./src
  $ driftlock test ./repo --command "npm test"
  $ driftlock diff ./repo --base main
  $ driftlock fix ./repo --repo owner/repo --dry-run
  $ driftlock watch stripe
  $ driftlock watch stripe --trigger --repo owner/repo
  $ driftlock init
`,
    );

program
    .command("analyze")
    .description("Scan codebase for API call sites (Stripe, Twilio, etc.)")
    .argument("<path>", "Directory to scan for TypeScript/JavaScript files")
    .option("-o, --output <format>", "Output format (json, table)", "table")
    .addHelpText(
        "after",
        `
Scans your codebase using AST analysis to find all API call sites.
Detects any <client>.<resource>.<method> call on a configured SDK client
(Stripe, Twilio, and any vendor shipped as a VendorConfig).
Scans TypeScript (.ts/.tsx) and plain JavaScript (.js/.jsx/.mjs/.cjs).

Output formats:
  json   Machine-readable JSON with call sites and errors
  table  Human-readable table with file locations and endpoints
`,
    )
    .action(async (path: string, options: { output: string }) => {
        const spinner = ora("Analyzing codebase...").start();

try {
                const extractor = new TypeScriptExtractor();

                // Read all source files (TypeScript + plain JS)
                const files = readdirSync(path, { recursive: true })
                    .filter(
                        (file): file is string =>
                            typeof file === "string" &&
                            /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file),
                    );

                const allCallSites = [];
                const errors = [];

                for (const file of files) {
                    const filePath = join(path, file);
                    const content = readFileSync(filePath, "utf-8");
                const result = await extractor.extractFromFile(
                    filePath,
                    content,
                    detectLanguage(filePath),
                );
                allCallSites.push(...result.callSites);
                errors.push(...result.errors);
            }

            spinner.succeed(`Found ${allCallSites.length} API call sites`);

            if (options.output === "json") {
                console.log(
                    JSON.stringify(
                        { callSites: allCallSites, errors },
                        null,
                        2,
                    ),
                );
            } else {
                console.log(chalk.bold("\nAPI Call Sites:"));
                for (const site of allCallSites) {
                    console.log(
                        `  ${chalk.cyan(site.filePath)}:${chalk.yellow(site.line)}`,
                    );
                    console.log(
                        `    ${chalk.green(site.method)} → ${chalk.blue(
                            site.endpoint ?? "pending-capture",
                        )}`,
                    );
                    console.log(`    HTTP: ${site.httpMethod ?? "unknown"}`);
                    console.log("");
                }

                if (errors.length > 0) {
                    console.log(chalk.bold.red("\nErrors:"));
                    for (const error of errors) {
                        console.log(
                            `  ${chalk.red(error.file)}:${chalk.yellow(error.line)} - ${error.message}`,
                        );
                    }
                }
            }
        } catch (error) {
            spinner.fail("Analysis failed");
            console.error(error);
            process.exit(1);
        }
    });

program
    .command("test")
    .description("Run tests in isolated Docker sandbox with traffic capture")
    .argument("<path>", "Repository path to test")
    .option("-c, --command <cmd>", "Test command to run", "npm test")
    .option("-t, --timeout <ms>", "Timeout in milliseconds", "300000")
    .addHelpText(
        "after",
        `
Runs your test suite in an isolated Docker container with resource limits.
Captures HTTP traffic to detect which tests hit real APIs vs mocks.

The sandbox ensures:
  - Network isolation (only allowed endpoints)
  - Resource limits (CPU, memory)
  - Reproducible environments
`,
    )
    .action(
        async (path: string, options: { command: string; timeout: string }) => {
            const spinner = ora("Running tests in sandbox...").start();

            try {
                const runner = new SandboxRunner();
                const result = await runner.runTestSuite(path, {
                    image: "node:20-slim",
                    command: ["sh", "-c", options.command],
                    env: {},
                    timeout: parseInt(options.timeout, 10),
                    memoryLimit: "512m",
                    cpuLimit: 1.0,
                    networkEnabled: false,
                    allowedEndpoints: [],
                });

                if (result.exitCode === 0) {
                    spinner.succeed(`Tests passed (${result.duration}ms)`);
                } else {
                    spinner.fail(
                        `Tests failed with exit code ${result.exitCode}`,
                    );
                }

                console.log(chalk.bold("\nStdout:"));
                console.log(result.stdout);

                if (result.stderr) {
                    console.log(chalk.bold.red("\nStderr:"));
                    console.log(result.stderr);
                }

                console.log(chalk.bold("\nTraffic Captured:"));
                console.log(`  ${result.trafficCaptured.length} requests`);
            } catch (error) {
                spinner.fail("Sandbox test failed");
                console.error(error);
                process.exit(1);
            }
        },
    );

program
    .command("diff")
    .description("Compare API snapshots between branches or over time")
    .argument("<path>", "Repository path")
    .option("-b, --base <branch>", "Base branch to compare against")
    .addHelpText(
        "after",
        `
Detects file changes in your repository and identifies which
API call sites are affected by those changes.

Use this to understand the impact of a branch before merging.
`,
    )
    .action(async (path: string, options: { base?: string }) => {
        const spinner = ora("Comparing snapshots...").start();

        try {
            const tracker = new GitTracker(path);
            const changes = await tracker.detectChanges(options.base);

            spinner.succeed("Snapshot comparison complete");

            console.log(chalk.bold("\nChanges:"));
            console.log(
                `  ${chalk.green("+ Added:")} ${changes.added.length} files`,
            );
            console.log(
                `  ${chalk.yellow("~ Modified:")} ${changes.modified.length} files`,
            );
            console.log(
                `  ${chalk.red("- Deleted:")} ${changes.deleted.length} files`,
            );
            console.log(
                `  ${chalk.blue("→ Renamed:")} ${changes.renamed.length} files`,
            );

            if (changes.added.length > 0) {
                console.log(chalk.bold.green("\nAdded Files:"));
                for (const file of changes.added) {
                    console.log(`  + ${file}`);
                }
            }

            if (changes.modified.length > 0) {
                console.log(chalk.bold.yellow("\nModified Files:"));
                for (const file of changes.modified) {
                    console.log(`  ~ ${file}`);
                }
            }

            if (changes.deleted.length > 0) {
                console.log(chalk.bold.red("\nDeleted Files:"));
                for (const file of changes.deleted) {
                    console.log(`  - ${file}`);
                }
            }
        } catch (error) {
            spinner.fail("Diff comparison failed");
            console.error(error);
            process.exit(1);
        }
    });

program
    .command("fix")
    .description("Detect API drift and suggest static fixes")
    .argument("<path>", "Repository path")
    .option("-b, --base <branch>", "Base branch to compare", "main")
    .option("-r, --repo <repo>", "GitHub repo (owner/repo) for the migration-agent PR flow")
    .option("-c, --command <cmd>", "Test command to run for capture", "npm test")
    .option(
        "--forward <pattern>",
        "Forward a normally-intercepted endpoint, e.g. POST /v3/mail/send (repeatable)",
        (value: string, previous: string[]) => [...previous, value],
        [],
    )
    .option("--dry-run", "Show affected call sites and suggested fixes (nothing is pushed)")
    .option("--json", "Print a machine-readable summary as the last stdout line (for CI)")
    .option(
        "--commit-baselines",
        "Commit changed .driftlock/ snapshots and push to the base branch (for scheduled CI, so the next run compares instead of re-baselining)",
    )
    .addHelpText(
        "after",
        `
The core DriftLock loop:
  1. Scans for API call sites in your codebase
  2. Runs your test suite in a sandbox through a traffic-capture proxy
  3. First run establishes a baseline snapshot (.driftlock/snapshots)
  4. Later runs compare captured shapes against the baseline to detect drift
  5. Generates deterministic fixes (renames, null checks, coercions) and
     prints them as suggestions with diffs. Never opens PRs: run the
     migration agent (packages/agent) for a verified PR.

Environment variables:
  AI_PROVIDER     Optional model fixes: openai, anthropic, gemini, cloudflare
  AI_API_KEY      API key for openai/anthropic (GEMINI_API_KEY and
  AI_MODEL        CLOUDFLARE_API_TOKEN take precedence per provider)

With --json, the last stdout line is always a JSON summary:
  {"callSites":N,"drifts":N,"fixes":N,"prs":[...],"baselines":N,"pendingCapture":N,"baselinesCommitted":true|false}

Examples:
  $ driftlock fix ./repo --dry-run
  $ driftlock fix ./repo --command "bun test"
  $ driftlock fix ./repo --dry-run --json 2>/dev/null | tail -n 1 | jq .
`,
    )
    .action(
        async (
            repoPath: string,
            options: {
                base?: string;
                repo?: string;
                dryRun?: boolean;
                command?: string;
                forward?: string[];
                json?: boolean;
                commitBaselines?: boolean;
            },
        ) => {
            const emitSummary = (summary: Record<string, unknown>) => {
                if (options.json) {
                    console.log(JSON.stringify(summary));
                }
            };
            const spinner = ora("Starting drift detection...").start();

            try {
                // Step 1-3: analyze, capture, compare against baseline
                const store = new SnapshotStore(repoPath);
                spinner.text = "Scanning for API call sites...";
                const result = await analyzeAndCompare({
                    repoPath,
                    command: options.command ?? "npm test",
                    forward: options.forward ?? [],
                    timeoutMs: 300000,
                    snapshotStore: store,
                });

                const allCallSites = result.callSites;
                const shapes = result.shapes;

                // Model fixes when AI credentials are present, otherwise the
                // deterministic path (same single fix path, see @driftlock/aiFix).
                const ai = aiConfigFromEnv();
                if (ai) {
                    console.log(chalk.dim(`Model fixes enabled (${ai.provider}${ai.model ? `:${ai.model}` : ""})`));
                }

                if (allCallSites.length === 0) {
                    spinner.warn("No API call sites found");
                    emitSummary({ callSites: 0, drifts: 0, fixes: 0, prs: [], baselines: 0, pendingCapture: 0 });
                    return;
                }

                spinner.text = `Captured traffic for ${shapes.size}/${allCallSites.length} call sites (${result.fills.size} endpoints inferred from traffic)`;

                const drifts = result.drifts;
                const baselines = result.baselines;
                const pendingCapture = result.pendingCapture;
                const noTraffic = result.trafficCaptured === 0;
                if (noTraffic) {
                    console.log(
                        chalk.yellow(
                            `\nNo API traffic captured through the proxy, so baselines are impossible for ${pendingCapture.length} of ${allCallSites.length} call site(s). Make the test suite exercise them, then re-run.`,
                        ),
                    );
                } else if (pendingCapture.length > 0) {
                    console.log(
                        chalk.dim(
                            `\n${pendingCapture.length} call site(s) produced no traffic and stay pending capture.`,
                        ),
                    );
                }
                spinner.text = `Comparing ${result.trafficCaptured} captured requests against baseline`;

                if (baselines.length > 0) {
                    console.log(chalk.bold("\nBaseline snapshots captured:"));
                    for (const cs of baselines) {
                        console.log(
                            `  ${chalk.cyan(cs.filePath)}:${chalk.yellow(cs.line)} (${chalk.green(cs.method)})`,
                        );
                    }
                    console.log(
                        chalk.dim(
                            "\nRe-run after the vendor API changes to detect drift.",
                        ),
                    );
                }

                // Persist baselines where the next run can see them. On
                // ephemeral CI checkouts the snapshots die with the job
                // unless committed back, and every run would re-baseline.
                const commitIfEnabled = async () =>
                    options.commitBaselines
                        ? await commitBaselines(resolve(repoPath), options.base ?? "main")
                        : { committed: false, pushed: false };

                if (drifts.length === 0) {
                    if (noTraffic) {
                        spinner.warn(
                            "No traffic captured, nothing to baseline or compare",
                        );
                    } else if (baselines.length === 0) {
                        spinner.succeed("No drift detected");
                    } else {
                        spinner.succeed(
                            "Baseline captured, no comparison yet",
                        );
                    }
                    const baselineCommit = await commitIfEnabled();
                    emitSummary({
                        callSites: allCallSites.length,
                        drifts: 0,
                        fixes: 0,
                        prs: [],
                        baselines: baselines.length,
                        pendingCapture: pendingCapture.length,
                        baselinesCommitted: baselineCommit.pushed,
                    });
                    return;
                }

                spinner.succeed(
                    `Detected drift at ${drifts.length} call site(s)`,
                );

                // Step 4: Apply fixes (deterministic, upgraded to model fixes
                // when AI credentials are configured)
                const fixes: Array<{
                    callSite: CallSite;
                    drift: DriftResult;
                    fix: Fix;
                }> = [];
                for (const drift of drifts) {
                    // Extractor filePaths may be absolute or repo-relative;
                    // join() on an absolute second half silently builds a
                    // nonexistent path, so resolve absolutely first.
                    const file = isAbsolute(drift.callSite.filePath)
                        ? drift.callSite.filePath
                        : join(repoPath, drift.callSite.filePath);
                    let content: string;
                    try {
                        content = readFileSync(file, "utf8");
                    } catch {
                        content = "";
                    }
                    if (!content.trim()) {
                        console.log(
                            chalk.yellow(
                                `  ${drift.callSite.filePath}:${drift.callSite.line}: cannot read source, skipping fix`,
                            ),
                        );
                        continue;
                    }
                    const applied = await applyDriftFix(drift, content, { ai });
                    if (!applied) {
                        console.log(
                            chalk.yellow(
                                `  ${drift.callSite.filePath}:${drift.callSite.line}: no static fix applicable`,
                            ),
                        );
                        continue;
                    }
                    fixes.push({
                        callSite: drift.callSite,
                        drift,
                        fix: applied.fix,
                    });
                    console.log(
                        chalk.bold(
                            `\n${chalk.cyan(drift.callSite.filePath)}:${chalk.yellow(drift.callSite.line)}`,
                        ),
                    );
                    console.log(
                        `  ${chalk.green(drift.callSite.method)} → ${chalk.blue(
                            drift.callSite.endpoint ?? "pending-capture",
                        )}`,
                    );
                    console.log(
                        `  ${chalk.yellow("Fix:")} ${applied.fix.description}`,
                    );
                    console.log(
                        `  ${chalk.dim(applied.fix.diff)}`,
                    );
                }

                if (fixes.length === 0) {
                    spinner.succeed("No statically applicable fixes");
                    emitSummary({
                        callSites: allCallSites.length,
                        drifts: drifts.length,
                        fixes: 0,
                        prs: [],
                        baselines: baselines.length,
                        pendingCapture: pendingCapture.length,
                    });
                    return;
                }

                // Step 5: Create PR (if not dry run and repo is provided)
                if (options.dryRun) {
                    console.log(
                        chalk.yellow(
                            "\nDry run, skipping PR creation. Remove --dry-run to create PRs.",
                        ),
                    );
                    emitSummary({
                        callSites: allCallSites.length,
                        drifts: drifts.length,
                        fixes: fixes.length,
                        prs: [],
                        baselines: baselines.length,
                        pendingCapture: pendingCapture.length,
                    });
                    return;
                }

                if (!options.repo) {
                    console.log(
                        chalk.yellow(
                            "\nNo --repo specified. Skipping PR creation. Use --repo owner/repo to create PRs.",
                        ),
                    );
                    emitSummary({
                        callSites: allCallSites.length,
                        drifts: drifts.length,
                        fixes: fixes.length,
                        prs: [],
                        baselines: baselines.length,
                        pendingCapture: pendingCapture.length,
                    });
                    return;
                }

                // Agent-only mode: static fixes are suggestions, never PRs.
                // A regex rewrite cannot know per-repo semantics, so opening
                // a PR here is how wrong PRs shipped. Run the migration
                // agent (packages/agent) to get a verified PR instead.
                console.log(
                    chalk.yellow(
                        "\nAgent-only mode: --repo PR creation from static fixes is disabled. Review the suggestions above and run the migration agent for a verified PR.",
                    ),
                );
                const baselineCommit = await commitIfEnabled();
                emitSummary({
                    callSites: allCallSites.length,
                    drifts: drifts.length,
                    fixes: fixes.length,
                    prs: [],
                    baselines: baselines.length,
                    pendingCapture: pendingCapture.length,
                    baselinesCommitted: baselineCommit.pushed,
                });
                return;
            } catch (error) {
                spinner.fail("Fix generation failed");
                console.error(error);
                process.exit(1);
            }
        },
    );

program
    .command("init")
    .description("Initialize DriftLock configuration in current directory")
    .addHelpText(
        "after",
        `
Creates a .driftlock.yml configuration file with:
  - Test command (default: npm test)
  - HTTPS proxy settings for traffic capture
  - Sandbox configuration (Docker image, resource limits)

Environment variables:
  OPENAI_API_KEY   Required for AI-powered fix generation
`,
    )
    .action(async () => {
        const spinner = ora("Initializing DriftLock...").start();

        try {
            const answers = await inquirer.prompt([
                {
                    type: "input",
                    name: "testCommand",
                    message: "Test command:",
                    default: "npm test",
                },
                {
                    type: "confirm",
                    name: "enableProxy",
                    message: "Enable HTTPS proxy for traffic capture?",
                    default: true,
                },
            ]);

            // Create .driftlock.yml
            const config = `
# Supply credentials through the OPENAI_API_KEY environment variable, never this file.
testCommand: ${answers.testCommand}
enableProxy: ${answers.enableProxy}
sandbox:
  image: node:20-slim
  memoryLimit: 512m
  cpuLimit: 1.0
  timeout: 300000
`.trimStart();

            writeFileSync(".driftlock.yml", config);

            spinner.succeed("DriftLock initialized");
            console.log(chalk.green("Created .driftlock.yml"));
        } catch (error) {
            spinner.fail("Initialization failed");
            console.error(error);
            process.exit(1);
        }
    });

program
    .command("capture")
    .description("Turn HAR traffic into a consumer contract (SpecShield bdct capture from-har)")
    .option("--har <path>", "Input HAR file (HAR 1.2)")
    .option("--base-url <url>", "Keep only entries matching URL prefix")
    .option("--out <path>", "Output file (yaml/json), defaults to stdout")
    .action(async (opts: { har: string; baseUrl?: string; out?: string }) => {
        if (!opts.har) {
            console.error(chalk.red("Missing --har <path>"));
            process.exit(1);
        }
        const spinner = ora("Capturing HAR…").start();
        try {
            const har = JSON.parse(readFileSync(opts.har, "utf8"));
            const result = harToConsumerContract(har, { baseUrl: opts.baseUrl });
            const out = JSON.stringify(result, null, 2);
            if (opts.out) {
                writeFileSync(opts.out, out);
                spinner.succeed(`Wrote consumer contract ${result.stats.kept}/${result.stats.total} entries → ${opts.out}`);
            } else {
                spinner.stop();
                console.log(out);
            }
        } catch (e) {
            spinner.fail("Capture failed");
            console.error(e);
            process.exit(1);
        }
    });

program
    .command("migrate")
    .description("Migrate a repo via ProviderChange (p5 1.11→2.3 wedge)")
    .requiredOption("--repo <owner/repo>", "GitHub repo (owner/repo) or local path")
    .requiredOption("--change <path>", "ProviderChange JSON file")
    .option("--dry-run", "Don't push, just show patch")
    .action(async (opts: { repo: string; change: string; dryRun?: boolean }) => {
        const ai = process.env.CLOUDFLARE_API_TOKEN
            ? { provider: "cloudflare" as const, apiKey: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "" }
            : process.env.AI_API_KEY
              ? { provider: "openai" as const, apiKey: process.env.AI_API_KEY }
              : undefined;
        await runMigrate({ repo: opts.repo, changePath: opts.change, dryRun: opts.dryRun, ai });
    });

program
    .command("watch")
    .description("Poll a vendor spec for breaking changes, optionally triggering migration")
    .argument("<provider>", "Vendor to watch (stripe, twilio, p5)")
    .option("--version <v>", "Version label recorded on the baseline", "latest")
    .option("--baselines-dir <dir>", "Where polled baselines live", ".driftlock/vendor-baselines")
    .option("--repo <owner/repo|path>", "With --trigger: repo to migrate")
    .option("--trigger", "Run the migration agent when members are removed")
    .option("--base <branch>", "Base branch for triggered PRs", "main")
    .option("--model <name>", "Model for the triggered agent (or DRIFTLOCK_MODEL)")
    .option("--tier <free|pro>", "Subscription tier (or DRIFTLOCK_PLAN)", process.env.DRIFTLOCK_PLAN ?? "pro")
    .option("--model-provider <name>", "Model provider (or DRIFTLOCK_MODEL_PROVIDER)", process.env.DRIFTLOCK_MODEL_PROVIDER ?? "openai")
    .addHelpText(
        "after",
        `
Polls the vendor's published spec and diffs it against the stored baseline.
Exit codes: 0 no breaking change, 1 vendor removed members, 2 poll failed.

  $ driftlock watch stripe
  $ driftlock watch stripe --trigger --repo owner/repo
`,
    )
    .action(
        async (
            provider: string,
            opts: {
                version: string;
                baselinesDir: string;
                repo?: string;
                trigger?: boolean;
                base: string;
                model?: string;
                tier: string;
                modelProvider: string;
            },
        ) => {
            const code = await runWatch({
                provider,
                version: opts.version,
                baselinesDir: opts.baselinesDir,
                repo: opts.repo,
                trigger: opts.trigger,
                base: opts.base,
                model: opts.model,
                tier: opts.tier,
                modelProvider: opts.modelProvider,
            });
            process.exitCode = code;
        },
    );

program.parse();
