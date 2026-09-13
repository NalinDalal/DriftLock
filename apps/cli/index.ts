import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { TypeScriptExtractor } from "@driftlock/parser";
import { Agent } from "@driftlock/agent";
import { SandboxRunner } from "@driftlock/sandbox";
import { GitTracker } from "@driftlock/git";

const program = new Command();

program
    .name("driftlock")
    .description("API drift detection and fix generation")
    .version("0.1.0");

program
    .command("analyze")
    .description("Analyze codebase for API call sites")
    .argument("<path>", "Path to analyze")
    .option("-o, --output <format>", "Output format (json, table)", "table")
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
    .description("Run tests in sandbox environment")
    .argument("<path>", "Path to test")
    .option("-c, --command <cmd>", "Test command to run", "npm test")
    .option("-t, --timeout <ms>", "Timeout in milliseconds", "300000")
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
                    networkEnabled: true,
                    allowedEndpoints: ["api.stripe.com:443"],
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
    .description("Compare API snapshots")
    .argument("<path>", "Repository path")
    .option("-b, --base <branch>", "Base branch to compare", "main")
    .action(async (path: string, options: { base: string }) => {
        const spinner = ora("Comparing snapshots...").start();

        try {
            const tracker = new GitTracker(path);
            const changes = await tracker.detectChanges();

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
    .description("Generate fix suggestions")
    .argument("<path>", "Repository path")
    .option("-k, --api-key <key>", "OpenAI API key")
    .action(async (path: string, options: { apiKey?: string }) => {
        const spinner = ora("Generating fix suggestions...").start();

        try {
            const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error(
                    "OpenAI API key is required. Use --api-key or set OPENAI_API_KEY",
                );
            }

            const agent = new Agent(apiKey);
            const tracker = new GitTracker(path);
            const extractor = new TypeScriptExtractor();

            // Get current changes
            const changes = await tracker.detectChanges();
            console.log(chalk.bold("\nAnalyzing changes..."));

            // For each modified file, analyze potential drift
            for (const file of changes.modified) {
                console.log(chalk.cyan(`\nAnalyzing ${file}...`));

                // This is a simplified example - in production, you'd compare snapshots
                // and generate fixes based on actual drift detection
            }

            spinner.succeed("Fix suggestions generated");
            console.log(chalk.bold.green("\nFix generation complete"));
            console.log(
                chalk.dim(
                    "Note: This is a simplified demo. Full implementation requires snapshot comparison.",
                ),
            );
        } catch (error) {
            spinner.fail("Fix generation failed");
            console.error(error);
            process.exit(1);
        }
    });

program
    .command("init")
    .description("Initialize DriftLock configuration")
    .action(async () => {
        const spinner = ora("Initializing DriftLock...").start();

        try {
            const answers = await inquirer.prompt([
                {
                    type: "input",
                    name: "openaiApiKey",
                    message: "OpenAI API key:",
                    validate: (input: string) =>
                        input.length > 0 || "API key is required",
                },
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
openaiApiKey: ${answers.openaiApiKey}
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
