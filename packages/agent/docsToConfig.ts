import {
    EndpointOverride,
    HttpMethod,
    ResourceConfig,
    VendorConfig,
    defaultHttpMethod,
    patternInferEndpoint,
} from "@driftlock/core";

// ── OpenAPI subset ───────────────────────────────────────────────────────────
// Only the fields the mapper actually reads. Accepts real OpenAPI 3.x documents
// without pulling in a schema validator.

export interface OpenApiOperation {
    operationId?: string;
    summary?: string;
    deprecated?: boolean;
}

export interface OpenApiPathItem {
    get?: OpenApiOperation;
    put?: OpenApiOperation;
    post?: OpenApiOperation;
    delete?: OpenApiOperation;
    patch?: OpenApiOperation;
}

export interface OpenApiSpec {
    info?: { title?: string; version?: string };
    servers?: Array<{ url: string }>;
    paths: Record<string, OpenApiPathItem>;
}

export interface DocsToConfigOptions {
    /** Canonical vendor name, e.g. "stripe". */
    name: string;
    /** npm package that provides the SDK. */
    sdk: string;
    /** Variable names that resolve to the client in user code. */
    clientNames: string[];
    /** Override the base path instead of deriving it from servers/paths. */
    basePath?: string;
    docs?: { url?: string; specUrl?: string };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type LowerHttpMethod = (typeof HTTP_METHODS)[number];

const VERB_TO_METHOD: Record<LowerHttpMethod, HttpMethod> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
};

function isPlaceholder(segment: string): boolean {
    return (
        (segment.startsWith("{") && segment.endsWith("}")) ||
        segment.startsWith(":")
    );
}

/**
 * Normalize a path into the extractor's endpoint convention: placeholders
 * become `:id`.
 */
function normalizeEndpoint(path: string): string {
    const trailingSlash = path.length > 1 && path.endsWith("/");
    const normalized = path
        .split("/")
        .filter(Boolean)
        .map((segment) => (isPlaceholder(segment) ? ":id" : segment))
        .join("/");
    return `${path.startsWith("/") ? "/" : ""}${normalized}${trailingSlash ? "/" : ""}`;
}

function camelCase(str: string): string {
    return str
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part, index) =>
            index === 0
                ? part.charAt(0).toLowerCase() + part.slice(1)
                : part.charAt(0).toUpperCase() + part.slice(1),
        )
        .join("");
}

/** Derive the shared base path from `servers`, falling back to the longest common path prefix. */
export function deriveBasePath(spec: OpenApiSpec): string {
    const serverUrl = spec.servers?.[0]?.url;
    if (serverUrl) {
        try {
            const parsed = new URL(serverUrl);
            const base = parsed.pathname.replace(/\/$/, "");
            if (base && base !== "/") {
                return base;
            }
        } catch {
            // server URLs may be relative templates; fall through to paths
            const base = serverUrl.replace(/\/$/, "");
            if (base.startsWith("/") && base !== "/") {
                return base;
            }
        }
    }

    const pathSegments = Object.keys(spec.paths).map((path) =>
        path.split("/").filter(Boolean),
    );
    if (pathSegments.length === 0) {
        return "";
    }

    let common = pathSegments[0];
    for (const segments of pathSegments.slice(1)) {
        let i = 0;
        while (i < common.length && i < segments.length && common[i] === segments[i]) {
            i++;
        }
        common = common.slice(0, i);
    }
    // Only treat the prefix as a base path if it's a literal (non-placeholder).
    const base = common.filter((segment) => !isPlaceholder(segment));
    return base.length > 0 ? `/${base.join("/")}` : "";
}

interface MethodMapping {
    resourcePath: string;
    method: string;
}

/**
 * Reverse of the extractor's inference: derive the `<resource>.<method>` key
 * a caller would use, from a path + HTTP verb.
 */
export function methodKeyFromPath(
    path: string,
    httpMethod: HttpMethod,
    operationId?: string,
): MethodMapping {
    const segments = path.split("/").filter(Boolean);
    const firstPlaceholder = segments.findIndex((s) => isPlaceholder(s));

    if (firstPlaceholder === -1) {
        // Collection path: GET → list, otherwise create.
        return {
            resourcePath: segments.map((s) => camelCase(s)).join("."),
            method: httpMethod === "GET" ? "list" : "create",
        };
    }

    const placeholderCount = segments.filter((s) => isPlaceholder(s)).length;
    const before = segments
        .slice(0, firstPlaceholder)
        .map((s) => camelCase(s))
        .join(".");
    const after = segments
        .slice(firstPlaceholder)
        .filter((s) => !isPlaceholder(s));

    const itemMethod = (): string =>
        httpMethod === "GET"
            ? "retrieve"
            : httpMethod === "DELETE"
              ? "delete"
              : "update";

    if (placeholderCount > 1) {
        // Nested item: /invoices/{id}/lines/{lineId} → invoices.lines.<verb>
        return {
            resourcePath: [before, ...after.map((s) => camelCase(s))]
                .filter(Boolean)
                .join("."),
            method: itemMethod(),
        };
    }

    if (after.length === 0) {
        // Item path: GET → retrieve, DELETE → delete, otherwise update.
        return { resourcePath: before, method: itemMethod() };
    }

    if (after.length === 1 && httpMethod !== "GET") {
        // Custom action: /invoices/{id}/finalize → invoices.finalizeInvoice
        // Prefer the operationId, which usually mirrors the SDK method name.
        return {
            resourcePath: before,
            method: camelCase(operationId ?? after[0]),
        };
    }

    // Nested / sub-resource collection: /invoices/{id}/lines → invoices.lines
    return {
        resourcePath: [before, ...after.map((s) => camelCase(s))]
            .filter(Boolean)
            .join("."),
        method: httpMethod === "GET" ? "list" : "create",
    };
}

function strippedPath(basePath: string, path: string): string {
    if (basePath && path.startsWith(basePath)) {
        return path.slice(basePath.length) || "/";
    }
    return path;
}

/**
 * Deterministically convert an OpenAPI spec into a `VendorConfig` the parser
 * can consume. Overrides are emitted only where the parser's own inference
 * would produce a different endpoint, so the output stays minimal and the
 * generated config reproduces the spec exactly.
 */
export function vendorConfigFromOpenApi(
    spec: OpenApiSpec,
    options: DocsToConfigOptions,
): VendorConfig {
    const basePath = options.basePath ?? deriveBasePath(spec);
    const resources: Record<string, ResourceConfig> = {};
    let sawAnyPath = false;

    for (const [rawPath, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem) continue;
        const endpoint = normalizeEndpoint(rawPath);
        const localPath = strippedPath(basePath, endpoint);

        for (const lowerMethod of HTTP_METHODS) {
            const operation = pathItem[lowerMethod];
            if (!operation) continue;
            sawAnyPath = true;

            const httpMethod = VERB_TO_METHOD[lowerMethod];
            const { resourcePath, method } = methodKeyFromPath(
                localPath,
                httpMethod,
                operation.operationId,
            );
            if (!resourcePath) continue;

            const inferred = patternInferEndpoint(basePath, resourcePath, method);
            const resource: ResourceConfig = (resources[resourcePath] ??= {});

            if (inferred !== endpoint) {
                const override: EndpointOverride = { endpoint };
                if (defaultHttpMethod(method) !== httpMethod) {
                    override.httpMethod = httpMethod;
                }
                resource.overrides = { ...resource.overrides, [method]: override };
            } else if (defaultHttpMethod(method) !== httpMethod) {
                resource.httpMethods = {
                    ...resource.httpMethods,
                    [method]: httpMethod,
                };
            }
        }
    }

    // Drop resource entries that ended up with no enrichments.
    for (const [key, value] of Object.entries(resources)) {
        if (!value.overrides && !value.httpMethods) {
            delete resources[key];
        }
    }

    const config: VendorConfig = {
        name: options.name,
        sdk: options.sdk,
        clientNames: options.clientNames,
        basePath,
    };
    if (sawAnyPath && Object.keys(resources).length > 0) {
        config.resources = resources;
    }
    if (options.docs) {
        config.docs = options.docs;
    }

    return validateVendorConfig(config);
}

// ── Validation ───────────────────────────────────────────────────────────────

class VendorConfigError extends Error {
    constructor(message: string) {
        super(`Invalid VendorConfig: ${message}`);
        this.name = "VendorConfigError";
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertHttpMethod(value: unknown, context: string): HttpMethod {
    if (
        value !== "GET" &&
        value !== "POST" &&
        value !== "PUT" &&
        value !== "DELETE" &&
        value !== "PATCH"
    ) {
        throw new VendorConfigError(
            `${context} must be one of GET/POST/PUT/DELETE/PATCH`,
        );
    }
    return value;
}

/**
 * Runtime-validate an unknown value (e.g. LLM JSON output) into a VendorConfig.
 * Throws a descriptive error on the first problem found.
 */
export function validateVendorConfig(input: unknown): VendorConfig {
    if (!isPlainObject(input)) {
        throw new VendorConfigError("expected an object");
    }

    const { name, sdk, clientNames, basePath, resources, docs } = input;

    if (typeof name !== "string" || name.trim() === "") {
        throw new VendorConfigError("`name` must be a non-empty string");
    }
    if (typeof sdk !== "string" || sdk.trim() === "") {
        throw new VendorConfigError("`sdk` must be a non-empty string");
    }
    if (
        !Array.isArray(clientNames) ||
        clientNames.length === 0 ||
        !clientNames.every((n) => typeof n === "string" && n.trim() !== "")
    ) {
        throw new VendorConfigError(
            "`clientNames` must be a non-empty array of non-empty strings",
        );
    }
    if (typeof basePath !== "string" || !basePath.startsWith("/")) {
        throw new VendorConfigError("`basePath` must be a string starting with '/'");
    }

    const normalized: VendorConfig = {
        name,
        sdk,
        clientNames: clientNames as string[],
        basePath,
    };

    if (resources !== undefined) {
        if (!isPlainObject(resources)) {
            throw new VendorConfigError("`resources` must be an object");
        }
        const normalizedResources: Record<string, ResourceConfig> = {};

        for (const [resourcePath, rawResource] of Object.entries(resources)) {
            if (!isPlainObject(rawResource)) {
                throw new VendorConfigError(
                    `resources.${resourcePath} must be an object`,
                );
            }
            const { overrides, httpMethods } = rawResource;
            const resource: ResourceConfig = {};

            if (overrides !== undefined) {
                if (!isPlainObject(overrides)) {
                    throw new VendorConfigError(
                        `resources.${resourcePath}.overrides must be an object`,
                    );
                }
                const normalizedOverrides: Record<string, string | EndpointOverride> = {};
                for (const [method, entry] of Object.entries(overrides)) {
                    if (typeof entry === "string") {
                        if (!entry.startsWith("/")) {
                            throw new VendorConfigError(
                                `resources.${resourcePath}.overrides.${method} must start with '/'`,
                            );
                        }
                        normalizedOverrides[method] = entry;
                        continue;
                    }
                    if (!isPlainObject(entry) || typeof entry.endpoint !== "string") {
                        throw new VendorConfigError(
                            `resources.${resourcePath}.overrides.${method} must be a string or { endpoint }`,
                        );
                    }
                    if (!entry.endpoint.startsWith("/")) {
                        throw new VendorConfigError(
                            `resources.${resourcePath}.overrides.${method}.endpoint must start with '/'`,
                        );
                    }
                    const override: EndpointOverride = {
                        endpoint: entry.endpoint,
                    };
                    if (entry.httpMethod !== undefined) {
                        override.httpMethod = assertHttpMethod(
                            entry.httpMethod,
                            `resources.${resourcePath}.overrides.${method}.httpMethod`,
                        );
                    }
                    normalizedOverrides[method] = override;
                }
                resource.overrides = normalizedOverrides;
            }

            if (httpMethods !== undefined) {
                if (!isPlainObject(httpMethods)) {
                    throw new VendorConfigError(
                        `resources.${resourcePath}.httpMethods must be an object`,
                    );
                }
                const normalizedHttp: Partial<Record<string, HttpMethod>> = {};
                for (const [method, value] of Object.entries(httpMethods)) {
                    normalizedHttp[method] = assertHttpMethod(
                        value,
                        `resources.${resourcePath}.httpMethods.${method}`,
                    );
                }
                resource.httpMethods = normalizedHttp;
            }

            normalizedResources[resourcePath] = resource;
        }

        if (Object.keys(normalizedResources).length > 0) {
            normalized.resources = normalizedResources;
        }
    }

    if (docs !== undefined) {
        if (!isPlainObject(docs)) {
            throw new VendorConfigError("`docs` must be an object");
        }
        const normalizedDocs: { url?: string; specUrl?: string } = {};
        if (docs.url !== undefined) {
            if (typeof docs.url !== "string") {
                throw new VendorConfigError("`docs.url` must be a string");
            }
            normalizedDocs.url = docs.url;
        }
        if (docs.specUrl !== undefined) {
            if (typeof docs.specUrl !== "string") {
                throw new VendorConfigError("`docs.specUrl` must be a string");
            }
            normalizedDocs.specUrl = docs.specUrl;
        }
        normalized.docs = normalizedDocs;
    }

    return normalized;
}
