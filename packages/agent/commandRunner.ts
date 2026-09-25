import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxRunner } from "@driftlock/sandbox";
import { isAllowedCommand, allowedCommands, type ToolResult } from "./executor";

export interface CommandRunner {
    run(root: string, command: string): Promise<ToolResult>;
}

export type SandboxRunnerLike = Pick<SandboxRunner, "runTestSuite">;

export type SandboxCommandRunnerOptions = {
    image?: string;
    timeoutMs?: number;
    memoryLimit?: string;
    cpuLimit?: number;
    copyNodeModules?: boolean;
    runner?: SandboxRunnerLike;
};

export const DEFAULT_SANDBOX_IMAGE = "node:22-alpine";
const EXCLUDED = new Set([".git"]);

export async function copyWorkspace(root: string): Promise<string> {
    const workspace = await mkdtemp(join(tmpdir(), "driftlock-sandbox-"));
    await cp(root, workspace, {
        recursive: true,
        filter: (source) => {
            const name = source.split("/").pop() ?? "";
            return !(EXCLUDED.has(name) && source !== root);
        },
    });
    return workspace;
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Runs a whitelisted verification command in a Docker container against a
 * throwaway copy of the repository, with no network. The real checkout is
 * never mounted writable, so a build script cannot modify the user's files,
 * read the host home directory, or reach the internet.
 */
export function createSandboxCommandRunner(
    options: SandboxCommandRunnerOptions = {},
): CommandRunner {
    const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
    const timeout = options.timeoutMs ?? 300_000;
    const memoryLimit = options.memoryLimit ?? "2g";
    const cpuLimit = options.cpuLimit ?? 2;
    const shareNodeModules = options.copyNodeModules ?? true;
    const runner = options.runner ?? new SandboxRunner();

    return {
        run: async (root, command) => {
            if (!isAllowedCommand(command)) {
                return {
                    ok: false,
                    output: `Command not allowed: ${command.trim()}. Allowed commands: ${allowedCommands().join(", ")}`,
                };
            }

            let workspace: string | null = null;
            try {
                workspace = await copyWorkspace(root);

                const extraBinds: string[] = [];
                if (shareNodeModules && (await isDirectory(join(root, "node_modules")))) {
                    extraBinds.push(`${join(root, "node_modules")}:/workspace/node_modules:ro`);
                }

                const result = await runner.runTestSuite(workspace, {
                    image,
                    command: command.trim().split(/\s+/),
                    env: { CI: "1" },
                    timeout,
                    memoryLimit,
                    cpuLimit,
                    networkEnabled: false,
                    allowedEndpoints: [],
                    readOnly: false,
                    extraBinds,
                });

                const output = [
                    `sandbox: ${image}, network disabled`,
                    `exit code: ${result.exitCode}`,
                    result.stdout,
                    result.stderr,
                ]
                    .filter((part) => part.length > 0)
                    .join("\n");

                return { ok: result.exitCode === 0, output };
            } catch (error) {
                return {
                    ok: false,
                    output: `Sandbox failed: ${error instanceof Error ? error.message : String(error)}`,
                };
            } finally {
                if (workspace) {
                    await rm(workspace, { recursive: true, force: true });
                }
            }
        },
    };
}
