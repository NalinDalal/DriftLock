import Parser from "tree-sitter";

/**
 * Resolves local variable/binding names to the external npm package they
 * came from, using only the syntax tree.
 *
 * Supported patterns:
 *   import Stripe from "stripe";                 // default
 *   import { twilio } from "twilio";             // named
 *   import { X as Y } from "pkg";                // aliased
 *   import * as St from "stripe";                // namespace
 *   const stripe = new Stripe("sk");             // constructor re-bind
 *   const client = twilio(sid, token);           // factory re-bind
 *   const Sdk = require("some-pkg");             // CJS require
 *
 * Scope is intentionally whole-file and last-declaration-wins. A more
 * precise resolver would track blocks/params; that precision is not worth
 * the complexity here since resolutions only gate *enrichment* on top of
 * a call site that was captured regardless.
 */
export class ImportResolver {
    private bindings = new Map<string, string>();

    constructor(root: Parser.SyntaxNode) {
        const visit = (node: Parser.SyntaxNode): void => {
            switch (node.type) {
                case "import_statement":
                    this.registerImport(node);
                    break;
                case "variable_declarator":
                    this.registerRebinding(node);
                    break;
            }
            for (const child of node.children) {
                visit(child);
            }
        };
        visit(root);
    }

    resolve(name: string): string | null {
        return this.bindings.get(name) ?? null;
    }

    get bindingsSize(): number {
        return this.bindings.size;
    }

    private registerImport(statement: Parser.SyntaxNode): void {
        const source = this.childString(statement);
        if (!source) return;

        const packageName = this.unquote(source.text);
        if (!isExternalPackage(packageName)) return;

        const clause = statement.children.find(
            (child) => child.type === "import_clause",
        );
        if (!clause) return;

        for (const child of clause.children) {
            if (child.type === "identifier") {
                // Default import: `import Stripe from "stripe"`.
                this.bindings.set(child.text, packageName);
            } else if (child.type === "namespace_import") {
                const name = child.children.find(
                    (sub) => sub.type === "identifier",
                );
                if (name) this.bindings.set(name.text, packageName);
            } else if (child.type === "named_imports") {
                for (const specifier of child.children) {
                    if (specifier.type !== "import_specifier") continue;
                    const name = specifier.childForFieldName("name");
                    if (!name) continue;
                    const alias = specifier.childForFieldName("alias");
                    this.bindings.set(alias?.text ?? name.text, packageName);
                }
            }
        }
    }

    private registerRebinding(declarator: Parser.SyntaxNode): void {
        const name = declarator.childForFieldName("name");
        if (!name || name.type !== "identifier") return;
        const value = declarator.childForFieldName("value");
        if (!value) return;

        let packageName: string | null = null;

        if (value.type === "new_expression") {
            // `const stripe = new Stripe("sk")`
            const constructor = value.childForFieldName("constructor");
            if (constructor?.type === "identifier") {
                packageName = this.resolve(constructor.text);
            }
        } else if (value.type === "call_expression") {
            const callee = value.childForFieldName("function");
            if (callee?.type === "identifier") {
                if (callee.text === "require") {
                    // `const Sdk = require("some-pkg")`
                    const args = value.childForFieldName("arguments");
                    const moduleName = args?.children.find(
                        (child) => child.type === "string",
                    );
                    if (moduleName) {
                        packageName = this.unquote(moduleName.text);
                        if (!isExternalPackage(packageName)) packageName = null;
                    }
                } else {
                    // `const client = twilio(sid, token)`
                    packageName = this.resolve(callee.text);
                }
            }
        } else if (value.type === "identifier") {
            // `const stripe = Stripe`
            packageName = this.resolve(value.text);
        }

        if (packageName) {
            this.bindings.set(name.text, packageName);
        }
    }

    private childString(statement: Parser.SyntaxNode): Parser.SyntaxNode | null {
        return (
            statement.children.find((child) => child.type === "string") ?? null
        );
    }

    private unquote(text: string): string {
        return text.length >= 2 ? text.slice(1, -1) : text;
    }
}

/**
 * True when the module name points at an external npm package.
 * Relative ("./x", "../x") and absolute ("/x") specifiers are local.
 *
 * @param packageName - Import source, e.g. "stripe" or "@acme/posts-sdk".
 * @returns True for anything that is not a local path.
 */
export function isExternalPackage(packageName: string): boolean {
    if (!packageName || packageName.length === 0) return false;
    return !packageName.startsWith(".") && !packageName.startsWith("/");
}