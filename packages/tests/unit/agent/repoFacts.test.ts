import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    deriveVerificationCommands,
    describeRepoFacts,
    fingerprintRepo,
    versionOf,
} from "@driftlock/agent";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-facts-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
    const full = join(root, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, JSON.stringify(value, null, 2));
}

async function write(path: string, value: string): Promise<void> {
    const full = join(root, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, value);
}

describe("fingerprintRepo, npm", () => {
    test("reads scripts, declared ranges, and lockfile-resolved versions", async () => {
        await writeJson("package.json", {
            scripts: { test: "vitest run", typecheck: "tsc --noEmit", lint: "eslint ." },
            dependencies: { p5: "^1.11.0" },
            devDependencies: { typescript: "^5.3.0" },
        });
        await writeJson("package-lock.json", {
            lockfileVersion: 3,
            packages: {
                "": { name: "fixture" },
                "node_modules/p5": { version: "1.11.13" },
                "node_modules/typescript": { version: "5.3.3" },
            },
        });

        const facts = await fingerprintRepo(root);

        expect(facts.ecosystem).toBe("npm");
        expect(facts.packageManager).toBe("npm");
        expect(facts.scripts.typecheck).toBe("tsc --noEmit");
        expect(facts.dependencies.p5).toBe("^1.11.0");
        expect(facts.resolvedVersions.p5).toBe("1.11.13");
        expect(facts.verificationCommands).toEqual([
            "npm run typecheck",
            "npm test",
            "npm run lint",
        ]);
    });

    test("trusts the lockfile over the declared range", async () => {
        await writeJson("package.json", { dependencies: { p5: "^2.0.0" } });
        await writeJson("package-lock.json", {
            packages: { "node_modules/p5": { version: "1.11.13" } },
        });

        const facts = await fingerprintRepo(root);
        expect(versionOf(facts, "p5")).toBe("1.11.13");
    });

    test("derives nothing when the project has no verification scripts", async () => {
        await writeJson("package.json", { scripts: { dev: "vite" } });
        const facts = await fingerprintRepo(root);
        expect(facts.verificationCommands).toEqual([]);
        expect(describeRepoFacts(facts)).toContain("no verification command");
    });

    test("detects pnpm from the lockfile", async () => {
        await writeJson("package.json", { scripts: { test: "vitest" } });
        await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");

        const facts = await fingerprintRepo(root);
        expect(facts.packageManager).toBe("pnpm");
        expect(facts.verificationCommands).toContain("pnpm test");
    });

    test("prefers an explicit packageManager field", async () => {
        await writeJson("package.json", {
            packageManager: "bun@1.3.11",
            scripts: { test: "bun test" },
        });

        const facts = await fingerprintRepo(root);
        expect(facts.packageManager).toBe("bun");
        expect(facts.verificationCommands).toContain("bun test");
    });

    test("records a malformed manifest as a warning instead of throwing", async () => {
        await write("package.json", "{ not json");

        const facts = await fingerprintRepo(root);
        expect(facts.warnings).toContain("package.json is not valid JSON");
        expect(facts.ecosystem).toBe("unknown");
    });

    test("falls back to declared ranges when the lockfile is unreadable", async () => {
        await writeJson("package.json", { dependencies: { p5: "^1.11.0" } });
        await write("package-lock.json", "corrupt");

        const facts = await fingerprintRepo(root);
        expect(facts.warnings.length).toBe(1);
        expect(versionOf(facts, "p5")).toBe("^1.11.0");
    });

    test("reads the node version from .nvmrc", async () => {
        await writeJson("package.json", { scripts: { test: "vitest" } });
        await write(".nvmrc", "20.11.0\n");

        const facts = await fingerprintRepo(root);
        expect(facts.runtime).toEqual({ name: "node", version: "20.11.0" });
    });

    test("detects frameworks including non-web ones", async () => {
        await writeJson("package.json", { dependencies: { p5: "1.11.13", three: "^0.160" } });
        const facts = await fingerprintRepo(root);
        expect(facts.frameworks).toContain("p5");
        expect(facts.frameworks).toContain("three");
    });
});

describe("fingerprintRepo, CI", () => {
    test("reads verification commands out of a GitHub workflow", async () => {
        await writeJson("package.json", { scripts: { test: "vitest" } });
        await write(
            ".github/workflows/ci.yml",
            [
                "name: CI",
                "on: [push]",
                "jobs:",
                "  test:",
                "    steps:",
                "      - uses: actions/checkout@v4",
                "      - run: npm ci",
                "      - run: npm test",
                "      - run: npm run typecheck",
                "      - run: npm run build",
                "      - run: |",
                "          echo multi",
            ].join("\n"),
        );

        const facts = await fingerprintRepo(root);
        const ci = facts.ci[0];
        expect(ci.file).toBe(".github/workflows/ci.yml");
        expect(ci.commands).toEqual(["npm test", "npm run typecheck", "npm run build"]);
    });

    test("never turns a CI command into a runnable verification command", async () => {
        // CI runs a typecheck the manifest does not define, which is a real
        // repository shape and also the most dangerous thing to copy blindly:
        // the command looks right but `npm run typecheck` would exit 1 here.
        await writeJson("package.json", { scripts: { test: "vitest" } });
        await write(
            ".github/workflows/ci.yml",
            ["jobs:", "  test:", "    steps:", "      - run: npm run typecheck"].join("\n"),
        );

        const facts = await fingerprintRepo(root);
        expect(facts.ci[0].commands).toEqual(["npm run typecheck"]);
        expect(facts.verificationCommands).toEqual(["npm test"]);
        expect(facts.verificationCommands).not.toContain("npm run typecheck");
    });

    test("ignores install steps and block scalars", async () => {
        await writeJson("package.json", { scripts: { test: "vitest" } });
        await write(
            ".github/workflows/ci.yml",
            [
                "jobs:",
                "  test:",
                "    steps:",
                "      - run: npm ci",
                "      - run: npm test",
                "      - run: |",
                "          npm test -- --coverage",
            ].join("\n"),
        );

        const facts = await fingerprintRepo(root);
        expect(facts.ci[0].commands).toEqual(["npm test"]);
    });
});

describe("fingerprintRepo, cargo", () => {
    test("reads Cargo.toml dependencies and Cargo.lock versions", async () => {
        await write(
            "Cargo.toml",
            [
                "[package]",
                "name = \"fixture\"",
                "version = \"0.1.0\"",
                "",
                "[dependencies]",
                "serde = \"1.0\"",
                "tokio = { version = \"1.35\", features = [\"full\"] }",
                "",
                "[dev-dependencies]",
                "criterion = \"0.5\"",
            ].join("\n"),
        );
        await write(
            "Cargo.lock",
            [
                "[[package]]",
                "name = \"serde\"",
                "version = \"1.0.195\"",
                "",
                "[[package]]",
                "name = \"tokio\"",
                "version = \"1.35.1\"",
            ].join("\n"),
        );

        const facts = await fingerprintRepo(root);

        expect(facts.ecosystem).toBe("cargo");
        expect(facts.packageManager).toBe("cargo");
        expect(facts.dependencies.serde).toBe("1.0");
        expect(facts.dependencies.tokio).toBe("1.35");
        expect(facts.dependencies.criterion).toBe("0.5");
        expect(facts.resolvedVersions.serde).toBe("1.0.195");
        expect(facts.verificationCommands).toEqual(["cargo check", "cargo build", "cargo test"]);
    });
});

describe("fingerprintRepo, python and go", () => {
    test("reads pinned requirements", async () => {
        await write("requirements.txt", ["flask==3.0.0", "# comment", "numpy>=1.26"].join("\n"));
        await write(".python-version", "3.12.1\n");

        const facts = await fingerprintRepo(root);
        expect(facts.ecosystem).toBe("python");
        expect(facts.dependencies.flask).toBe("3.0.0");
        expect(facts.dependencies.numpy).toBeUndefined();
        expect(facts.runtime).toEqual({ name: "python", version: "3.12.1" });
    });

    test("reads go.mod requirements", async () => {
        await write(
            "go.mod",
            ["module example.com/app", "", "go 1.22", "", "require (", "\tgithub.com/gin-gonic/gin v1.9.1", ")"].join(
                "\n",
            ),
        );

        const facts = await fingerprintRepo(root);
        expect(facts.ecosystem).toBe("go");
        expect(facts.dependencies["github.com/gin-gonic/gin"]).toBe("v1.9.1");
        expect(facts.verificationCommands).toContain("go test ./...");
    });
});

describe("describeRepoFacts", () => {
    test("names the installed version, not just the declared range", async () => {
        await writeJson("package.json", {
            scripts: { test: "vitest", build: "vite build" },
            dependencies: { p5: "^1.11.0" },
        });
        await writeJson("package-lock.json", {
            packages: { "node_modules/p5": { version: "1.11.13" } },
        });

        const description = describeRepoFacts(await fingerprintRepo(root));

        expect(description).toContain("npm project using npm");
        expect(description).toContain("p5@1.11.13");
        expect(description).toContain("npm test");
        expect(description).toContain("npm run build");
    });

    test("reports the manifest pin when there is no lockfile", async () => {
        // Regression: reading only resolvedVersions dropped the version entirely
        // for a repository with no lockfile, which is exactly the shape of the
        // p5 repository that produced the failed run.
        await writeJson("package.json", {
            scripts: { dev: "vite", build: "vite build" },
            dependencies: { p5: "1.11.13" },
        });

        const description = describeRepoFacts(await fingerprintRepo(root));

        expect(description).toContain("p5@1.11.13");
    });

    test("prefers the lockfile version over the declared range", async () => {
        await writeJson("package.json", { dependencies: { p5: "^1.11.0" } });
        await writeJson("package-lock.json", {
            packages: { "node_modules/p5": { version: "1.11.13" } },
        });

        const description = describeRepoFacts(await fingerprintRepo(root));
        expect(description).toContain("p5@1.11.13");
        expect(description).not.toContain("p5@^1.11.0");
    });

    test("says plainly when there is nothing to verify with", async () => {
        await writeJson("package.json", { scripts: { dev: "vite" } });
        const description = describeRepoFacts(await fingerprintRepo(root));
        expect(description).toContain("no verification command");
        expect(description).not.toContain("npm test");
    });
});

describe("deriveVerificationCommands", () => {
    test("orders typecheck ahead of test ahead of build", async () => {
        await writeJson("package.json", {
            scripts: { build: "vite build", test: "vitest", typecheck: "tsc" },
        });
        const facts = await fingerprintRepo(root);
        expect(deriveVerificationCommands(facts)).toEqual([
            "npm run typecheck",
            "npm test",
            "npm run build",
        ]);
    });

    test("produces an empty list rather than a guess", async () => {
        const facts = await fingerprintRepo(root);
        expect(deriveVerificationCommands(facts)).toEqual([]);
    });
});
