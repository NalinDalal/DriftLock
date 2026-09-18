import { drifts, getRepo } from "../store";
import { json, notFound } from "../utils";

export function handleRepoDrifts(url: URL): Response {
    const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/drifts$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const repo = getRepo(owner, name);
    if (!repo) {
        return notFound("Repo not found");
    }
    return json({ drifts: drifts[`${owner}/${name}`] ?? [] });
}