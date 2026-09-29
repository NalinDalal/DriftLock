import type { FixWork } from "@driftlock/diff";

// A key's value that means this is a label or a type rather than a real field.
// `outer: for (...)` is a label, and `({ payment }: { payment: any })` is a
// parameter type: TypeScript type literals are indistinguishable from object
// literals to a regex, and treating one as an invented field rejected valid TSX.
const NOT_A_VALUE = /^(?:for|while|do|switch|if|try|return|throw|function|class|const|let|var|any|unknown|never|string|number|boolean|object|symbol|bigint|void|null|undefined)\b/;
// `default` is a switch label that happens to follow a `{`.
const NOT_A_KEY = new Set([
    "default", "case", "else", "do", "try", "catch", "finally",
    "new", "typeof", "void", "delete", "in", "instanceof", "of", "this",
]);

/**
 * Keys written explicitly as `key:` inside an object literal, ignoring comments.
 * Shorthand properties are deliberately not matched: `{ payment_method }` is a
 * reference to an existing binding, not an invented field.
 */
function objectLiteralKeys(code: string): Set<string> {
    const masked = code
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
    const keys = new Set<string>();
    const keyRe =
        /(?<=[{,])[ \t\r\n]*(?:"([^"\n]*)"|'([^'\n]*)'|([A-Za-z_$][\w$]*))[ \t\r\n]*:(?!:)([ \t\r\n]*)(\S{0,6})/g;
    let match: RegExpExecArray | null;
    while ((match = keyRe.exec(masked)) !== null) {
        const key = match[1] ?? match[2] ?? match[3];
        if (!key || NOT_A_KEY.has(key)) continue;
        // `outer: for (...)` is a label, and `{ payment: any }` is a type.
        if (NOT_A_VALUE.test(match[5] ?? "")) continue;
        keys.add(key);
    }
    return keys;
}

export function isValidAIFix(
    fixedCode: string,
    works: FixWork[],
    originalCode: string,
    filePath = "file.ts",
): boolean {
    if (fixedCode === originalCode) return false;
    // Vacuous inputs validate vacuously: an empty original makes every
    // check pass while meaning nothing was ever read.
    if (!originalCode.trim() || !fixedCode.trim()) return false;
    if (/\/\/\s*Added new field/i.test(fixedCode)) return false;
    const loader = filePath.endsWith(".tsx")
        ? "tsx"
        : filePath.endsWith(".jsx")
          ? "jsx"
          : /\.(js|mjs|cjs)$/.test(filePath)
            ? "js"
            : "ts";
    try {
        // Parse source syntax without executing the generated code.
        new Bun.Transpiler({ loader }).transformSync(fixedCode);
    } catch {
        return false;
    }
    for (const work of works) {
        if (work.kind === "custom" && work.field) {
            // Removal fixes may only delete. The field must be gone as an
            // access, nothing may be invented, and everything else must be
            // preserved: a rewrite nuking the file body is the opposite of
            // a fix, and must fall back to deterministic, not ship confident.
            const leaf = work.field.split(".").pop()!;
            const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const codeOnly = (code: string): string =>
                code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
            const goneRe = new RegExp(
                `(?:\\?\\.\\s*|\\.\\s*)${esc(leaf)}(?![\\w$])|\\[\\s*["']${esc(leaf)}["']\\s*\\]`,
            );
            if (goneRe.test(codeOnly(fixedCode))) return false;
            const originalKeys = objectLiteralKeys(originalCode);
            const fixedKeys = objectLiteralKeys(fixedCode);
            for (const key of fixedKeys) {
                if (!originalKeys.has(key)) return false;
            }
            for (const key of originalKeys) {
                if (key !== leaf && !fixedKeys.has(key)) return false;
            }
            // Preservation: every significant original line that does not
            // touch the removed field must survive verbatim (modulo
            // whitespace). A rewrite nuking the file body passes every
            // check above vacuously; this is what rejects it. Reformatting
            // fixes get rejected too, and fall back to deterministic.
            const leafRe = new RegExp(`\\b${esc(leaf)}\\b`);
            const significantLines = (code: string): Set<string> =>
                new Set(
                    codeOnly(code)
                        .split("\n")
                        .map((l) => l.replace(/\s+/g, ""))
                        .filter((l) => l.length > 0),
                );
            const fixedLines = significantLines(fixedCode);
            for (const line of significantLines(originalCode)) {
                if (leafRe.test(line)) continue;
                if (!fixedLines.has(line)) return false;
            }
        }
        if (work.kind === "field_rename" && work.from && work.to) {
            const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const toRe = new RegExp(`\\b${esc(work.to)}\\b`);
            const fromRe = new RegExp(`\\b${esc(work.from)}\\b`);
            // New field must appear somewhere
            if (!toRe.test(fixedCode)) return false;
            // Old field must not remain as a property access (e.g., .source or source:)
            if (fromRe.test(fixedCode)) {
                // Allow if from appears only inside to (not applicable here, but keep strict)
                return false;
            }
            const leaf = work.to.split(".").pop()!;
            const camelCase = leaf.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
            if (camelCase !== leaf) {
                // Reject invented accesses, but preserve existing accesses and local aliases.
                const accessRe = new RegExp(
                    `(?<![\\w$])[\\w$]+(?:\\s*(?:\\?\\.|\\.)\\s*[\\w$]+)*\\s*(?:(?:\\?\\.|\\.)\\s*${esc(camelCase)}(?![\\w$])|(?:\\?\\.)?\\s*\\[\\s*(["'])${esc(camelCase)}\\1\\s*\\])`,
                    "g",
                );
                const accesses = (code: string) => new Set(
                    Array.from(code.matchAll(accessRe), ([access]) => access
                        .replace(/\s+/g, "")
                        .replace(/(?:\?\.)?\[['"]([^'"]+)['"]\]/g, ".$1")
                        .replace(/\?\./g, ".")),
                );
                const originalAccesses = accesses(originalCode);
                for (const access of accesses(fixedCode)) {
                    if (!originalAccesses.has(access)) return false;
                }
                // The access check only sees `a.b` and `a["b"]`, so a bare
                // object-literal key is invisible to it. Without this, a fix can
                // add `{ paymentMethod: "..." }` next to a correct rename and
                // sail through on the strength of the one legitimate key.
                const originalKeys = objectLiteralKeys(originalCode);
                const allowedKeys = new Set([work.to.split(".").pop()!]);
                for (const key of objectLiteralKeys(fixedCode)) {
                    if (!originalKeys.has(key) && !allowedKeys.has(key)) return false;
                }
            }
        }
    }
    return true;
}
