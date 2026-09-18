import { useState } from "react";
import { getAccounts, getAccountRepos, getSettings, rotateApiKey, updateRepoPolicy, updateSettings } from "../api/client";
import type { Permission, Repo } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Toggle } from "../components/Toggle";
import { useFetch } from "../lib/useFetch";
import { toast } from "../lib/toast";
import { PERMISSION_LABELS, titleCase } from "../lib/format";

function SectionTitle({
    title,
    hint,
}: {
    title: string;
    hint?: string;
}) {
    return (
        <div className="mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
            {hint && (
                <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
            )}
        </div>
    );
}

function RepoPolicyRow({ repo }: { repo: Repo }) {
    async function patch(p: Partial<{ watched: boolean; permission: Permission; schedule: string }>) {
        try {
            await updateRepoPolicy(repo.owner, repo.name, p);
            toast("Saved");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to save");
        }
    }

    return (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">
                    {repo.owner}/{repo.name}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                    {repo.stats.callSites} call sites
                </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
                Watch
                <Toggle
                    checked={repo.watched}
                    onChange={(watched) => patch({ watched })}
                    label="Watch repo"
                />
            </label>
            <select
                value={repo.permission}
                onChange={(e) =>
                    patch({ permission: e.target.value as Permission })
                }
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none"
            >
                <option value="read">Read</option>
                <option value="read-write">Read + write</option>
                <option value="suggest-only">Suggest only</option>
            </select>
            <input
                value={repo.schedule}
                onChange={(e) => patch({ schedule: e.target.value })}
                onBlur={() => toast("Schedule saved")}
                placeholder="cron"
                className="w-28 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none"
            />
        </Card>
    );
}

export default function SettingsPage() {
    const settings = useFetch(() => getSettings(), []);
    const accounts = useFetch(() => getAccounts(), []);
    const [repos, setRepos] = useState<Repo[]>([]);
    const [whitelistDraft, setWhitelistDraft] = useState("");
    const [reposLoading, setReposLoading] = useState(false);

    async function loadRepos() {
        if (!accounts.data) {
            return;
        }
        setReposLoading(true);
        try {
            const all: Repo[] = [];
            for (const account of accounts.data.accounts) {
                const { repos: owned } = await getAccountRepos(account.owner);
                all.push(...owned);
            }
            setRepos(all);
        } finally {
            setReposLoading(false);
        }
    }

    if (accounts.data && !reposLoading && repos.length === 0) {
        void loadRepos();
    }

    async function saveWhitelist(changed: string[]) {
        try {
            await updateSettings({ forwardWhitelist: changed });
            settings.reload();
            toast("Forward whitelist saved");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to save");
        }
    }

    async function toggleAutoProbe(next: boolean) {
        try {
            await updateSettings({ autoProbe: next });
            settings.reload();
            toast(next ? "Auto probe enabled" : "Auto probe paused");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to save");
        }
    }

    async function handleRotate() {
        try {
            const current = settings.data?.settings.apiKeys[0];
            const name = current?.name ?? "webhook";
            const { key } = await rotateApiKey(name);
            settings.reload();
            toast(`New ${key.keyMasked} (shown once)`);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to rotate");
        }
    }

    const entry = settings.data?.settings;
    const whitelist = entry?.forwardWhitelist ?? [];

    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                eyebrow="Settings"
                title="How DriftLock behaves"
                description="Per-repo permissions, the traffic forward whitelist, and the credentials the probe uses."
            />

            <section>
                <SectionTitle
                    title="Watch and permissions"
                    hint="Watched repos get probed on their schedule. Suggest-only repos only ever get PRs."
                />
                {reposLoading && repos.length === 0 ? (
                    <p className="text-sm text-neutral-500">Loading repos...</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {repos.map((repo) => (
                            <RepoPolicyRow
                                key={`${repo.owner}/${repo.name}`}
                                repo={repo}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <SectionTitle
                    title="Probing"
                    hint="The sandbox intercepts non-idempotent calls unless the endpoint is on this list. Mirror of the CLI --forward flag."
                />
                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-neutral-900">
                                Auto probe on schedule
                            </p>
                            <p className="text-xs text-neutral-500">
                                Run the sandbox capture after every repo
                                change.
                            </p>
                        </div>
                        <Toggle
                            checked={entry?.autoProbe ?? false}
                            onChange={toggleAutoProbe}
                            label="Auto probe"
                        />
                    </div>

                    <div className="mt-5">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                            Forward whitelist
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {whitelist.map((entryLine) => (
                                <span
                                    key={entryLine}
                                    className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-700"
                                >
                                    {entryLine}
                                    <button
                                        type="button"
                                        aria-label={`Remove ${entryLine}`}
                                        onClick={() =>
                                            void saveWhitelist(
                                                whitelist.filter(
                                                    (w) => w !== entryLine,
                                                ),
                                            )
                                        }
                                        className="ml-1 text-neutral-400 transition-colors duration-150 hover:text-red-600"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <form
                            className="mt-2 flex items-center gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                const value = whitelistDraft.trim();
                                if (!value || whitelist.includes(value)) {
                                    return;
                                }
                                void saveWhitelist([...whitelist, value]);
                                setWhitelistDraft("");
                            }}
                        >
                            <input
                                value={whitelistDraft}
                                onChange={(e) => setWhitelistDraft(e.target.value)}
                                placeholder="POST /v3/mail/send"
                                className="w-64 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none"
                            />
                            <Button size="sm" variant="secondary" type="submit">
                                Add
                            </Button>
                        </form>
                    </div>
                </Card>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
                <div>
                    <SectionTitle
                        title="API keys"
                        hint="Keys the webhook accepts for scheduled runs."
                    />
                    <Card className="divide-y divide-neutral-100">
                        {(entry?.apiKeys ?? []).map((key) => (
                            <div
                                key={key.id}
                                className="flex items-center justify-between px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-medium text-neutral-900">
                                        {titleCase(key.name)}
                                    </p>
                                    <p className="mt-0.5 font-mono text-xs text-neutral-500">
                                        {key.keyMasked}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void handleRotate()}
                                >
                                    Rotate
                                </Button>
                            </div>
                        ))}
                    </Card>
                </div>

                <div>
                    <SectionTitle
                        title="Probe credentials"
                        hint="Sandbox credentials are stored masked. Values never leave the host."
                    />
                    <Card className="divide-y divide-neutral-100">
                        {(entry?.probeCredentials ?? []).map((cred) => (
                            <div
                                key={cred.provider}
                                className="flex items-center justify-between px-4 py-3"
                            >
                                <div className="flex items-center gap-2">
                                    <Badge tone="neutral">
                                        {titleCase(cred.provider)}
                                    </Badge>
                                    <span className="text-xs text-neutral-500">
                                        {cred.kind}
                                    </span>
                                </div>
                                <span className="font-mono text-xs text-neutral-500">
                                    {cred.masked}
                                </span>
                            </div>
                        ))}
                    </Card>
                </div>
            </section>
        </div>
    );
}