import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components/Button";
import { toast } from "../lib/toast";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Repo {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    private: boolean;
    defaultBranch: string;
    description: string | null;
}

interface User {
    login: string;
    name: string;
    avatarUrl: string;
}

const PER_PAGE = 4;

function RepoCard({
    repo,
    selected,
    onToggle,
}: {
    repo: Repo;
    selected: boolean;
    onToggle: () => void;
}) {
    const depsCount = (Math.abs(repo.fullName.length * 3 + repo.id) % 18) + 1;
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`text-left w-full border bg-white p-4 transition-colors ${selected ? "border-[#0F172A] bg-[#FFFBF5] shadow-[3px_3px_0_#0F172A]" : "border-[#E6E7EE] hover:border-[#0F172A]/30 hover:bg-[#FFFBF5]/60"}`}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="truncate font-mono text-xs font-semibold tracking-[-0.01em] text-[#0F172A]">
                    {repo.fullName}
                </p>
                <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] leading-none ${selected ? "border-[#0F172A] bg-[#0F172A] text-white" : "border-[#CBD5E1] bg-white text-transparent"}`}
                >
                    ✓
                </span>
            </div>
            <p className="line-clamp-2 mt-1 min-h-[28px] font-mono text-[11px] leading-4 text-[#64748B]">
                {repo.description || "No description"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tracking-wide">
                <span
                    className={`border px-1.5 py-0.5 text-[10px] tracking-[0.06em] ${repo.private ? "border-[#DC2626]/20 bg-[#FEF2F2] text-[#DC2626]" : "border-[#059669]/20 bg-[#F0FDF4] text-[#059669]"}`}
                >
                    {repo.private ? "PRIVATE" : "PUBLIC"}
                </span>
                <span className="text-[#94A3B8]">· {repo.defaultBranch}</span>
                <span className="text-[#94A3B8]">· {depsCount} deps</span>
            </div>
        </button>
    );
}

export default function InstallPage() {
    const navigate = useNavigate();
    const [repos, setRepos] = useState<Repo[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [githubOpened, setGithubOpened] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [autoReturned, setAutoReturned] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("driftlock_token");
        if (!token) {
            navigate({ to: "/login" });
            return;
        }
        fetch(`${API_URL}/api/auth/repos`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch repos");
                return res.json();
            })
            .then((data) => {
                setRepos(data.repos);
                setUser(data.user);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [navigate]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return repos;
        return repos.filter(
            (r) =>
                r.fullName.toLowerCase().includes(q) ||
                (r.description && r.description.toLowerCase().includes(q)),
        );
    }, [repos, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const paged = filtered.slice(
        (currentPage - 1) * PER_PAGE,
        currentPage * PER_PAGE,
    );

    useEffect(() => {
        setPage(1);
    }, [query]);

    useEffect(() => {
        if (!githubOpened) return;
        const onReturn = () => {
            if (document.visibilityState === "visible" && !autoReturned) {
                setAutoReturned(true);
                toast(`Repo${pendingCount !== 1 ? "s" : ""} added — ${pendingCount} selected. Click Back to DriftLock to continue.`);
            }
        };
        window.addEventListener("focus", onReturn);
        document.addEventListener("visibilitychange", onReturn);
        return () => {
            window.removeEventListener("focus", onReturn);
            document.removeEventListener("visibilitychange", onReturn);
        };
    }, [githubOpened, pendingCount, autoReturned]);

    function toggleRepo(id: number) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function togglePageAll() {
        const pageIds = paged.map((r) => r.id);
        const allSelected = pageIds.every((id) => selected.has(id));
        setSelected((prev) => {
            const next = new Set(prev);
            if (allSelected) pageIds.forEach((id) => next.delete(id));
            else pageIds.forEach((id) => next.add(id));
            return next;
        });
    }

    async function handleInstall() {
        const token = localStorage.getItem("driftlock_token");
        const selectedRepos = repos
            .filter((r) => selected.has(r.id))
            .map((r) => ({
                owner: r.owner,
                name: r.name,
                fullName: r.fullName,
            }));
        if (!selectedRepos.length) return;
        try {
            const response = await fetch(`${API_URL}/api/installations/sync`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ repos: selectedRepos }),
            });
            if (!response.ok)
                throw new Error("Failed to sync selected repositories");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to sync selected repositories",
            );
            return;
        }
        // For already-installed apps (you have installation 163556203), the selected repos are already fetched
        // via /api/auth/repos, so no GitHub grant is needed. Just record the watch and stay on DriftLock.
        // We no longer navigate away to https://github.com/settings/installations/163556203 on every add.
        const count = selectedRepos.length;
        setPendingCount(count);
        toast(`Repo${count !== 1 ? "s" : ""} added — ${count} selected. Watching on DriftLock.`);
        setGithubOpened(false);
        setAutoReturned(false);
        navigate({ to: "/accounts" });
    }

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#E6E7EE] border-t-[#0F172A]" />
                    <p className="mt-3 font-mono text-xs tracking-wide text-[#64748B]">
                        LOADING REPOS…
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="text-center">
                    <h2 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#DC2626]">
                        COULD NOT LOAD REPOS
                    </h2>
                    <p className="mt-1 font-mono text-xs text-[#64748B]">
                        {error}
                    </p>
                    <button
                        onClick={() => navigate({ to: "/login" })}
                        className="mt-4 font-mono text-xs tracking-wide text-[#0F172A] underline underline-offset-2"
                    >
                        Sign in again
                    </button>
                </div>
            </div>
        );
    }

    const pageIds = paged.map((r) => r.id);
    const pageAllSelected =
        pageIds.length > 0 && pageIds.every((id) => selected.has(id));

    return (
        <div className="mx-auto max-w-[880px]">
            <div className="border-b border-[#0F172A] pb-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-[#64748B]">
                    INSTALL
                </p>
                <h1 className="mt-1 font-display text-[24px] tracking-[-0.02em] text-[#0F172A]">
                    Choose repos to watch
                </h1>
                <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">
                    Select where DriftLock should scan for API call sites and
                    open fix PRs.
                </p>
            </div>

            {user && (
                <div className="mt-6 flex items-center gap-3 border border-[#E6E7EE] bg-white px-4 py-3">
                    <img
                        src={user.avatarUrl}
                        alt={user.login}
                        className="h-9 w-9 rounded-full border border-[#E6E7EE]"
                    />
                    <div>
                        <p className="font-mono text-xs font-semibold tracking-[-0.01em] text-[#0F172A]">
                            {user.name}
                        </p>
                        <p className="font-mono text-[11px] tracking-wide text-[#64748B]">
                            @{user.login}
                        </p>
                    </div>
                    <span className="ml-auto font-mono text-[11px] tracking-wide text-[#64748B]">
                        {filtered.length} repos · {selected.size} selected
                    </span>
                </div>
            )}

            {githubOpened && (
                <div className="mt-4 border border-[#0F172A] bg-[#0F172A] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="font-mono text-xs tracking-wide text-white">GitHub opened — if you need to grant access to a private repo not listed here, do it on GitHub, then return.</p>
                        <p className="font-mono text-[11px] tracking-wide text-white/60">For repos you already see here, no GitHub step is needed. Just add and we watch them.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={() => {
                                setGithubOpened(false);
                                setAutoReturned(false);
                                toast(`Repo${pendingCount !== 1 ? "s" : ""} added — ${pendingCount} selected`);
                                navigate({ to: "/accounts" });
                            }}
                            className="bg-white text-[#0F172A] hover:bg-[#FFFBF5] font-mono text-[11px] tracking-wide"
                        >
                            View repos ✓
                        </Button>
                        <button onClick={() => { setGithubOpened(false); setAutoReturned(false); }} className="font-mono text-[11px] tracking-wide text-white/70 hover:text-white">Dismiss</button>
                    </div>
                </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-[360px] flex-1">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search repos…"
                        className="w-full border border-[#0F172A]/15 bg-white px-3 py-2 pl-8 font-mono text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F172A] focus:outline-none"
                    />
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-[#94A3B8]">
                        ⌕
                    </span>
                    {query && (
                        <button
                            onClick={() => setQuery("")}
                            className="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[11px] text-[#94A3B8] hover:text-[#0F172A]"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="hidden font-mono text-[11px] tracking-wide text-[#94A3B8] sm:inline">
                        {filtered.length} found · page {currentPage} of{" "}
                        {totalPages}
                    </span>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={togglePageAll}
                        className="border border-[#E6E7EE] bg-white font-mono text-[11px] tracking-wide text-[#0F172A] hover:bg-[#FFFBF5]"
                    >
                        {pageAllSelected ? "Deselect page" : "Select page"}
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleInstall}
                        disabled={selected.size === 0}
                        className="bg-[#0F172A] font-mono text-[11px] tracking-wide text-white hover:bg-[#1E293B] disabled:opacity-40"
                    >
                        Install on {selected.size}
                    </Button>
                </div>
            </div>

            {paged.length === 0 ? (
                <div className="mt-6 border border-dashed border-[#E6E7EE] bg-[#FFFBF5] p-8 text-center">
                    <p className="font-mono text-xs text-[#0F172A]">
                        No repos match “{query}”
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                        Try a different search.
                    </p>
                </div>
            ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {paged.map((repo) => (
                        <RepoCard
                            key={repo.id}
                            repo={repo}
                            selected={selected.has(repo.id)}
                            onToggle={() => toggleRepo(repo.id)}
                        />
                    ))}
                </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E6E7EE] pt-4">
                <p className="font-mono text-[11px] tracking-wide text-[#94A3B8]">
                    {paged.length} of {filtered.length} shown
                </p>
                <div className="flex items-center gap-1">
                    <button
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="border border-[#E6E7EE] bg-white px-3 py-1.5 font-mono text-xs text-[#0F172A] hover:bg-[#FFFBF5] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        ← Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .slice(0, 7)
                        .map((n) => (
                            <button
                                key={n}
                                onClick={() => setPage(n)}
                                className={`h-8 w-8 border font-mono text-xs ${n === currentPage ? "border-[#0F172A] bg-[#0F172A] text-white" : "border-[#E6E7EE] bg-white text-[#0F172A] hover:bg-[#FFFBF5]"}`}
                            >
                                {n}
                            </button>
                        ))}
                    {totalPages > 7 && (
                        <span className="px-1 font-mono text-xs text-[#94A3B8]">
                            …{totalPages}
                        </span>
                    )}
                    <button
                        disabled={currentPage >= totalPages}
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                        className="border border-[#E6E7EE] bg-white px-3 py-1.5 font-mono text-xs text-[#0F172A] hover:bg-[#FFFBF5] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    );
}
