import { Link } from "@tanstack/react-router";
import { getAccounts } from "../api/client";
import type { Account } from "../api/types";
import { StatusDot } from "../components/StatusDot";
import { useFetch } from "../lib/useFetch";
import { timeAgo } from "../lib/format";

function AccountRow({ account }: { account: Account }) {
    const hasDrift = account.driftOpen > 0;
    return (
        <Link to="/accounts/$owner" params={{ owner: account.owner }} className="group flex items-center gap-4 border-b border-[#E6E7EE] py-4 first:border-t hover:bg-white/60 transition-colors">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#0F172A] text-[12px] font-semibold tracking-tight text-white">
                {account.owner.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold tracking-[-0.015em] text-[#0F172A]">
                    {account.owner}
                    <span className="ml-2 font-mono text-[11px] font-normal tracking-wide text-[#94A3B8]">{account.kind === "organization" ? "ORG" : "PERSONAL"}</span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#64748B]">
                    {account.repoCount} repos · <span className={hasDrift ? "text-[#DC2626] font-medium" : ""}>{account.driftOpen} drift open</span> · installed {timeAgo(account.installedAt)}
                </p>
            </div>
            <span className={`hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide ${hasDrift ? "text-[#DC2626]" : "text-[#059669]"}`}>
                <StatusDot tone={hasDrift ? "red" : "green"} pulsing={hasDrift} />
                {hasDrift ? "REVISION REQUIRED" : "LOCKED"}
            </span>
            <span className="flex h-7 w-7 items-center justify-center text-[#94A3B8] transition-colors group-hover:text-[#0F172A]">→</span>
        </Link>
    );
}

function SkeletonRow() {
    return <div className="h-[57px] border-b border-[#E6E7EE] animate-pulse bg-white/50" />;
}

export default function AccountsPage() {
    const { data, error, loading } = useFetch(() => getAccounts(), []);

    if (loading) {
        return (
            <div className="mx-auto max-w-[720px]">
                <div className="border-b border-[#0F172A] pb-4">
                    <p className="font-mono text-[11px] tracking-[0.14em] text-[#64748B]">ACCOUNTS</p>
                    <h1 className="mt-1 font-display text-[24px] tracking-[-0.02em] text-[#0F172A]">Where DriftLock is installed</h1>
                </div>
                <div className="mt-0">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-[720px]">
                <h1 className="font-display text-[24px] tracking-[-0.02em] text-[#0F172A]">Where DriftLock is installed</h1>
                <div className="mt-4 border border-[#DC2626] bg-[#FEF2F2] px-4 py-3 font-mono text-xs text-[#DC2626]">{error}</div>
                <p className="mt-3 font-mono text-xs text-[#64748B]">
                    No connection to API at <span className="text-[#0F172A]">{import.meta.env.VITE_API_URL ?? "/api"}</span>. Start the backend or view the landing at <Link to="/" className="underline">/</Link>.
                </p>
            </div>
        );
    }

    if ((data?.accounts.length ?? 0) === 0) {
        return (
            <div className="mx-auto max-w-[720px] text-center">
                <p className="font-mono text-[11px] tracking-[0.14em] text-[#64748B]">ACCOUNTS</p>
                <h1 className="mt-2 font-display text-[24px] tracking-[-0.02em] text-[#0F172A]">No accounts connected</h1>
                <p className="mt-2 font-mono text-xs text-[#64748B]">Install the GitHub App to start watching repos.</p>
                <Link to="/install" className="mt-4 inline-flex bg-[#0F172A] px-4 py-2 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B]">INSTALL GITHUB APP</Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[720px]">
            <div className="border-b border-[#0F172A] pb-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-[#64748B]">ACCOUNTS</p>
                <h1 className="mt-1 font-display text-[24px] tracking-[-0.02em] text-[#0F172A]">Where DriftLock is installed</h1>
                <p className="mt-1 font-mono text-xs text-[#64748B]">Every drift lands as a GitHub PR. Pick an account to see watched repos.</p>
            </div>
            <div className="mt-0">
                {data?.accounts.map((account) => (
                    <AccountRow key={account.owner} account={account} />
                ))}
            </div>
            <p className="mt-6 border-t border-[#E6E7EE] pt-3 font-mono text-[11px] tracking-wide text-[#94A3B8]">PAUSED REPOS STAY VISIBLE BUT NOT PROBED. TOGGLE IN SETTINGS.</p>
        </div>
    );
}
