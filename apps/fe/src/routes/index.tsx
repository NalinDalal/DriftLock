import { Link } from "@tanstack/react-router";
import { getAccounts } from "../api/client";
import type { Account } from "../api/types";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusDot } from "../components/StatusDot";
import { useFetch } from "../lib/useFetch";
import { timeAgo } from "../lib/format";

function AccountCard({ account }: { account: Account }) {
    return (
        <Link
            to="/accounts/$owner"
            params={{ owner: account.owner }}
            className="group"
        >
            <Card className="flex items-center gap-4 p-5 transition-colors duration-150 hover:border-neutral-300 group-hover:bg-neutral-50">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-sm font-semibold text-white">
                    {account.owner.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-neutral-900">
                            {account.owner}
                        </p>
                        <span className="text-xs text-neutral-400">
                            {account.kind === "organization"
                                ? "organization"
                                : "personal"}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                        {account.repoCount} repos · {account.driftOpen} drift
                        open · installed {timeAgo(account.installedAt)}
                    </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <StatusDot tone={account.driftOpen > 0 ? "amber" : "green"} />
                    {account.repoCount > 0 && (
                        <span className="ml-3 inline-block text-neutral-300 transition-transform duration-150 group-hover:translate-x-0.5">
                            →
                        </span>
                    )}
                </span>
            </Card>
        </Link>
    );
}

export default function AccountsPage() {
    const { data, error, loading } = useFetch(() => getAccounts(), []);

    return (
        <div>
            <PageHeader
                eyebrow="Accounts"
                title="Where DriftLock is installed"
                description="Pick an account to open its watched repos. Every change DriftLock proposes lands as a GitHub PR."
            />
            {loading ? (
                <p className="text-sm text-neutral-500">Loading accounts...</p>
            ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {data?.accounts.map((account) => (
                        <AccountCard
                            key={account.owner}
                            account={account}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}