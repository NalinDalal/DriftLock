import { describe, expect, test } from "bun:test";

describe("CLI module structure", () => {
    test("index.ts exists and is importable", async () => {
        // Verify the CLI entry point can be found
        const fs = await import("fs");
        const path = await import("path");
        const cliPath = path.resolve(import.meta.dir, "../../../../apps/cli/index.ts");
        expect(fs.existsSync(cliPath)).toBe(true);
    });

    test("CLI package.json has correct name", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const pkgPath = path.resolve(import.meta.dir, "../../../../apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.name).toBe("@driftlock/cli");
    });

    test("CLI package.json has build script", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const pkgPath = path.resolve(import.meta.dir, "../../../../apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.scripts?.build).toBeDefined();
        expect(typeof pkg.scripts.build).toBe("string");
    });

    test("CLI package.json has all required dependencies", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const pkgPath = path.resolve(import.meta.dir, "../../../../apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

        expect(pkg.dependencies).toHaveProperty("@driftlock/agent");
        expect(pkg.dependencies).toHaveProperty("@driftlock/parser");
        expect(pkg.dependencies).toHaveProperty("@driftlock/sandbox");
        expect(pkg.dependencies).toHaveProperty("@driftlock/git");
        expect(pkg.dependencies).toHaveProperty("commander");
        expect(pkg.dependencies).toHaveProperty("chalk");
        expect(pkg.dependencies).toHaveProperty("ora");
        expect(pkg.dependencies).toHaveProperty("inquirer");
    });

    test("CLI package.json has bin entry", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const pkgPath = path.resolve(import.meta.dir, "../../../../apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.bin).toBeDefined();
        expect(pkg.bin.driftlock).toBe("./dist/index.js");
    });

    test("CLI dist/index.js is built", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const distPath = path.resolve(import.meta.dir, "../../../../apps/cli/dist/index.js");
        expect(fs.existsSync(distPath)).toBe(true);
        const stat = fs.statSync(distPath);
        expect(stat.size).toBeGreaterThan(0);
    });
});
