import { config } from "./config";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json",
            "access-control-allow-origin": config.corsOrigins.join(", "),
            ...headers,
        },
    });
}

export function notFound(message = "Not found"): Response {
    return json({ error: message }, 404);
}

export function badRequest(message = "Bad request"): Response {
    return json({ error: message }, 400);
}

export function corsResponse(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            "access-control-allow-origin": config.corsOrigins.join(", "),
            "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
            "access-control-max-age": "600",
        },
    });
}

export function isCorsPreflight(req: Request): boolean {
    return req.method === "OPTIONS";
}