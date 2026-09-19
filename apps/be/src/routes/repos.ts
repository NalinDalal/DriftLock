import { getStore } from "../store";
import { callSiteDto, pullDto, repoDto } from "../dto";
import { badRequest, json, notFound } from "../utils";

const PERMISSIONS = ["read", "read-write", "suggest-only"] as const;

async function findRepo(owner: string, name: string) {
    const store = getStore();
    const repo = await store.getRepository(owner, name);
    if (!repo) {
        return null;
    }
    return { store, repo };
}

export async function handleRepo(url: URL): Promise<Response> {
    const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const found = await findRepo(owner, name);
    if (!found) {
        return notFound("Repo not found");
    }
    const { store, repo } = found;
    const callSiteRows = await store.listCallSites(repo.id);
    const pullRows = await store.listPullsByRepo(repo.id);
    return json({
        repo: await repoDto(store, repo),
        callsites: callSiteRows.map(callSiteDto),
        drifts: [],
        pulls: pullRows
            .map((row) => pullDto(row, owner, name))
            .filter((pull): pull is NonNullable<typeof pull> => pull !== null),
    });
}

export async function handleRepoCallSites(url: URL): Promise<Response> {
    const match = url.pathname.match(
        /^\/api\/repos\/([^/]+)\/([^/]+)\/callsites$/,
    );
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const found = await findRepo(owner, name);
    if (!found) {
        return notFound("Repo not found");
    }
    const rows = await found.store.listCallSites(found.repo.id);
    return json({ callsites: rows.map(callSiteDto) });
}

export async function handleRepoPulls(url: URL): Promise<Response> {
    const match = url.pathname.match(
        /^\/api\/repos\/([^/]+)\/([^/]+)\/pulls$/,
    );
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const found = await findRepo(owner, name);
    if (!found) {
        return notFound("Repo not found");
    }
    const rows = await found.store.listPullsByRepo(found.repo.id);
    return json({
        pulls: rows
            .map((row) => pullDto(row, owner, name))
            .filter((pull): pull is NonNullable<typeof pull> => pull !== null),
    });
}

export async function handleRepoPolicy(
    url: URL,
    req: Request,
): Promise<Response> {
    const match = url.pathname.match(
        /^\/api\/repos\/([^/]+)\/([^/]+)\/policy$/,
    );
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
    const update: {
        watched?: boolean;
        permission?: (typeof PERMISSIONS)[number];
        schedule?: string;
    } = {};
    if (typeof patch.watched === "boolean") {
        update.watched = patch.watched;
    }
    if (
        typeof patch.permission === "string" &&
        PERMISSIONS.includes(patch.permission as (typeof PERMISSIONS)[number])
    ) {
        update.permission = patch.permission as (typeof PERMISSIONS)[number];
    }
    if (typeof patch.schedule === "string") {
        update.schedule = patch.schedule;
    }
    const found = await findRepo(owner, name);
    if (!found) {
        return notFound("Repo not found");
    }
    await found.store.updatePolicy(owner, name, update);
    const repo = await found.store.getRepository(owner, name);
    return json({ repo: await repoDto(found.store, repo!) });
}