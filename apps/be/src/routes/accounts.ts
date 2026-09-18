import { accounts, repos } from "../store";
import { json, notFound } from "../utils";

export function handleMe(): Response {
    return json({
        user: {
            name: "Nalin Dalal",
            handle: "nalin",
            avatarUrl: "https://avatars.githubusercontent.com/u/0?s=96&v=4",
        },
    });
}

export function handleAccounts(): Response {
    return json({ accounts });
}

export function handleAccountRepos(url: URL): Response {
    const match = url.pathname.match(/^\/api\/accounts\/([^/]+)\/repos$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    if (!accounts.some((a) => a.owner === owner)) {
        return notFound("Account not found");
    }
    return json({ repos: repos.filter((r) => r.owner === owner) });
}