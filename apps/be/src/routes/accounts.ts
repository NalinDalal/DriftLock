import { getStore } from "../store";
import { repoDto, type AccountDto, type RepoDto } from "../dto";
import { json, notFound } from "../utils";

export async function handleMe(): Promise<Response> {
    return json({
        user: {
            name: "Nalin Dalal",
            handle: "nalin",
            avatarUrl: "https://avatars.githubusercontent.com/u/0?s=96&v=4",
        },
    });
}

export async function handleAccounts(): Promise<Response> {
    const store = getStore();
    const repos = await store.listRepositories();
    const installations = await store.listInstallations();
    const kinds = new Map<string, AccountDto["kind"]>(
        installations.map((i) => [
            i.accountLogin,
            i.accountType === "organization" ? "organization" : "user",
        ]),
    );
    const installedAt = new Map(
        installations.map((i) => [i.accountLogin, i.createdAt]),
    );

    const byOwner = new Map<string, AccountDto>();
    for (const repo of repos) {
        let account = byOwner.get(repo.owner);
        if (!account) {
            account = {
                owner: repo.owner,
                kind: kinds.get(repo.owner) ?? "user",
                installedAt: (
                    installedAt.get(repo.owner) ?? repo.createdAt
                ).toISOString(),
                repoCount: 0,
                driftOpen: 0,
                pullsOpen: 0,
            };
            byOwner.set(repo.owner, account);
        }
        const stats = await store.countStats(repo.id);
        account.repoCount += 1;
        account.driftOpen += stats.driftOpen;
        account.pullsOpen += stats.pullsOpen;
    }
    return json({ accounts: [...byOwner.values()] });
}

export async function handleAccountRepos(url: URL): Promise<Response> {
    const match = url.pathname.match(/^\/api\/accounts\/([^/]+)\/repos$/);
    if (!match) {
        return notFound();
    }
    const owner = decodeURIComponent(match[1]);
    const store = getStore();
    const rows = await store.listReposByOwner(owner);
    if (rows.length === 0) {
        return notFound("Account not found");
    }
    const repos: RepoDto[] = [];
    for (const row of rows) {
        repos.push(await repoDto(store, row));
    }
    return json({ repos });
}