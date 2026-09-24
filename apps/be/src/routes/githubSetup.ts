import { getDb, settings } from "@driftlock/db";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export async function handleGitHubSetup(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const installationId = url.searchParams.get("installation_id");
    const setupAction = url.searchParams.get("setup_action") || "install";
    const state = url.searchParams.get("state");

    // Persist last installation for debugging
    if (installationId) {
        try {
            const db = getDb();
            await db.execute(`DELETE FROM settings WHERE key = 'last_installation'`);
            await db.insert(settings).values({
                key: "last_installation",
                value: { installationId, setupAction, at: new Date().toISOString() },
            });
        } catch {}
    }

    // state may contain returnTo path from handleInstallUrl
    let returnTo = "/";
    if (state) {
        try {
            returnTo = decodeURIComponent(state);
            if (!returnTo.startsWith("/")) returnTo = "/";
        } catch {
            returnTo = "/";
        }
    }

    // After install/update, land on accounts with a success flag
    const target = new URL(returnTo, FRONTEND_URL);
    target.searchParams.set("installed", "1");
    if (installationId) target.searchParams.set("installation_id", installationId);
    target.searchParams.set("action", setupAction);

    return Response.redirect(target.toString(), 302);
}
