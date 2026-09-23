import { getStore } from "../store";
import { driftEventDto } from "../dto";
import { json, notFound } from "../utils";

export async function handleRepoDrifts(url: URL): Promise<Response> {
    const match = url.pathname.match(
        /^\/api\/repos\/([^/]+)\/([^/]+)\/drifts$/,
    );
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const store = getStore();
    const repo = await store.getRepository(owner, name);
    if (!repo) {
        return notFound("Repo not found");
    }
    const rows = await store.listDriftEventsByRepo(repo.id);
    return json({ drifts: rows.map(driftEventDto) });
}