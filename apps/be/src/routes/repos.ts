import { callSites, getRepo, pulls, setRepoPolicy, type Permission } from "../store";
import { badRequest, json, notFound } from "../utils";

export function handleRepo(url: URL): Response {
    const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const repo = getRepo(owner, name);
    if (!repo) {
        return notFound("Repo not found");
    }
    const key = `${owner}/${name}`;
    return json({
        repo,
        callsites: callSites[key] ?? [],
        drifts: [],
        pulls: pulls[key] ?? [],
    });
}

export function handleRepoCallSites(url: URL): Response {
    const match = url.pathname.match(
        /^\/api\/repos\/([^/]+)\/([^/]+)\/callsites$/,
    );
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const repo = getRepo(owner, name);
    if (!repo) {
        return notFound("Repo not found");
    }
    return json({ callsites: callSites[`${owner}/${name}`] ?? [] });
}

export function handleRepoPulls(url: URL): Response {
    const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/pulls$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const repo = getRepo(owner, name);
    if (!repo) {
        return notFound("Repo not found");
    }
    return json({ pulls: pulls[`${owner}/${name}`] ?? [] });
}

const PERMISSIONS: Permission[] = ["read", "read-write", "suggest-only"];

export async function handleRepoPolicy(
    url: URL,
    req: Request,
): Promise<Response> {
    const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/policy$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);

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
    const update: Record<string, unknown> = {};
    if (typeof patch.watched === "boolean") {
        update.watched = patch.watched;
    }
    if (typeof patch.permission === "string" && PERMISSIONS.includes(patch.permission as Permission)) {
        update.permission = patch.permission;
    }
    if (typeof patch.schedule === "string") {
        update.schedule = patch.schedule;
    }
    const repo = setRepoPolicy(owner, name, update);
    if (!repo) {
        return notFound("Repo not found");
    }
    return json({ repo });
}