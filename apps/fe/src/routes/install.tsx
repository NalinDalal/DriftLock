import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Repo {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    private: boolean;
    defaultBranch: string;
}

interface User {
    login: string;
    name: string;
    avatarUrl: string;
}

export default function InstallPage() {
    const navigate = useNavigate();
    const [repos, setRepos] = useState<Repo[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    function toggleRepo(id: number) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function selectAll() {
        setSelected(new Set(repos.map((r) => r.id)));
    }

    async function handleInstall() {
        const token = localStorage.getItem("driftlock_token");
        const selectedRepos = repos.filter((r) => selected.has(r.id)).map((r) => ({ owner: r.owner, name: r.name, fullName: r.fullName }));
        if (selectedRepos.length) {
            await fetch(`${API_URL}/api/installations/sync`, {
                method: "POST",
                headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ repos: selectedRepos }),
            }).catch(() => {});
        }
        const repoIds = Array.from(selected).join(",");
        window.location.href = `${API_URL}/api/auth/install?repos=${repoIds}`;
    }

    if (loading) {
        return (
            <div className="flex min-h-[80vh] items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-neutral-300 border-t-neutral-900 rounded-full mx-auto" />
                    <p className="mt-4 text-sm text-neutral-500">Loading your repos...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[80vh] items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-red-600">Error</h2>
                    <p className="mt-2 text-sm text-neutral-500">{error}</p>
                    <button
                        onClick={() => navigate({ to: "/login" })}
                        className="mt-4 text-sm text-blue-600 hover:underline"
                    >
                        Sign in again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                eyebrow="Install"
                title="Install DriftLock"
                description="Select the repos where you want DriftLock to monitor API drift and create fix PRs."
            />

            {user && (
                <div className="flex items-center gap-3">
                    <img
                        src={user.avatarUrl}
                        alt={user.login}
                        className="h-10 w-10 rounded-full"
                    />
                    <div>
                        <p className="text-sm font-medium text-neutral-900">{user.name}</p>
                        <p className="text-xs text-neutral-500">@{user.login}</p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-600">
                    {repos.length} repos found, {selected.size} selected
                </p>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={selectAll}>
                        Select all
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleInstall}
                        disabled={selected.size === 0}
                    >
                        Install on {selected.size} repo{selected.size !== 1 ? "s" : ""}
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {repos.map((repo) => (
                    <Card
                        key={repo.id}
                        className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${
                            selected.has(repo.id)
                                ? "border-blue-500 bg-blue-50"
                                : "hover:bg-neutral-50"
                        }`}
                        onClick={() => toggleRepo(repo.id)}
                    >
                        <input
                            type="checkbox"
                            checked={selected.has(repo.id)}
                            onChange={() => toggleRepo(repo.id)}
                            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-neutral-900">
                                {repo.fullName}
                            </p>
                            <p className="text-xs text-neutral-500">
                                {repo.private ? "Private" : "Public"} · {repo.defaultBranch}
                            </p>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
