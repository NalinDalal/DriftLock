import { rotateApiKey, settings } from "../store";
import { badRequest, json } from "../utils";

export function handleGetSettings(): Response {
    return json({ settings });
}

export async function handleUpdateSettings(req: Request): Promise<Response> {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return badRequest("Body must be JSON");
    }
    if (typeof body !== "object" || body === null) {
        return badRequest("Body must be an object");
    }
    const patch = body as Record<string, unknown>;
    if (typeof patch.autoProbe === "boolean") {
        settings.autoProbe = patch.autoProbe;
    }
    if (Array.isArray(patch.forwardWhitelist)) {
        settings.forwardWhitelist = patch.forwardWhitelist.filter(
            (entry): entry is string => typeof entry === "string",
        );
    }
    return json({ settings });
}

export function handleRotateApiKey(url: URL): Response {
    const name = url.searchParams.get("name")?.trim();
    if (!name) {
        return badRequest("Missing ?name=");
    }
    const key = rotateApiKey(name);
    return json({ key }, 201);
}