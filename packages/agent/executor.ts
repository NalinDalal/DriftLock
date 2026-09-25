import { stat } from "node:fs/promises";

export type ToolResult = { ok: boolean; output: string };

const ALLOWED_COMMANDS = new Set([
    "npm test",
    "npm run test",
    "npm run build",
    "npm run typecheck",
    "pnpm test",
    "pnpm run build",
    "pnpm run typecheck",
    "bun test",
    "bun run build",
    "bun run typecheck",
]);

const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    ".turbo",
]);

const SCANNABLE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
];

const MAX_READ_CHARS = 8000;
const MAX_COMMAND_CHARS = 4000;
const MAX_SEARCH_HITS = 200;
const MAX_FILE_LIST = 200;

const PROTECTED_PATTERNS = [
    /(?:^|\/)\.env(?:\..*)?$/,
    /(?:^|\/)\.git\/config$/,
    /(?:\.pem|\.key|\.p12|\.pfx)$/,
    /(?:^|\/)id_rsa(?:\.pub)?$/,
];

function fail(output: string): ToolResult {
    return { ok: false, output };
}

function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}\n... [truncated ${value.length - max} chars]`;
}

function isProtectedPath(filePath: string): boolean {
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function resolveInsideRoot(
    root: string,
    filePath: string,
): string | null {
    if (filePath.startsWith("/") || filePath.startsWith("~")) return null;
    if (filePath.split("/").includes("..")) return null;
    if (isProtectedPath(filePath)) return null;
    const segments: string[] = [];
    for (const segment of filePath.split("/")) {
        if (!segment || segment === ".") continue;
        segments.push(segment);
    }
    if (segments.length === 0) return null;
    return `${root}/${segments.join("/")}`;
}

async function collectSourceFiles(root: string): Promise<string[]> {
    const glob = new Bun.Glob("**/*");
    const files: string[] = [];
    for await (const entry of glob.scan({ cwd: root, onlyFiles: true })) {
        const segments = entry.split("/");
        if (segments.some((segment) => SKIP_DIRS.has(segment))) continue;
        if (!SCANNABLE_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
        files.push(entry);
        if (files.length >= 2000) break;
    }
    return files.sort();
}

export async function inspectRepo(root: string): Promise<ToolResult> {
    try {
        const files = await collectSourceFiles(root);
        const manifest = files.find((file) => file === "package.json");
        let dependencies: Record<string, string> = {};
        let packageManager = "unknown";
        let scripts: Record<string, string> = {};

        if (manifest) {
            const raw = await Bun.file(`${root}/${manifest}`).text();
            const parsed = JSON.parse(raw) as {
                packageManager?: string;
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
                scripts?: Record<string, string>;
            };
            dependencies = { ...parsed.dependencies, ...parsed.devDependencies };
            scripts = parsed.scripts ?? {};
            packageManager =
                parsed.packageManager ??
                (files.includes("pnpm-lock.yaml") ? "pnpm" : "npm");
        }

        const lockfiles = files.filter((file) =>
            /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(
                file,
            ),
        );
        const frameworks = Object.keys(dependencies).filter((name) =>
            ["next", "react", "express", "fastify", "hono", "@nestjs/core"].some(
                (f) => name === f || name.startsWith(`${f}/`),
            ),
        );

        return {
            ok: true,
            output: JSON.stringify(
                {
                    packageManager,
                    lockfiles,
                    scripts: Object.keys(scripts),
                    dependencies: Object.keys(dependencies).sort(),
                    frameworks,
                    sourceFiles: files.slice(0, MAX_FILE_LIST),
                    totalSourceFiles: files.length,
                },
                null,
                2,
            ),
        };
    } catch (error) {
        return fail(`inspectRepo failed: ${String(error)}`);
    }
}

export async function searchCode(
    root: string,
    query: string,
    path?: string,
): Promise<ToolResult> {
    if (!query.trim()) return fail("searchCode requires a non-empty query");
    const target = path ? resolveInsideRoot(root, path) : root;
    if (!target) return fail(`Invalid search path: ${path}`);

    let targetInfo;
    try {
        targetInfo = await stat(target);
    } catch {
        return fail(`Search path not found: ${path}`);
    }
    if (!targetInfo.isDirectory()) {
        return fail(`Search path is not a directory: ${path}`);
    }

    try {
        const files = await collectSourceFiles(target);
        const hits: string[] = [];
        const needle = query.toLowerCase();

        for (const relative of files) {
            if (hits.length >= MAX_SEARCH_HITS) break;
            const absolute = `${target}/${relative}`;
            const content = await Bun.file(absolute).text();
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].toLowerCase().includes(needle)) continue;
                const prefix = path ? `${path.replace(/\/$/, "")}/${relative}` : relative;
                hits.push(`${prefix}:${i + 1}: ${lines[i].trim()}`);
                if (hits.length >= MAX_SEARCH_HITS) break;
            }
        }

        if (hits.length === 0) return { ok: true, output: `No matches for "${query}"` };
        return { ok: true, output: hits.join("\n") };
    } catch (error) {
        return fail(`searchCode failed: ${String(error)}`);
    }
}

export async function readFile(
    root: string,
    filePath: string,
): Promise<ToolResult> {
    const absolute = resolveInsideRoot(root, filePath);
    if (!absolute) return fail(`Refused to read: ${filePath}`);
    const file = Bun.file(absolute);
    if (!(await file.exists())) return fail(`File not found: ${filePath}`);
    try {
        const content = await file.text();
        const numbered = content
            .split("\n")
            .map((line, index) => `${String(index + 1).padStart(5, " ")} | ${line}`)
            .join("\n");
        return { ok: true, output: truncate(numbered, MAX_READ_CHARS) };
    } catch (error) {
        return fail(`readFile failed: ${String(error)}`);
    }
}

function stripDiffPrefix(filePath: string): string | null {
    if (filePath === "/dev/null") return null;
    const match = /^[ab]\/(.+)$/.exec(filePath);
    return match ? match[1] : filePath;
}

export function patchTargets(patch: string): (string | null)[] {
    const targets: (string | null)[] = [];
    for (const line of patch.split("\n")) {
        if (line.startsWith("+++ ")) {
            targets.push(stripDiffPrefix(line.slice(4).trim()));
        }
    }
    return targets;
}

export async function editFile(
    root: string,
    filePath: string,
    patch: string,
): Promise<ToolResult> {
    const absolute = resolveInsideRoot(root, filePath);
    if (!absolute) return fail(`Refused to edit: ${filePath}`);
    if (!patch.includes("@@")) {
        return fail("editFile requires a unified diff with @@ hunk headers");
    }
    if (!/^---\s/m.test(patch) || !/^\+\+\+\s/m.test(patch)) {
        return fail("editFile requires --- and +++ file headers in the diff");
    }

    const targets = patchTargets(patch).filter((target): target is string => target !== null);
    if (patchTargets(patch).length === 0) {
        return fail("editFile could not read a target path from the diff");
    }
    if (targets.length === 0) {
        return fail("editFile cannot target /dev/null as the new file");
    }
    if (targets.some((target) => isProtectedPath(target))) {
        return fail(
            `Refused to edit: patch targets protected path ${targets.filter(isProtectedPath).join(", ")}`,
        );
    }
    const escapes = targets.filter((target) => !resolveInsideRoot(root, target));
    if (escapes.length > 0) {
        return fail(`Refused to edit: patch targets ${escapes.join(", ")}`);
    }
    const unexpected = targets.filter((target) => target !== filePath);
    if (unexpected.length > 0) {
        return fail(
            `editFile path mismatch: declared ${filePath} but the patch targets ${unexpected.join(", ")}`,
        );
    }

    const proc = Bun.spawn(["git", "apply", "--whitespace=nowarn", "-"], {
        cwd: root,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });
    proc.stdin.write(patch.endsWith("\n") ? patch : `${patch}\n`);
    proc.stdin.end();
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
        return fail(
            `editFile failed to apply patch to ${filePath}: ${truncate(stderr || stdout, 2000)}`,
        );
    }
    return { ok: true, output: `Applied patch to ${filePath}` };
}

const DENIED_ENV_KEY = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE|SESSION|COOKIE|AUTH/i;
const PASSTHROUGH_ENV = new Set([
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "SHELL",
    "TERM",
    "NODE_OPTIONS",
    "NPM_CONFIG_USERCONFIG",
    "npm_config_userconfig",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "BUN_INSTALL",
]);

export function buildSandboxEnv(
    source: Record<string, string | undefined>,
): Record<string, string> {
    const env: Record<string, string> = { CI: "1" };
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) continue;
        if (PASSTHROUGH_ENV.has(key)) {
            env[key] = value;
            continue;
        }
        if (DENIED_ENV_KEY.test(key)) continue;
        env[key] = value;
    }
    return env;
}

export function isAllowedCommand(command: string): boolean {
    return ALLOWED_COMMANDS.has(command.trim());
}

export function allowedCommands(): string[] {
    return [...ALLOWED_COMMANDS];
}

export async function runCommand(
    root: string,
    command: string,
): Promise<ToolResult> {
    if (!isAllowedCommand(command)) {
        return fail(
            `Command not allowed: ${command.trim()}. Allowed commands: ${allowedCommands().join(", ")}`,
        );
    }
    const proc = Bun.spawn(command.trim().split(/\s+/), {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: buildSandboxEnv(process.env),
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    const passed = proc.exitCode === 0;
    return {
        ok: passed,
        output: truncate(
            `exit code: ${proc.exitCode}\n${stdout}\n${stderr}`,
            MAX_COMMAND_CHARS,
        ),
    };
}

export async function collectDiffStat(root: string): Promise<string> {
    const proc = Bun.spawn(["git", "diff", "--stat"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return stdout.trim();
}

export async function hasUncommittedChanges(root: string): Promise<boolean> {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return stdout.trim().length > 0;
}

export async function isGitRepository(root: string): Promise<boolean> {
    const proc = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return proc.exitCode === 0 && stdout.trim() === "true";
}
