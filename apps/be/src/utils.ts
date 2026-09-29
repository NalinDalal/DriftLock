import { config } from "./config";

/**
 * Origin to echo for CORS. A joined multi-origin list is invalid (and
 * unusable with credentials), so the request Origin is echoed when it is
 * allowlisted, and nothing otherwise.
 */
export function allowedOrigin(req: Request): string | null {
    const origin = req.headers.get("origin");
    if (origin && (config.corsOrigins as readonly string[]).includes(origin)) {
        return origin;
    }
    return null;
}

export function corsHeaders(req: Request): Record<string, string> {
    const origin = allowedOrigin(req);
    return {
        ...(origin
            ? { "access-control-allow-origin": origin, vary: "Origin" }
            : {}),
        "access-control-allow-credentials": "true",
    };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json",
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

export function corsResponse(req: Request): Response {
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(req),
            "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
            "access-control-max-age": "600",
        },
    });
}

export function isCorsPreflight(req: Request): boolean {
    return req.method === "OPTIONS";
}