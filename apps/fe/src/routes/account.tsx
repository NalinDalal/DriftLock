import { Link } from "@tanstack/react-router";
import { getAccountRepos } from "../api/client";
import type { Repo } from "../api/types";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusDot } from "../components/StatusDot";
import { useFetch } from "../lib/useFetch";
import { timeAgo } from "../lib/format";

function RepoRow({ repo }: { repo: Repo }) {
    const dirty = repo.stats.driftOpen > 0 || repo.stats.pullsOpen > 0;
    return (
        <Link
            to="/repos/$owner/$name"
            params={{ owner: repo.owner, name: repo.name }}
            className="group"
        >
            <Card className="flex items-center gap-5 p-5 transition-colors duration-150 hover:border-neutral-300 group-hover:bg-neutral-50">
                <StatusDot tone={dirty ? "amber" : "green"} pulsing={dirty} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-neutral-900">
                            {repo.owner}/{repo.name}
                        </p>
                        {repo.isPrivate && <Badge tone="neutral">private</Badge>}
                        {!repo.watched && <Badge tone="neutral">paused</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {repo.description}
                    </p>
                </div>
                <div className="hidden items-center gap-6 text-xs text-neutral-500 sm:flex">
                    <div className="text-right">
                        <span className="font-medium text-neutral-900">
                            {repo.stats.callSites}
                        </span>{" "}
                        call sites
                    </div>
                    <div className="text-right">
                        <span
                            className={`font-medium ${
                                repo.stats.driftOpen > 0
                                    ? "text-amber-600"
                                    : "text-neutral-900"
                            }`}
                        >
                            {repo.stats.driftOpen}
                        </span>{" "}
                        drift
                    </div>
                    <div className="text-right">
                        <span className="font-medium text-neutral-900">
                            {repo.stats.pullsOpen}
                        </span>{" "}
                        PRs
                    </div>
                    <div className="w-16 text-right text-neutral-400">
                        {timeAgo(repo.stats.lastProbeAt)}
                    </div>
                </div>
                <span className="text-neutral-300 transition-transform duration-150 group-hover:translate-x-0.5">
                    →
                </span>
            </Card>
        </Link>
    );
}

export default function AccountPage({
    owner,
}: {
    owner: string;
}) {
    const { data, error, loading } = useFetch(
        () => getAccountRepos(owner),
        [owner],
    );

    return (
        <div>
            <Link
                to="/"
                className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors duration-150 hover:text-neutral-900"
            >
                ← Accounts
            </Link>
            <PageHeader
                eyebrow="Account"
                title={owner}
                description="Watched repos in this account, ranked by current drift health."
            />
            {loading ? (
                <p className="text-sm text-neutral-500">Loading repos...</p>
            ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {data?.repos.map((repo) => (
                        <RepoRow key={`${repo.owner}/${repo.name}`} repo={repo} />
                    ))}
                </div>
            )}
        </div>
    );
}