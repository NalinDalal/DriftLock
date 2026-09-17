import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import JavaScript from "tree-sitter-javascript";
import {
    CallSite,
    HttpMethod,
    VendorConfig,
    defaultHttpMethod,
    patternInferEndpoint,
} from "@driftlock/core";
import { ImportResolver } from "./importResolver";

export type { VendorConfig, ResourceConfig, HttpMethod } from "@driftlock/core";
export { ImportResolver } from "./importResolver";

/**
 * Parse source text and build an ImportResolver for it.
 *
 * @param code - Source code to scan for import bindings.
 * @param language - Grammar to parse with (defaults to typescript).
 * @returns A resolver whose bindings reflect that file.
 */
export function createImportResolver(
    code: string,
    language: ParserLanguage = "typescript",
): ImportResolver {
    const parser = new Parser();
    const grammar =
        language === "tsx"
            ? TypeScript.tsx
            : language === "javascript"
              ? (JavaScript as unknown as typeof TypeScript)
              : TypeScript.typescript;
    parser.setLanguage(grammar as never);
    return new ImportResolver(parser.parse(code).rootNode);
}

// Example vendor configs (Stripe, Twilio). NOT defaults. The extractor
// captures every SDK import regardless. These are reference data you can
// opt into for endpoint precision, derived instead from docs via
// @driftlock/agent (vendorConfigFromOpenApi / Agent.inferVendorConfig).
export { STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/core";

export type ParserLanguage = "typescript" | "tsx" | "javascript";

export function detectLanguage(filePath: string): ParserLanguage {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "tsx") return "tsx";
    if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") {
        return "javascript";
    }
    return "typescript";
}

/** A recognized external SDK call, before endpoint enrichment. */
interface DetectedCall {
    packageName: string;
    rootName: string;
    resource: string;
    method: string;
    vendor: VendorConfig | null;
}

// ── Endpoint Mapper ──────────────────────────────────────────────────────────

interface ResolvedEndpoint {
    endpoint: string;
    httpMethod: HttpMethod;
}

function lookupResource(
    vendor: VendorConfig,
    resourcePath: string,
): { overrides?: Record<string, string | { endpoint: string; httpMethod?: HttpMethod }>; httpMethods?: Partial<Record<string, HttpMethod>> } | undefined {
    if (!vendor.resources) {
        return undefined;
    }
    // Prefer the full dotted path, then fall back to the last segment for
    // legacy single-segment registries like { charges: {...} }.
    return vendor.resources[resourcePath] ?? vendor.resources[resourcePath.split(".").pop() ?? ""];
}

function resolveEndpoint(
    vendor: VendorConfig,
    resourcePath: string,
    method: string,
): ResolvedEndpoint {
    const registry = lookupResource(vendor, resourcePath);
    const overrideEntry = registry?.overrides?.[method];

    if (overrideEntry !== undefined) {
        if (typeof overrideEntry === "string") {
            return { endpoint: overrideEntry, httpMethod: defaultHttpMethod(method) };
        }
        return {
            endpoint: overrideEntry.endpoint,
            httpMethod: overrideEntry.httpMethod ?? defaultHttpMethod(method),
        };
    }

    const endpoint = patternInferEndpoint(vendor.basePath, resourcePath, method);
    const httpMethod =
        registry?.httpMethods?.[method] ?? defaultHttpMethod(method);
    return { endpoint, httpMethod };
}

// ── Variable Registry (for request shape resolution) ────────────────────────

interface VariableDef {
    name: string;
    node: Parser.SyntaxNode;
    /** Primitive type hint from a TS type annotation, e.g. "number". */
    typeHint?: string;
}

function collectVariables(rootNode: Parser.SyntaxNode): VariableDef[] {
    const vars: VariableDef[] = [];
    walkForVariables(rootNode, vars);
    return vars;
}

function walkForVariables(
    node: Parser.SyntaxNode,
    vars: VariableDef[],
): void {
    // const/let/var declarations
    if (
        node.type === "lexical_declaration" ||
        node.type === "variable_declaration"
    ) {
        for (const decl of node.children) {
            if (decl.type === "variable_declarator") {
                const nameNode = decl.child(0);
                if (!nameNode || nameNode.type !== "identifier") continue;

                const typeHint = typeAnnotationHint(decl);
                const valueNode = valueAfterEquals(decl);
                if (valueNode) {
                    vars.push({ name: nameNode.text, node: valueNode, typeHint });
                } else if (typeHint) {
                    vars.push({ name: nameNode.text, node: nameNode, typeHint });
                }
            }
        }
    }

    // Function parameters
    if (
        node.type === "function" ||
        node.type === "function_declaration" ||
        node.type === "arrow_function" ||
        node.type === "method_definition" ||
        node.type === "generator_function" ||
        node.type === "generator_function_declaration"
    ) {
        const params = node.children.find((c) => c.type === "formal_parameters");
        if (params) {
            for (const param of params.children) {
                collectParam(param, vars);
            }
        }
    }

    for (const child of node.children) {
        walkForVariables(child, vars);
    }
}

/** Extract the type annotation that siblings a declarator, e.g. `: number` in `const x: number = 5`. */
function typeAnnotationHint(decl: Parser.SyntaxNode): string | undefined {
    const annotation = decl.children.find((c) => c.type === "type_annotation");
    if (!annotation) return undefined;
    return typeNodeToHint(annotation.child(1));
}

/** Map a TS type node to a request-shape hint (primitive kinds only). */
function typeNodeToHint(typeNode: Parser.SyntaxNode | null): string | undefined {
    if (!typeNode) return undefined;
    switch (typeNode.type) {
        case "predefined_type":
            switch (typeNode.text) {
                case "number":
                case "string":
                case "boolean":
                    return typeNode.text;
                case "any":
                case "unknown":
                case "void":
                    return "unknown";
                case "null":
                    return "null";
                default:
                    return typeNode.text;
            }
        case "type_identifier":
            // Named types can't be statically resolved to a primitive.
            return "unknown";
        case "array_type":
            return "array";
        case "object_type":
            return "object";
        case "union_type": {
            const hints = typeNode.children
                .map((c) => typeNodeToHint(c))
                .filter((h): h is string => h !== undefined && h !== "unknown");
            const unique = [...new Set(hints)];
            return unique.length === 1 ? unique[0] : "unknown";
        }
        default:
            return "unknown";
    }
}

/** Collect a single formal parameter into the variable registry. */
function collectParam(param: Parser.SyntaxNode, vars: VariableDef[]): void {
    if (param.type === "identifier") {
        vars.push({ name: param.text, node: param });
        return;
    }

    if (param.type === "required_parameter" || param.type === "optional_parameter") {
        const pattern = param.child(0);
        const annotation = param.children.find((c) => c.type === "type_annotation");

        if (pattern && pattern.type === "identifier") {
            const typeHint = annotation ? typeNodeToHint(annotation.child(1)) : undefined;
            vars.push({ name: pattern.text, node: pattern, typeHint });
            return;
        }

        if (pattern?.type === "object_pattern") {
            collectObjectPattern(pattern, annotation, vars);
            return;
        }
        return;
    }

    if (param.type === "object_pattern") {
        collectObjectPattern(param, undefined, vars);
    }

    if (param.type === "assignment_pattern" || param.type === "rest_pattern") {
        const inner = param.children.find((c) => c.type === "identifier");
        if (inner) vars.push({ name: inner.text, node: inner });
    }
}

/** Register destructured param names (e.g. `{ amount, currency }`) with per-key type hints. */
function collectObjectPattern(
    pattern: Parser.SyntaxNode,
    annotation: Parser.SyntaxNode | undefined,
    vars: VariableDef[],
): void {
    const hintsByName = objectTypeHints(annotation);

    for (const child of pattern.children) {
        if (child.type === "shorthand_property_identifier_pattern") {
            const name = child.text;
            vars.push({
                name,
                node: child,
                typeHint: hintsByName.get(name),
            });
        } else if (child.type === "pair_pattern") {
            const key = child.child(0)?.text;
            if (key) {
                vars.push({
                    name: key,
                    node: child,
                    typeHint: hintsByName.get(key),
                });
            }
        } else if (child.type === "shorthand_property_identifier") {
            vars.push({ name: child.text, node: child });
        }
    }
}

/** Parse `{ amount: number; currency: string }` into { amount → "number", currency → "string" }. */
function objectTypeHints(annotation: Parser.SyntaxNode | undefined): Map<string, string> {
    const hints = new Map<string, string>();
    const objectType = annotation?.child(1);
    if (!objectType || objectType.type !== "object_type") {
        return hints;
    }
    for (const child of objectType.children) {
        if (child.type !== "property_signature") continue;
        const key = child.child(0)?.text;
        const typeAnnotation = child.children.find((c) => c.type === "type_annotation");
        if (key && typeAnnotation) {
            const hint = typeNodeToHint(typeAnnotation.child(1));
            if (hint !== undefined) {
                hints.set(key, hint);
            }
        }
    }
    return hints;
}

/** `const x = 5` / `const x: T = 5` → the value node after the `=` token. */
function valueAfterEquals(decl: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const eqIndex = decl.children.findIndex((c) => c.type === "=");
    if (eqIndex === -1) return null;
    return decl.child(eqIndex + 1) ?? null;
}

function findVariable(
    name: string,
    vars: VariableDef[],
): VariableDef | null {
    // Last definition wins (simple scope model)
    for (let i = vars.length - 1; i >= 0; i--) {
        if (vars[i].name === name) {
            return vars[i];
        }
    }
    return null;
}

// ── Request Shape Extraction ─────────────────────────────────────────────────

function extractRequestShape(
    node: Parser.SyntaxNode,
    variables: VariableDef[],
): Record<string, unknown> {
    const args = node.child(1); // arguments node
    if (!args || args.type !== "arguments") {
        return {};
    }

    const firstArg = args.child(1); // Skip opening paren
    if (!firstArg) {
        return {};
    }

    return resolveNodeToShape(firstArg, variables);
}

function resolveNodeToShape(
    node: Parser.SyntaxNode,
    variables: VariableDef[],
): Record<string, unknown> {
    switch (node.type) {
        case "object":
            return extractObjectLiteral(node, variables);
        case "parenthesized_expression": {
            const inner = node.child(1) ?? node.child(0);
            return inner ? resolveNodeToShape(inner, variables) : {};
        }
        case "spread_element":
            return unwrapExpression(node) ? resolveNodeToShape(unwrapExpression(node)!, variables) : {};
        case "identifier": {
            const def = findVariable(node.text, variables);
            if (!def) return {};
            if (def.typeHint) return {};
            if (def.node !== node) {
                return resolveNodeToShape(def.node, variables);
            }
            return {};
        }
        case "call_expression":
            // Can't resolve return values statically
            return { __dynamic: true };
        default:
            return {};
    }
}

function unwrapExpression(
    node: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
    if (node.type === "spread_element") {
        return node.child(1) ?? null;
    }
    return node;
}

function extractObjectLiteral(
    node: Parser.SyntaxNode,
    variables: VariableDef[],
): Record<string, unknown> {
    const shape: Record<string, unknown> = {};

    for (const child of node.children) {
        if (child.type === "spread_element") {
            const inner = unwrapExpression(child);
            if (inner) {
                Object.assign(shape, resolveNodeToShape(inner, variables));
            }
            continue;
        }

        if (child.type === "pair" || child.type === "property") {
            const key = child.child(0)?.text || "";
            const value = child.child(2);
            if (key && value) {
                shape[key] = inferRequestType(value, variables);
            }
        }

        // Shorthand properties: { amount, currency }
        if (child.type === "shorthand_property_identifier") {
            const name = child.text;
            const def = findVariable(name, variables);
            shape[name] = def?.typeHint ?? (def ? inferRequestType(def.node, variables) : "unknown");
        }
    }

    return shape;
}

function inferRequestType(
    node: Parser.SyntaxNode,
    variables: VariableDef[],
): unknown {
    switch (node.type) {
        case "string":
        case "template_string":
        case "regex":
            return "string";
        case "number":
            return "number";
        case "true":
        case "false":
            return "boolean";
        case "null":
            return "null";
        case "undefined":
            return "undefined";
        case "object":
            return extractObjectLiteral(node, variables);
        case "array": {
            const first = node.children.find((c) => !["[", "]"].includes(c.text));
            return first ? inferRequestType(first, variables) : "array";
        }
        case "parenthesized_expression": {
            const inner = node.namedChildren[0] ?? node.child(1) ?? node.child(0);
            return inner ? inferRequestType(inner, variables) : "unknown";
        }
        case "identifier": {
            const def = findVariable(node.text, variables);
            if (!def) return "unknown";
            if (def.typeHint) return def.typeHint;
            if (def.node !== node) {
                return inferRequestType(def.node, variables);
            }
            return "unknown";
        }
        case "member_expression":
        case "subscript_expression":
            return { __ref: node.text };
        case "call_expression":
        case "binary_expression":
        case "ternary_expression":
            return "unknown";
        case "arrow_function":
        case "function":
        case "function_expression":
            return "function";
        default:
            return "unknown";
    }
}

// ── Response Field Extraction ────────────────────────────────────────────────

function extractResponseFields(
    callNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode,
): string[] {
    const fields: string[] = [];

    // Strategy 1: destructuring of the result via `await`
    findDestructuringAssignment(callNode, rootNode, fields);
    if (fields.length > 0) {
        return fields;
    }

    // Strategy 2: property access on the assigned variable
    findPropertyAccesses(callNode, rootNode, fields);

    // Strategy 3: `.then()` chains on the promise
    findThenChainFields(callNode, rootNode, fields);

    return fields;
}

function findDestructuringAssignment(
    callNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode,
    fields: string[],
): void {
    walkForDestructuring(rootNode, callNode, fields);
}

function walkForDestructuring(
    node: Parser.SyntaxNode,
    targetCall: Parser.SyntaxNode,
    fields: string[],
): void {
    if (node.type === "variable_declarator") {
        const pattern = node.child(0);
        const value = node.child(2);

        if (pattern?.type === "object_pattern" && value) {
            if (valueEqualsCall(value, targetCall)) {
                for (const prop of pattern.children) {
                    if (prop.type === "shorthand_property_identifier_pattern") {
                        pushField(fields, prop.text);
                    } else if (prop.type === "pair_pattern") {
                        const key = prop.child(0)?.text;
                        if (key) pushField(fields, key);
                    }
                }
            }
        }
    }

    for (const child of node.children) {
        walkForDestructuring(child, targetCall, fields);
    }
}

function findPropertyAccesses(
    callNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode,
    fields: string[],
): void {
    const varName = findAssignedVariableName(callNode, rootNode);
    if (!varName) return;

    const collected: string[] = [];
    walkForPropertyChains(rootNode, varName, collected);
    for (const field of collected) {
        pushField(fields, field);
    }
}

function findAssignedVariableName(
    callNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode,
): string | null {
    let result: string | null = null;
    walkForAssignment(rootNode, callNode, (name) => {
        result = name;
    });
    return result;
}

function walkForAssignment(
    node: Parser.SyntaxNode,
    targetCall: Parser.SyntaxNode,
    callback: (name: string) => void,
): void {
    if (node.type === "variable_declarator") {
        const pattern = node.child(0);
        const value = node.child(2);

        if (pattern?.type === "identifier" && value) {
            if (valueEqualsCall(value, targetCall)) {
                callback(pattern.text);
            }
        }
    }

    for (const child of node.children) {
        walkForAssignment(child, targetCall, callback);
    }
}

/**
 * Collect top-level response fields by walking member chains rooted at the
 * assigned variable. `charge.outcome.network_status` → "outcome".
 * Handles plain access and optional chaining (`charge?.status`).
 */
function walkForPropertyChains(
    node: Parser.SyntaxNode,
    varName: string,
    fields: string[],
): void {
    if (node.type === "member_expression") {
        const props = chainProperties(node, varName);
        if (props) {
            pushField(fields, props[0]);
        }
    }

    for (const child of node.children) {
        walkForPropertyChains(child, varName, fields);
    }
}

/** Return the property names of a member chain (leftmost base first), or null if not rooted at `rootName`. */
function chainProperties(
    node: Parser.SyntaxNode,
    rootName: string,
): string[] | null {
    const props: string[] = [];
    let current: Parser.SyntaxNode | null = node;
    while (current && current.type === "member_expression") {
        const prop =
            current.child(2)?.type === "optional_chain"
                ? null
                : current.child(2) ?? current.child(1);
        if (!prop || prop.type === "optional_chain") break;
        props.unshift(prop.text);
        current = current.child(0);
    }
    if (current?.type === "identifier" && current.text === rootName && props.length > 0) {
        return props;
    }
    return null;
}

// ── .then() chain response extraction ────────────────────────────────────────

function findThenChainFields(
    callNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode,
    fields: string[],
): void {
    const callback = findThenCallback(callNode);
    if (!callback) {
        return;
    }

    const { paramName, patternNames, body } = callback;

    for (const name of patternNames) {
        pushField(fields, name);
    }

    if (paramName && body) {
        walkBodyForChainRoots(body, paramName, fields);
    }
}

interface ThenCallback {
    paramName: string | null;
    patternNames: string[];
    body: Parser.SyntaxNode | null;
}

function findThenCallback(callNode: Parser.SyntaxNode): ThenCallback | null {
    // `stripe.x.y(...).then(cb)` → the call is the object of a `.then`
    // member expression whose parent is the `.then(...)` call.
    const member = callNode.parent;
    if (!member || member.type !== "member_expression") return null;
    const prop =
        member.child(2)?.type === "optional_chain"
            ? member.child(1)
            : member.child(2) ?? member.child(1);
    if (!prop || prop.text !== "then") return null;

    const thenCall = member.parent;
    if (!thenCall || thenCall.type !== "call_expression") return null;
    const args = thenCall.child(1);
    if (!args || args.type !== "arguments") return null;

    const callbackNode = args.child(1);
    if (!callbackNode) return null;

    let fn: Parser.SyntaxNode = callbackNode;
    if (fn.type === "parenthesized_expression") {
        const inner = fn.child(1) ?? fn.child(0);
        if (!inner) return null;
        fn = inner;
    }
    if (fn.type !== "arrow_function" && fn.type !== "function_expression") {
        return null;
    }

    const params = fn.children.find((c) => c.type === "formal_parameters");
    const body: Parser.SyntaxNode | null =
        fn.childForFieldName("body") ??
        (fn.children.find((c) =>
            c.type === "statement_block" ||
            c.type === "member_expression" ||
            c.type === "call_expression" ||
            c.type === "object" ||
            c.type === "await_expression" ||
            c.type === "parenthesized_expression",
        ) ?? null    );
    // JS grammar wraps bare params in required_parameter; TS puts a bare
    // identifier on the arrow function when no formal_parameters node exists.
    const paramName = params
        ? firstParameterName(params)
        : fn.children.find((c) => c.type === "identifier")?.text ?? null;

    const patternNames: string[] = [];
    if (params) {
        for (const child of params.children) {
            collectPatternNames(child, patternNames);
        }
    }

    return { paramName, patternNames, body: body ?? null };
}

function collectPatternNames(
    node: Parser.SyntaxNode,
    names: string[],
): void {
    for (const child of node.children) {
        if (child.type === "object_pattern") {
            for (const prop of child.children) {
                if (prop.type === "shorthand_property_identifier_pattern") {
                    pushField(names, prop.text);
                } else if (prop.type === "pair_pattern") {
                    const key = prop.child(0)?.text;
                    if (key) pushField(names, key);
                }
            }
        }
    }
}

/** Resolve the callback parameter name from formal_parameters (identifier or required_parameter). */
function firstParameterName(params: Parser.SyntaxNode): string | null {
    for (const child of params.children) {
        if (child.type === "identifier") {
            return child.text;
        }
        if (child.type === "required_parameter" || child.type === "optional_parameter") {
            const inner = child.child(0);
            if (inner?.type === "identifier") {
                return inner.text;
            }
            // Destructured params have no single name. Handled via patternNames.
            return null;
        }
    }
    return null;
}

/** Find member chains rooted at the `.then` callback parameter. */
function walkBodyForChainRoots(
    node: Parser.SyntaxNode,
    paramName: string,
    fields: string[],
): void {
    if (node.type === "member_expression") {
        const props = chainProperties(node, paramName);
        if (props) {
            pushField(fields, props[0]);
        }
    }
    for (const child of node.children) {
        walkBodyForChainRoots(child, paramName, fields);
    }
}

function pushField(fields: string[], field: string): void {
    if (!fields.includes(field)) {
        fields.push(field);
    }
}

function valueEqualsCall(
    valueNode: Parser.SyntaxNode,
    callNode: Parser.SyntaxNode,
): boolean {
    // Simple positional comparison: same start position and same text
    if (
        valueNode.startPosition.row === callNode.startPosition.row &&
        valueNode.startPosition.column === callNode.startPosition.column
    ) {
        return true;
    }
    // Also check if it's an await expression wrapping the call
    if (valueNode.type === "await_expression") {
        const inner = valueNode.child(1);
        if (inner) {
            return valueEqualsCall(inner, callNode);
        }
    }
    return false;
}

// ── Main Extractor ───────────────────────────────────────────────────────────

export interface ExtractionResult {
    callSites: CallSite[];
    errors: Array<{
        file: string;
        line: number;
        message: string;
    }>;
}

export interface ExtractorOptions {
    /**
     * Vendor configs used for ENRICHMENT (endpoint inference, overrides,
     * verb hints) and as a fallback name-based detection layer for
     * import-less snippets. Detection is import-driven and captures ANY
     * external package call regardless of config, so no built-in vendor list.
     * Configs are produced by the docs-to-config agent (per vendor, keyed
     * by packageName) or supplied by the host pipeline; nothing is
     * hardcoded here. Defaults to [].
     */
    vendors?: VendorConfig[];
    /** Grammar to parse with. Defaults to "typescript". */
    language?: ParserLanguage;
    /**
     * Emit call sites for external packages with no matching VendorConfig.
     * These carry a packageName but no resolved endpoint; the sandbox
     * fills that from real traffic. Defaults to true.
     */
    captureUnknownPackages?: boolean;
}

export class TypeScriptExtractor {
    private parser: Parser;
    private vendors: VendorConfig[];
    private language: ParserLanguage;
    private captureUnknownPackages: boolean;

    constructor(options?: ExtractorOptions) {
        this.parser = new Parser();
        this.language = options?.language ?? "typescript";
        this.setLanguage(this.language);
        this.vendors = options?.vendors ?? [];
        this.captureUnknownPackages =
            options?.captureUnknownPackages ?? true;
    }

    private setLanguage(language: ParserLanguage): void {
        const grammar =
            language === "tsx"
                ? TypeScript.tsx
                : language === "javascript"
                  ? (JavaScript as unknown as typeof TypeScript)
                  : TypeScript.typescript;
        this.parser.setLanguage(grammar as never);
    }

    async extractFromFile(
        filePath: string,
        content: string,
        language?: ParserLanguage,
    ): Promise<ExtractionResult> {
        return this.extract(filePath, content, language);
    }

    async extract(
        filePath: string,
        content: string,
        language?: ParserLanguage,
    ): Promise<ExtractionResult> {
        const lang = language ?? this.language;
        if (lang !== this.language) {
            this.setLanguage(lang);
            this.language = lang;
        }

        const tree = this.parser.parse(content);
        const callSites: CallSite[] = [];
        const errors: Array<{ file: string; line: number; message: string }> =
            [];

        const variables = collectVariables(tree.rootNode);
        const resolver = new ImportResolver(tree.rootNode);

        this.walkTree(
            tree.rootNode,
            callSites,
            errors,
            filePath,
            variables,
            tree.rootNode,
            resolver,
        );

        return { callSites, errors };
    }

    private walkTree(
        node: Parser.SyntaxNode,
        callSites: CallSite[],
        errors: Array<{ file: string; line: number; message: string }>,
        filePath: string,
        variables: VariableDef[],
        rootNode: Parser.SyntaxNode,
        resolver: ImportResolver,
    ): void {
        if (node.type === "call_expression") {
            this.extractCallExpression(
                node,
                callSites,
                errors,
                filePath,
                variables,
                rootNode,
                resolver,
            );
        }

        for (const child of node.children) {
            this.walkTree(
                child,
                callSites,
                errors,
                filePath,
                variables,
                rootNode,
                resolver,
            );
        }
    }

    private extractCallExpression(
        node: Parser.SyntaxNode,
        callSites: CallSite[],
        errors: Array<{ file: string; line: number; message: string }>,
        filePath: string,
        variables: VariableDef[],
        rootNode: Parser.SyntaxNode,
        resolver: ImportResolver,
    ): void {
        try {
            const callee = node.child(0);
            if (!callee || callee.type !== "member_expression") {
                return;
            }

            const match = this.detectCall(callee, resolver);
            if (!match) {
                return;
            }

            const requestShape = extractRequestShape(node, variables);
            const responseFields = extractResponseFields(node, rootNode);

            const resolved = match.vendor
                ? resolveEndpoint(match.vendor, match.resource, match.method)
                : null;

            callSites.push({
                id: this.generateId(
                    filePath,
                    node.startPosition.row,
                    `${match.rootName}.${match.resource}.${match.method}`,
                ),
                repositoryId: "",
                filePath,
                line: node.startPosition.row + 1,
                method: `${match.rootName}.${match.resource}.${match.method}`,
                packageName: match.packageName,
                endpoint: resolved?.endpoint,
                httpMethod: resolved?.httpMethod,
                requestShape,
                responseFields,
                testFiles: [],
                lastCheckedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        } catch (error) {
            errors.push({
                file: filePath,
                line: node.startPosition.row + 1,
                message:
                    error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * Detect an external SDK call like `<client>.<resource>.<method>(...)`.
     *
     * Detection is IMPORT-DRIVEN: the chain root must resolve (via imports,
     * `require`, or `new`/factory re-bindings) to an external npm package.
     * No registry entry is required. Any vendor is captured. VendorConfigs
     * are pure enrichment (endpoint inference, overrides, verb hints),
     * looked up by package name. Configured `clientNames` are a fallback so
     * import-less snippets and global clients still resolve.
     */
    private detectCall(
        callee: Parser.SyntaxNode,
        resolver: ImportResolver,
    ): DetectedCall | null {
        // If the chain's base is itself a call expression (e.g. `.then(...)`),
        // this is a chained call, not an SDK call site.
        if (this.baseOfChain(callee)?.type === "call_expression") {
            return null;
        }

        const text = callee.text;
        const base = this.baseOfChain(callee);

        if (base?.type === "identifier") {
            const packageName = resolver.resolve(base.text);
            if (packageName) {
                const vendor = this.findVendor(packageName);
                if (!vendor && !this.allowUnknownPackage()) {
                    return null;
                }
                const chain = this.parseChain(text, `${base.text}.`);
                if (chain) {
                    return {
                        packageName,
                        rootName: base.text,
                        resource: chain.resource,
                        method: chain.method,
                        vendor,
                    };
                }
            }
        }

        for (const vendor of this.vendors) {
            for (const clientName of vendor.clientNames) {
                const chain = this.parseChain(text, `${clientName}.`);
                if (!chain) continue;
                return {
                    packageName: vendor.sdk,
                    rootName: clientName,
                    resource: chain.resource,
                    method: chain.method,
                    vendor,
                };
            }
        }

        return null;
    }

    /** Checks capture eligibility for unconfigured (import-only) packages. */
    private allowUnknownPackage(): boolean {
        return this.captureUnknownPackages;
    }

    private findVendor(packageName: string): VendorConfig | null {
        return (
            this.vendors.find(
                (vendor) =>
                    vendor.sdk === packageName || vendor.name === packageName,
            ) ?? null
        );
    }

    /**
     * Split `<prefix>resource.method` chain text into resource + method.
     * `stripe.charges.create` → { resource: "charges", method: "create" }.
     */
    private parseChain(
        text: string,
        prefix: string,
    ): { resource: string; method: string } | null {
        if (!text.startsWith(prefix)) return null;
        const segments = text.slice(prefix.length).split(".").filter(Boolean);
        if (segments.length < 2) return null;
        const method = segments[segments.length - 1];
        const resource = segments.slice(0, -1).join(".");
        return { resource, method };
    }

    private baseOfChain(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
        let current: Parser.SyntaxNode | null = node;
        while (current?.type === "member_expression") {
            current = current.child(0);
        }
        return current;
    }

    private generateId(filePath: string, line: number, method: string): string {
        return `${filePath}:${line}:${method}`.replace(/[^a-zA-Z0-9]/g, "_");
    }
}
