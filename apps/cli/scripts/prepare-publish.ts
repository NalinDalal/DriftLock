/**
 * Build the publishable package inside ./dist.
 *
 * The published CLI is a single bundled file, but native modules
 * (tree-sitter grammars) cannot be bundled: they must install from the
 * registry on the target machine. Workspace `workspace:*` dependencies
 * are equally unpublishable. So publishing ships ./dist with a generated
 * package.json: bundled first-party code + real registry deps.
 *
 * Run via `prepublishOnly`. Never hand-edit dist/package.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const NATIVE_DEPS = [
    "tree-sitter",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
];

const dependencies: Record<string, string> = {};
for (const name of NATIVE_DEPS) {
    const version = pkg.dependencies?.[name];
    if (typeof version !== "string" || version.includes("workspace")) {
        throw new Error(`prepare-publish: no registry version for ${name}`);
    }
    dependencies[name] = version;
}

const publishPkg = {
    name: pkg.name,
    version: pkg.version,
    type: "module",
    main: "./index.js",
    bin: { driftlock: "./index.js" },
    files: ["index.js"],
    dependencies,
};

writeFileSync(
    join(root, "dist", "package.json"),
    JSON.stringify(publishPkg, null, 2) + "\n",
);
console.log(`prepare-publish: wrote dist/package.json for ${publishPkg.name}@${publishPkg.version}`);
