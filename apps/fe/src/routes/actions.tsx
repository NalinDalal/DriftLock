import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const DEFAULT_API_URL = "https://api.driftlock.dev";

interface Repo {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    private: boolean;
    defaultBranch: string;
    description: string | null;
}

async function copy(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast(`${label} copied`);
    } catch {
        toast("Copy failed, select the text manually");
    }
}

export default function ActionsPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [repos, setRepos] = useState<Repo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [repo, setRepo] = useState<Repo | null>(null);
    const [rawKey, setRawKey] = useState<string | null>(null);
    const [issuing, setIssuing] = useState(false);
    const [yaml, setYaml] = useState<string | null>(null);
    // Preselect after /install: /actions?repo=owner/name skips the picker.
    const { repo: preselectedFullName } = useSearch({ from: "/actions" });

    useEffect(() => {
        document.title = "GitHub Actions | DriftLock";
        track("actions_view", {});
        fetch(`${API_URL}/api/auth/repos`, {
            credentials: "include",
        })
            .then((res) => {
                if (res.status === 401) {
                    navigate({ to: "/login" });
                    throw new Error("Not signed in");
                }
                if (!res.ok) throw new Error("Failed to fetch repos");
                return res.json();
            })
            .then((data) => {
                const list = (data.repos ?? []) as Repo[];
                setRepos(list);
                setLoading(false);
                const match = preselectedFullName
                    ? list.find((r) => r.fullName.toLowerCase() === preselectedFullName.toLowerCase())
                    : undefined;
                if (match) {
                    setRepo(match);
                    track("actions_repo_preselected", { repo: match.fullName });
                    setStep(3);
                } else {
                    setStep(2);
                }
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [navigate, preselectedFullName]);

    async function issueKey() {
        if (!repo) return;
        setIssuing(true);
        try {
            const res = await fetch(
                `${API_URL}/api/settings/rotate?name=${encodeURIComponent(`${repo.owner}-${repo.name}-actions`)}`,
                { method: "POST", credentials: "include" },
            );
            if (!res.ok) throw new Error("Failed to issue key");
            const data = (await res.json()) as { key: { raw: string } };
            setRawKey(data.key.raw);
            track("actions_key_issued", { repo: repo.fullName });
            setStep(3);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to issue key");
        } finally {
            setIssuing(false);
        }
    }

    useEffect(() => {
        if (step !== 3 || !repo) return;
        fetch(`${API_URL}/api/templates/actions`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load template");
                return res.json();
            })
            .then((data: { yaml: string }) => {
                const filled = data.yaml
                    .replaceAll("__OWNER__", repo.owner)
                    .replaceAll("__REPO__", repo.name)
                    .replaceAll("__BRANCH__", repo.defaultBranch || "main")
                    .replaceAll("__API_URL__", API_URL || DEFAULT_API_URL);
                setYaml(filled);
                track("actions_yaml_viewed", { repo: repo.fullName });
            })
            .catch(() => setYaml(null));
    }, [step, repo]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <p className="font-mono text-xs tracking-wide text-[var(--color-muted)]">LOADING REPOS…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="text-center">
                    <p className="font-mono text-xs text-[var(--color-signal-red)]">COULD NOT LOAD REPOS: {error}</p>
                    <button onClick={() => navigate({ to: "/login" })} className="mt-4 font-mono text-xs text-[var(--color-ink)] underline underline-offset-2">
                        Sign in again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="-mx-6 -mt-8">
            <div className="border-b border-[var(--color-line-strong)] bg-[var(--color-paper)]">
                <div className="mx-auto max-w-[1080px] px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
                    <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">
                        CONNECT · STEP {Math.min(step, 3)} OF 3 · RUNS ON YOUR RUNNERS
                    </p>
                    <h1 className="display mt-4 max-w-[640px] text-[var(--color-ink)]">
                        {step === 2 && "Which repo do we protect?"}
                        {step === 3 && "Paste one secret, push one file."}
                    </h1>
                    <p className="mt-4 max-w-[520px] font-mono text-[13px] leading-5 text-[var(--color-ink)]/80">
                        {step === 2 && "Detection runs on GitHub Actions in your repo. Your code never leaves your infrastructure."}
                        {step === 3 && "Models are managed and included in your credits — there is no AI key to add. This DriftLock key is shown once; after this screen it exists only as a hash."}
                    </p>
                </div>
            </div>

            <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-12">
                {step === 2 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {repos.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                    setRepo(r);
                                    track("actions_repo_selected", { repo: r.fullName });
                                    setStep(3);
                                }}
                                className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5 text-left transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.99]"
                            >
                                <p className="truncate font-mono text-sm font-semibold text-[var(--color-ink)]">{r.fullName}</p>
                                <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
                                    {r.private ? "PRIVATE" : "PUBLIC"} · {r.defaultBranch} · {r.description || "No description"}
                                </p>
                            </button>
                        ))}
                        {repos.length === 0 && (
                            <p className="font-mono text-xs text-[var(--color-muted)]">
                                No repos found. Install the GitHub App first via <Link to="/install" className="underline underline-offset-2">/install</Link>.
                            </p>
                        )}
                    </div>
                )}

                {step === 3 && repo && (
                    <div className="flex flex-col gap-6">
                        <p className="font-mono text-xs text-[var(--color-muted)]">
                            PROTECTING <span className="text-[var(--color-ink)]">{repo.fullName}</span>
                            <button onClick={() => setStep(2)} className="ml-3 underline underline-offset-2">CHANGE</button>
                        </p>
                        {!rawKey && (
                            <button
                                onClick={issueKey}
                                disabled={issuing}
                                className="self-start bg-[var(--color-ink)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] disabled:opacity-40"
                            >
                                {issuing ? "ISSUING…" : "ISSUE KEY AND CONTINUE →"}
                            </button>
                        )}
                        {rawKey && (
                            <div className="border border-[var(--color-signal-red)]/30 bg-[var(--color-red-bg)] px-4 py-3">
                                <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-[var(--color-signal-red)]">
                                    YOUR DRIFTLOCK KEY, SHOWN ONCE
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <code className="flex-1 min-w-[240px] break-all border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-ink)]">
                                        {rawKey}
                                    </code>
                                    <button
                                        onClick={() => copy(rawKey, "Key")}
                                        className="bg-[var(--color-ink)] px-4 py-2 font-mono text-[11px] tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90"
                                    >
                                        COPY
                                    </button>
                                </div>
                            </div>
                        )}

                        {rawKey && (
                            <div>
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">1 · ADD SECRET: REPO → SETTINGS → SECRETS → ACTIONS</p>
                                <div className="mt-2 border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 font-mono text-xs leading-6 text-[var(--color-ink)]">
                                    <p>DRIFTLOCK_API_KEY <span className="text-[var(--color-muted)]">= the key above (required)</span></p>
                                </div>
                            </div>
                        )}

                        {rawKey && (
                            <div>
                                <div className="flex items-center justify-between">
                                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">2 · SAVE AS .github/workflows/driftlock.yml</p>
                                    {yaml && (
                                        <button onClick={() => copy(yaml, "Workflow")} className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">
                                            COPY YAML
                                        </button>
                                    )}
                                </div>
                                <pre className="mt-2 max-h-[420px] overflow-auto border border-[var(--color-line-strong)] bg-[var(--color-ink)] p-4 font-mono text-[11px] leading-5 text-[var(--color-paper)]">
                                    {yaml ?? "LOADING TEMPLATE…"}
                                </pre>
                            </div>
                        )}

                        {rawKey && (
                            <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">
                                3 · PUSH. DETECTION RUNS ON EVERY PUSH TO {repo.defaultBranch.toUpperCase()}, FIX ARRIVES AS A PR
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
