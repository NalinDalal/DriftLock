import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { TypeScriptExtractor } from "@driftlock/parser";
import { SandboxRunner } from "@driftlock/sandbox";
import { GitTracker, PRGenerator } from "@driftlock/git";
import { Agent } from "@driftlock/agent";

const program = new Command();

program
    .name("driftlock")
    .description("Self-maintaining APIs — detect drift, generate fix PRs")
    .version("0.1.0")
    .addHelpText(
        "after",
        `
Examples:
  $ driftlock analyze ./src
  $ driftlock test ./repo --command "npm test"
  $ driftlock diff ./repo --base main
  $ driftlock fix ./repo --repo owner/repo --dry-run
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
Currently supports Stripe SDK calls (stripe.charges.create, etc.).

Output formats:
  json   — Machine-readable JSON with call sites and errors
  table  — Human-readable table with file locations and endpoints
`,
    )
    .action(async (path: string, options: { output: string }) => {
        const spinner = ora("Analyzing codebase...").start();

        try {
            const extractor = new TypeScriptExtractor();
            const fs = await import("fs");
            const pathModule = await import("path");

            // Read all TypeScript files
            const files = fs
                .readdirSync(path, { recursive: true })
                .filter(
                    (file): file is string =>
                        typeof file === "string" && file.endsWith(".ts"),
                );

            const allCallSites = [];
            const errors = [];

            for (const file of files) {
                const filePath = pathModule.join(path, file);
                const content = fs.readFileSync(filePath, "utf-8");
                const result = await extractor.extractFromFile(
                    filePath,
                    content,
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
                        `    ${chalk.green(site.method)} → ${chalk.blue(site.endpoint)}`,
                    );
                    console.log(`    HTTP: ${site.httpMethod}`);
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
    .description("Detect API drift and generate fix PRs")
    .argument("<path>", "Repository path")
    .option("-b, --base <branch>", "Base branch to compare", "main")
    .option("-r, --repo <repo>", "GitHub repo (owner/repo) for PR creation")
    .option("--dry-run", "Show affected call sites without creating PRs")
    .addHelpText(
        "after",
        `
The core DriftLock loop:
  1. Scans for API call sites in your codebase
  2. Detects changes against the base branch
  3. Identifies affected call sites
  4. Generates fix suggestions
  5. Creates a PR with the fix (if --repo is provided)

Environment variables:
  GITHUB_TOKEN    Required for PR creation (not needed for --dry-run)

Examples:
  $ driftlock fix ./repo --dry-run
  $ driftlock fix ./repo --repo owner/repo
  $ driftlock fix ./repo --base develop --repo owner/repo
`,
    )
    .action(
        async (
            repoPath: string,
            options: { base?: string; repo?: string; dryRun?: boolean },
        ) => {
            const spinner = ora("Starting drift detection...").start();

            try {
                // Step 1: Scan for call sites
                spinner.text = "Scanning for API call sites...";
                const extractor = new TypeScriptExtractor();
                const fs = await import("fs");
                const pathModule = await import("path");

                const files = fs
                    .readdirSync(repoPath, { recursive: true })
                    .filter(
                        (file): file is string =>
                            typeof file === "string" &&
                            (file.endsWith(".ts") || file.endsWith(".js")),
                    );

                const allCallSites = [];
                for (const file of files) {
                    const filePath = pathModule.join(repoPath, file);
                    const content = fs.readFileSync(filePath, "utf-8");
                    const result = await extractor.extractFromFile(
                        filePath,
                        content,
                    );
                    allCallSites.push(...result.callSites);
                }

                spinner.text = `Found ${allCallSites.length} API call sites`;

                if (allCallSites.length === 0) {
                    spinner.warn("No API call sites found");
                    return;
                }

                // Step 2: Detect changes
                spinner.text = "Detecting changes...";
                const tracker = new GitTracker(repoPath);
                const changes = await tracker.detectChanges(options.base);
                const totalChanges =
                    changes.added.length +
                    changes.modified.length +
                    changes.deleted.length;

                if (totalChanges === 0) {
                    spinner.succeed("No changes detected");
                    return;
                }

                spinner.text = `Found ${totalChanges} changed files`;

                // Step 3: Generate fixes (placeholder - would use Agent in production)
                spinner.text = "Generating fixes...";
                const fixes = allCallSites
                    .filter((cs) =>
                        changes.modified.some(
                            (m) =>
                                m.includes(cs.filePath) ||
                                cs.filePath.includes(m),
                        ),
                    )
                    .map((cs) => ({
                        callSite: cs,
                        fix: {
                            id: `fix-${cs.id}`,
                            driftEventId: `drift-${cs.id}`,
                            type: "field_rename" as const,
                            description: `Update ${cs.method} call in ${cs.filePath}`,
                            diff: `@@ -1,1 +1,1 @@\n-${cs.method}(${JSON.stringify(cs.requestShape)})\n+${cs.method}(${JSON.stringify(cs.requestShape)})`,
                            confidence: "medium" as const,
                            files: [{ path: cs.filePath, changes: "" }],
                            generatedAt: new Date(),
                        },
                    }));

                if (fixes.length === 0) {
                    spinner.succeed("No affected call sites found in changes");
                    return;
                }

                spinner.text = `Generated ${fixes.length} fix suggestions`;

                // Step 4: Show results
                spinner.succeed(`Found ${fixes.length} affected call sites`);

                console.log(chalk.bold("\nAffected Call Sites:"));
                for (const { callSite, fix } of fixes) {
                    console.log(
                        `  ${chalk.cyan(callSite.filePath)}:${chalk.yellow(callSite.line)}`,
                    );
                    console.log(
                        `    ${chalk.green(callSite.method)} → ${chalk.blue(callSite.endpoint)}`,
                    );
                    console.log(
                        `    ${chalk.yellow("Fix:")} ${fix.description}`,
                    );
                    console.log("");
                }

                // Step 5: Create PR (if not dry run and repo is provided)
                if (options.dryRun) {
                    console.log(
                        chalk.yellow(
                            "\nDry run — skipping PR creation. Remove --dry-run to create PRs.",
                        ),
                    );
                    return;
                }

                if (!options.repo) {
                    console.log(
                        chalk.yellow(
                            "\nNo --repo specified. Skipping PR creation. Use --repo owner/repo to create PRs.",
                        ),
                    );
                    return;
                }

                const [owner, repo] = options.repo.split("/");
                if (!owner || !repo) {
                    console.error(
                        chalk.red("Invalid --repo format. Use owner/repo."),
                    );
                    process.exit(1);
                }

                const githubToken = process.env.GITHUB_TOKEN;
                if (!githubToken) {
                    console.error(
                        chalk.red(
                            "GITHUB_TOKEN environment variable is required for PR creation.",
                        ),
                    );
                    process.exit(1);
                }

                const prSpinner = ora("Creating PR...").start();
                const prGenerator = new PRGenerator(githubToken);

                for (const { callSite, fix } of fixes) {
                    const prMetadata = {
                        driftEvent: {
                            id: `drift-${callSite.id}`,
                            callSiteId: callSite.id,
                            detectedAt: new Date(),
                            oldSnapshotId: "",
                            newSnapshotId: "",
                            diffSummary: {
                                addedFields: [],
                                removedFields: [],
                                typeChanges: [],
                                optionalityChanges: [],
                                breakingChanges: [fix.description],
                                nonBreakingChanges: [],
                            },
                            suggestedFix: fix,
                            confidence: fix.confidence,
                            prNumber: null,
                            status: "fix_generated" as const,
                        },
                        callSite,
                        fix,
                        files: fix.files,
                    };

                    const pr = await prGenerator.createFixPR(
                        owner,
                        repo,
                        prMetadata,
                        options.base,
                    );

                    prSpinner.succeed(`PR created: ${pr.url}`);
                }
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

            const fs = await import("fs");
            fs.writeFileSync(".driftlock.yml", config);

            spinner.succeed("DriftLock initialized");
            console.log(chalk.green("Created .driftlock.yml"));
        } catch (error) {
            spinner.fail("Initialization failed");
            console.error(error);
            process.exit(1);
        }
    });

program.parse();
