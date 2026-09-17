import type { HttpMethod } from "./vendors";

/** "checkout.sessions" → "checkout/sessions"; each segment is snake_cased. */
export function snakeCase(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** "checkout.sessions" → "checkout/sessions" */
export function resourceToPath(resourcePath: string): string {
    return resourcePath
        .split(".")
        .filter(Boolean)
        .map((segment) => snakeCase(segment))
        .join("/");
}

/**
 * Default endpoint for a `<resource>.<method>` pair when no override applies.
 * `create`/`list` hit the collection; `retrieve`/`update`/`delete` hit the
 * item; any other method is treated as a custom action on the item.
 */
export function patternInferEndpoint(
    basePath: string,
    resourcePath: string,
    method: string,
): string {
    const path = resourceToPath(resourcePath);

    switch (method) {
        case "create":
        case "list":
            return `${basePath}/${path}`;
        case "retrieve":
        case "update":
        case "delete":
            return `${basePath}/${path}/:id`;
        default:
            return `${basePath}/${path}/:id/${snakeCase(method)}`;
    }
}

/** Default HTTP verb for a conventional CRUD method name. */
export function defaultHttpMethod(method: string): HttpMethod {
    switch (method) {
        case "create":
        case "update":
            return "POST";
        case "retrieve":
        case "list":
            return "GET";
        case "delete":
            return "DELETE";
        default:
            return "POST";
    }
}
