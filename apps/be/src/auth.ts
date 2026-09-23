import { config } from "./config";
import { json } from "./utils";

/** Deny unauthenticated access when a BEARER_TOKEN is configured. */
export function requireBearer(req: Request): Response | null {
    if (!config.bearerToken) {
        return null;
    }
    const header = req.headers.get("authorization");
    if (header === `Bearer ${config.bearerToken}`) {
        return null;
    }
    return json({ error: "Unauthorized" }, 401);
}