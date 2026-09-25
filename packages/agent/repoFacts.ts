import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Stage 0 of the migration pipeline: know what repository this is before asking
 * a model to change it.
 *
 * This runs deterministically, with no model and no network. That is the whole
 * point. A model asked to migrate a repository it has not looked at will guess
 * at the package manager, guess at the script names, and guess at the version of
 * the library being migrated. Each guess is a coin flip, and a wrong guess is
 * invisible until a command exits 127.
 *
 * Everything here is read from a file the repository already contains, so it can
 * be trusted to be true. The contract module answers "what does the vendor
 * expose"; this answers "what is this codebase". Together they are the two
 * grounding artifacts the model works from.
 */

export type Ecosystem = "npm" | "cargo" | "python" | "go" | "unknown";

export type RepoFacts = {
    ecosystem: Ecosystem;
    /** Which package manager to invoke, e.g. "npm", "pnpm", "bun", "cargo". */
    packageManager: string;
    manifests: string[];
    lockfiles: string[];
    /** Language runtime pin, from `.nvmrc`, `engines`, `.python-version`, etc. */
    runtime?: { name: string; version: string };
    /** Script name to the command it actually runs, from the manifest. */
    scripts: Record<string, string>;
    /** Declared dependency ranges, merged from dependencies and devDependencies. */
    dependencies: Record<string, string>;
    /** Versions resolved by the lockfile, which beat declared ranges. */
    resolvedVersions: Record<string, string>;
    frameworks: string[];
    /**
     * Commands CI runs, read from workflow files. These are evidence of what the
     * project considers verification. They are never auto-executed, because a
     * workflow can run anything including a deploy.
     */
    ci: { file: string; commands: string[] }[];
    /**
     * Verification commands this repository can actually run right now, ordered
     * most to least authoritative. Every entry is a real script name, so the
     * model cannot invent one and discover later that it does not exist.
     */
    verificationCommands: string[];
    sourceFiles: string[];
    totalSourceFiles: number;
    /** Non-fatal problems reading the repository, e.g. malformed JSON. */
    warnings: string[];
};

const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "coverage",
    ".turbo",
    "target",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
]);

const SOURCE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".rs",
    ".py",
    ".go",
    ".java",
    ".rb",
    ".php",
];

const MAX_SOURCE_FILES = 2000;
const MAX_LISTED_FILES = 200;

/** Script names that constitute verification, best first. */
const VERIFICATION_SCRIPTS = [
    "typecheck",
    "test",
    "build",
    "lint",
    "check",
    "verify",
] as const;

const FRAMEWORK_PACKAGES = [
    "next",
    "react",
    "vue",
    "svelte",
    "angular",
    "express",
    "fastify",
    "hono",
    "koa",
    "@nestjs/core",
    "gatsby",
    "remix",
    "astro",
    "p5",
    "three",
    "d3",
];

async function readText(path: string): Promise<string | null> {
    try {
        return await Bun.file(path).text();
    } catch {
        return null;
    }
}

async function listFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    const queue: string[] = [root];

    while (queue.length > 0) {
        const dir = queue.pop();
        if (!dir) break;
        let entries: import("node:fs").Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) queue.push(join(dir, entry.name));
                continue;
            }
            if (out.length >= MAX_SOURCE_FILES) return out.sort();
            out.push(dir === root ? entry.name : `${dir.slice(root.length + 1)}/${entry.name}`);
        }
    }
    return out.sort();
}

function isSourceFile(file: string): boolean {
    return SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext));
}

/**
 * Resolved versions out of a package-lock, which is the only npm artifact that
 * records what was actually installed rather than what was requested.
 */
function versionsFromPackageLock(
    raw: string,
    warnings: string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        const parsed = JSON.parse(raw) as {
            packages?: Record<string, { version?: string }>;
        };
        for (const [key, value] of Object.entries(parsed.packages ?? {})) {
            const name = key.match(/^node_modules\/(.+)$/)?.[1];
            if (name && value.version) out[name] = value.version;
        }
    } catch {
        warnings.push("package-lock.json is not valid JSON; using declared ranges");
    }
    return out;
}

/**
 * Resolved versions out of a Cargo.lock, for the same reason: `Cargo.toml` says
 * what is requested, the lock says what is pinned.
 */
function versionsFromCargoLock(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    let current: string | null = null;
    for (const line of raw.split("\n")) {
        const heading = line.match(/^\[\[package\]\]\s*$/);
        if (heading) {
            current = null;
            continue;
        }
        const name = line.match(/^name\s*=\s*"([^"]+)"/);
        if (name) {
            current = name[1];
            continue;
        }
        const version = line.match(/^version\s*=\s*"([^"]+)"/);
        if (version && current) out[current] = version[1];
    }
    return out;
}

/**
 * A deliberately small TOML reader for dependency tables. A full parser is not
 * worth a dependency here, and the fields that matter are all simple
 * `name = "version"` pairs inside a named table.
 *
 * Both spellings matter. A bare `serde = "1.0"` is the easy case, but
 * `tokio = { version = "1.35", features = ["full"] }` is how most real Rust
 * manifests are written, so the inline table form has to be read too or the
 * dependency silently disappears.
 */
function tomlDependencies(raw: string, section: string): Record<string, string> {
    const out: Record<string, string> = {};
    let inSection = false;
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        const heading = trimmed.match(/^\[([^\]]+)\]$/);
        if (heading) {
            inSection = heading[1].trim() === section;
            continue;
        }
        if (!inSection) continue;
        const entry = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
        if (!entry) continue;
        const bare = entry[2].match(/^"([^"]+)"/)?.[1];
        const inline = entry[2].match(/\bversion\s*=\s*"([^"]+)"/)?.[1];
        const version = bare ?? inline;
        if (version) out[entry[1]] = version;
    }
    return out;
}

async function readNpmFacts(
    root: string,
    files: string[],
    warnings: string[],
): Promise<Partial<RepoFacts>> {
    const raw = await readText(join(root, "package.json"));
    if (raw === null) return {};

    let parsed: {
        packageManager?: string;
        engines?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
    };
    try {
        parsed = JSON.parse(raw);
    } catch {
        warnings.push("package.json is not valid JSON");
        return {};
    }

    const lockfiles = files.filter((file) =>
        /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(file),
    );

    const packageManager =
        parsed.packageManager?.split("@")[0] ??
        (lockfiles.includes("pnpm-lock.yaml")
            ? "pnpm"
            : lockfiles.includes("bun.lock") || lockfiles.includes("bun.lockb")
              ? "bun"
              : lockfiles.includes("yarn.lock")
                ? "yarn"
                : "npm");

    const lockRaw = lockfiles.includes("package-lock.json")
        ? await readText(join(root, "package-lock.json"))
        : null;
    const resolvedVersions = lockRaw ? versionsFromPackageLock(lockRaw, warnings) : {};

    const nvmrc = (await readText(join(root, ".nvmrc")))?.trim();
    const runtimeVersion = nvmrc || parsed.engines?.node;

    return {
        ecosystem: "npm",
        packageManager,
        lockfiles,
        runtime: runtimeVersion
            ? { name: "node", version: runtimeVersion.replace(/^[^\d]*/, "") }
            : undefined,
        scripts: parsed.scripts ?? {},
        dependencies: {
            ...parsed.dependencies,
            ...parsed.devDependencies,
        },
        resolvedVersions,
    };
}

async function readCargoFacts(
    root: string,
    files: string[],
): Promise<Partial<RepoFacts>> {
    const raw = await readText(join(root, "Cargo.toml"));
    if (raw === null) return {};

    const lockfiles = files.includes("Cargo.lock") ? ["Cargo.lock"] : [];
    const lockRaw = lockfiles.length > 0
        ? await readText(join(root, "Cargo.lock"))
        : null;

    return {
        ecosystem: "cargo",
        packageManager: "cargo",
        lockfiles,
        scripts: {
            check: "cargo check",
            build: "cargo build",
            test: "cargo test",
        },
        dependencies: {
            ...tomlDependencies(raw, "dependencies"),
            ...tomlDependencies(raw, "dev-dependencies"),
        },
        resolvedVersions: lockRaw ? versionsFromCargoLock(lockRaw) : {},
    };
}

async function readPythonFacts(
    root: string,
    files: string[],
): Promise<Partial<RepoFacts>> {
    const manifests = [
        "pyproject.toml",
        "requirements.txt",
        "Pipfile",
    ].filter((file) => files.includes(file));
    if (manifests.length === 0) return {};

    const dependencies: Record<string, string> = {};
    const requirements = await readText(join(root, "requirements.txt"));
    if (requirements) {
        for (const line of requirements.split("\n")) {
            const match = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^\s;#]+)/);
            if (match) dependencies[match[1].toLowerCase()] = match[2];
        }
    }

    const version = (await readText(join(root, ".python-version")))?.trim();

    return {
        ecosystem: "python",
        packageManager: "python",
        lockfiles: ["poetry.lock", "uv.lock", "Pipfile.lock"].filter((file) =>
            files.includes(file),
        ),
        runtime: version ? { name: "python", version } : undefined,
        scripts: { test: "pytest" },
        dependencies,
        resolvedVersions: { ...dependencies },
    };
}

async function readGoFacts(
    root: string,
    files: string[],
): Promise<Partial<RepoFacts>> {
    if (!files.includes("go.mod")) return {};
    const raw = (await readText(join(root, "go.mod"))) ?? "";
    const dependencies: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        const match = line.match(/^\s*([\w./-]+)\s+(v[^\s/]+)/);
        if (match && !line.includes("//")) dependencies[match[1]] = match[2];
    }
    return {
        ecosystem: "go",
        packageManager: "go",
        lockfiles: files.includes("go.sum") ? ["go.sum"] : [],
        scripts: { build: "go build ./...", test: "go test ./..." },
        dependencies,
        resolvedVersions: { ...dependencies },
    };
}

/**
 * Commands CI runs, read from workflow files.
 *
 * These are surfaced as evidence and never executed. A workflow can contain a
 * publish, a migration, or a deploy, so treating it as a command to run would
 * turn a read of a file into a side effect.
 */
async function readCiCommands(
    root: string,
    files: string[],
): Promise<{ file: string; commands: string[] }[]> {
    const workflows = files.filter(
        (file) =>
            (file.startsWith(".github/workflows/") || file === ".gitlab-ci.yml") &&
            /\.(ya?ml)$/.test(file),
    );

    const out: { file: string; commands: string[] }[] = [];
    for (const file of workflows) {
        const raw = await readText(join(root, file));
        if (raw === null) continue;
        const commands: string[] = [];
        for (const line of raw.split("\n")) {
            const match = line.match(/^\s*(?:-\s*)?run:\s*(.+?)\s*$/);
            if (!match) continue;
            let value = match[1].trim();
            if (value.startsWith("|") || value.startsWith(">") || value === "") continue;
            value = value.replace(/^["']|["']$/g, "");
            if (
                /\b(test|build|typecheck|lint|check)\b/.test(value) &&
                !commands.includes(value)
            ) {
                commands.push(value);
            }
        }
        if (commands.length > 0) out.push({ file, commands });
    }
    return out;
}

/**
 * Turns real script names into runnable commands.
 *
 * The point is that the model is handed commands that are known to exist. An
 * agent that invents `npm run validate` discovers the invention only by running
 * it, and a failed exit code is a weak signal for "that was never a script".
 */
export function deriveVerificationCommands(facts: RepoFacts): string[] {
    const manager = facts.packageManager;
    const out: string[] = [];

    if (facts.ecosystem === "cargo" || facts.ecosystem === "go") {
        for (const name of Object.keys(facts.scripts)) {
            const command = facts.scripts[name];
            if (command && !out.includes(command)) out.push(command);
        }
        return out;
    }

    for (const name of VERIFICATION_SCRIPTS) {
        if (!facts.scripts[name]) continue;
        const command = name === "test" ? `${manager} test` : `${manager} run ${name}`;
        if (!out.includes(command)) out.push(command);
    }
    return out;
}

/**
 * Reads a repository and reports what it actually is.
 *
 * Never throws for a malformed or missing manifest. A repository we cannot fully
 * understand is still a repository we can migrate, and refusing would be worse
 * than proceeding with recorded warnings.
 */
export async function fingerprintRepo(root: string): Promise<RepoFacts> {
    const warnings: string[] = [];
    const files = await listFiles(root);

    const npm = await readNpmFacts(root, files, warnings);
    const cargo = await readCargoFacts(root, files);
    const python = await readPythonFacts(root, files);
    const go = await readGoFacts(root, files);

    const chosen = npm.ecosystem ? npm : cargo.ecosystem ? cargo : python.ecosystem ? python : go;
    const manifests = files.filter((file) =>
        /^(package\.json|Cargo\.toml|pyproject\.toml|requirements\.txt|Pipfile|go\.mod)$/.test(
            file,
        ),
    );

    const dependencies = chosen.dependencies ?? {};
    const frameworks = Object.keys(dependencies).filter((name) =>
        FRAMEWORK_PACKAGES.some((pkg) => name === pkg || name.startsWith(`${pkg}/`)),
    );

    const sourceFiles = files.filter(isSourceFile);
    const partial: RepoFacts = {
        ecosystem: chosen.ecosystem ?? "unknown",
        packageManager: chosen.packageManager ?? "unknown",
        manifests,
        lockfiles: chosen.lockfiles ?? [],
        runtime: chosen.runtime,
        scripts: chosen.scripts ?? {},
        dependencies,
        resolvedVersions: chosen.resolvedVersions ?? {},
        frameworks,
        ci: await readCiCommands(root, files),
        verificationCommands: [],
        sourceFiles: sourceFiles.slice(0, MAX_LISTED_FILES),
        totalSourceFiles: sourceFiles.length,
        warnings,
    };

    partial.verificationCommands = deriveVerificationCommands(partial);
    return partial;
}

/**
 * The version to believe for a dependency.
 *
 * The lockfile wins over the manifest because it records what is installed, and
 * a migration that targets the declared range but not the pinned version is
 * wrong in the repository it is actually changing. Migrating a repo that pins
 * `p5@1.11.13` to 2.x syntax without noticing the pin is the same class of
 * mistake as migrating a file without noticing its contents.
 */
export function versionOf(facts: RepoFacts, name: string): string | undefined {
    return facts.resolvedVersions[name] ?? facts.dependencies[name];
}

/**
 * Renders facts for the opening model message.
 *
 * Kept terse on purpose. The model needs the package manager, the real scripts,
 * the pinned version of the library being migrated, and the exact commands it may
 * run. Everything else is noise that competes for attention.
 */
export function describeRepoFacts(facts: RepoFacts): string {
    const lines: string[] = [];
    lines.push(
        `This repository is a ${facts.ecosystem} project using ${facts.packageManager}.`,
    );

    if (facts.runtime) {
        lines.push(`Runtime: ${facts.runtime.name} ${facts.runtime.version}.`);
    }

    const scriptNames = Object.keys(facts.scripts);
    if (scriptNames.length > 0) {
        lines.push(`Scripts that exist: ${scriptNames.join(", ")}.`);
    } else {
        lines.push("This manifest defines no scripts.");
    }

    if (facts.verificationCommands.length > 0) {
        lines.push(
            `Verification commands that exist, most authoritative first: ${facts.verificationCommands.join(", ")}.`,
        );
    } else {
        lines.push(
            "This project has no verification command. Say so rather than inventing one.",
        );
    }

    const ciFiles = facts.ci.map((entry) => `${entry.file} (${entry.commands.join("; ")})`);
    if (ciFiles.length > 0) {
        lines.push(`CI runs: ${ciFiles.join(" | ")}.`);
    }

    if (facts.frameworks.length > 0) {
        lines.push(`Frameworks detected: ${facts.frameworks.join(", ")}.`);
    }

    // Deliberately `versionOf` rather than `resolvedVersions`. A repository
    // with no lockfile still states the version it wants, and an exact pin like
    // `"p5": "1.11.13"` is the strongest statement of a starting point the
    // manifest can make. Reading only the lockfile would drop it, which is how a
    // migration ends up written for a version the repository is not on.
    const installed = Object.keys(facts.dependencies)
        .map((name) => [name, versionOf(facts, name)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
        .sort((a, b) => a[0].localeCompare(b[0]));

    if (installed.length > 0) {
        const shown = installed
            .slice(0, 40)
            .map(([name, version]) => `${name}@${version}`)
            .join(", ");
        const more = installed.length > 40 ? `, and ${installed.length - 40} more` : "";
        lines.push(`Dependency versions: ${shown}${more}.`);
    }

    lines.push(
        `Source files: ${facts.totalSourceFiles}. Use searchCode to locate call sites rather than assuming where they are.`,
    );

    if (facts.warnings.length > 0) {
        lines.push(`Read warnings: ${facts.warnings.join("; ")}.`);
    }

    return lines.join("\n");
}
