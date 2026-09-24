import { useState } from "react";
import { getAccounts, getAccountRepos, getSettings, rotateApiKey, updateRepoPolicy, updateSettings } from "../api/client";
import type { Permission, Repo } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Toggle } from "../components/Toggle";
import { useFetch } from "../lib/useFetch";
import { toast } from "../lib/toast";
import { titleCase } from "../lib/format";

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="mb-4 border-b border-[#0F172A] pb-3">
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[#0F172A]">{title}</h2>
            {hint && <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">{hint}</p>}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block font-mono text-[11px] tracking-[0.08em] text-[#0F172A]">{label}</label>
            {children}
        </div>
    );
}

const inputBase = "w-full border border-[#0F172A]/15 bg-white px-3 py-2 font-mono text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F172A] focus:outline-none";
const selectBase = "w-full border border-[#0F172A]/15 bg-white px-3 py-2 font-mono text-xs text-[#0F172A] focus:border-[#0F172A] focus:outline-none";

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
        <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E7EE] bg-white px-4 py-3 first:border-t hover:bg-[#FFFBF5]/50">
            <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-semibold tracking-[-0.01em] text-[#0F172A]">
                    {repo.owner}/{repo.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] tracking-wide text-[#64748B]">{repo.stats.callSites} call sites · {repo.stats.driftOpen} drift open</p>
            </div>
            <label className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-[#0F172A]">
                WATCH
                <Toggle checked={repo.watched} onChange={(watched) => patch({ watched })} label="Watch repo" />
            </label>
            <select value={repo.permission} onChange={(e) => patch({ permission: e.target.value as Permission })} className="border border-[#E6E7EE] bg-white px-3 py-1.5 font-mono text-[11px] tracking-wide text-[#0F172A] focus:border-[#0F172A] focus:outline-none">
                <option value="read">READ</option>
                <option value="read-write">READ + WRITE</option>
                <option value="suggest-only">SUGGEST ONLY</option>
            </select>
            <input
                value={repo.schedule}
                onChange={(e) => patch({ schedule: e.target.value })}
                onBlur={() => toast("Schedule saved")}
                placeholder="cron: 0 * * * *"
                className="w-28 border border-[#E6E7EE] bg-white px-3 py-1.5 font-mono text-[11px] tracking-wide text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F172A] focus:outline-none"
            />
        </div>
    );
}

function WebhookSettings({
    webhookConfig,
    onSave,
}: {
    webhookConfig: NonNullable<import("../api/types").Settings["webhookConfig"]>;
    onSave: (patch: Partial<typeof webhookConfig>) => void;
}) {
    const [form, setForm] = useState({
        githubToken: webhookConfig.githubToken ?? "",
        repoOwner: webhookConfig.repoOwner ?? "",
        repoName: webhookConfig.repoName ?? "",
        aiProvider: webhookConfig.aiProvider ?? "",
        aiApiKey: webhookConfig.aiApiKey ?? "",
        aiModel: webhookConfig.aiModel ?? "",
        cloudflareAccountId: webhookConfig.cloudflareAccountId ?? "",
        forwardUrl: webhookConfig.forwardUrl ?? "",
        confidenceThreshold: webhookConfig.confidenceThreshold?.toString() ?? "0.7",
    });

    function handleChange(field: string, value: string) {
        setForm((prev) => ({ ...prev, ...(field === "aiProvider" && value !== prev.aiProvider ? { aiApiKey: "" } : {}), [field]: value }));
    }

    function handleSave() {
        const patch: Partial<typeof webhookConfig> = {
            githubToken: form.githubToken || undefined,
            repoOwner: form.repoOwner || undefined,
            repoName: form.repoName || undefined,
            aiProvider: form.aiProvider || undefined,
            aiApiKey: form.aiApiKey,
            aiModel: form.aiModel,
            cloudflareAccountId: form.cloudflareAccountId,
            forwardUrl: form.forwardUrl || undefined,
            confidenceThreshold: parseFloat(form.confidenceThreshold) || 0.7,
        };
        onSave(patch);
    }

    return (
        <div className="border border-[#0F172A] bg-white">
            <div className="border-b border-[#0F172A] bg-[#FFFBF5] px-4 py-2">
                <p className="font-mono text-[11px] tracking-[0.08em] text-[#0F172A]">WEBHOOK CAPTURE · SHEET W01</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="GitHub Token"><input type="password" value={form.githubToken} onChange={(e) => handleChange("githubToken", e.target.value)} placeholder="ghp_••••••••" className={inputBase} /></Field>
                <Field label="Forward URL"><input value={form.forwardUrl} onChange={(e) => handleChange("forwardUrl", e.target.value)} placeholder="https://your-app.com/webhooks/stripe" className={inputBase} /></Field>
                <Field label="Repository Owner"><input value={form.repoOwner} onChange={(e) => handleChange("repoOwner", e.target.value)} placeholder="your-org" className={inputBase} /></Field>
                <Field label="Repository Name"><input value={form.repoName} onChange={(e) => handleChange("repoName", e.target.value)} placeholder="your-repo" className={inputBase} /></Field>
                <Field label="AI Provider">
                    <select value={form.aiProvider} onChange={(e) => handleChange("aiProvider", e.target.value)} className={selectBase}>
                        <option value="">NONE — DETERMINISTIC ONLY</option>
                        <option value="openai">OPENAI</option>
                        <option value="anthropic">ANTHROPIC</option>
                        <option value="gemini">GEMINI</option>
                        <option value="cloudflare">CLOUDFLARE</option>
                    </select>
                </Field>
                <Field label="AI API Key"><input type="password" value={form.aiApiKey} onChange={(e) => handleChange("aiApiKey", e.target.value)} placeholder={form.aiProvider === "cloudflare" ? "cfat_..." : form.aiProvider === "gemini" ? "Gemini API key" : "sk-..."} className={inputBase} /></Field>
                <Field label="AI Model"><input value={form.aiModel} onChange={(e) => handleChange("aiModel", e.target.value)} placeholder={form.aiProvider === "cloudflare" ? "@cf/google/gemma-4-26b-a4b-it" : form.aiProvider === "gemini" ? "gemini-2.5-flash" : "Provider default"} className={inputBase} /></Field>
                {form.aiProvider === "cloudflare" && <Field label="Cloudflare Account ID"><input value={form.cloudflareAccountId} onChange={(e) => handleChange("cloudflareAccountId", e.target.value)} placeholder="Cloudflare account ID" className={inputBase} /></Field>}
                <Field label="Confidence Threshold"><input type="number" min="0" max="1" step="0.1" value={form.confidenceThreshold} onChange={(e) => handleChange("confidenceThreshold", e.target.value)} className={inputBase} /></Field>
            </div>
            <div className="flex items-center justify-between border-t border-[#E6E7EE] bg-[#FFFBF5] px-4 py-3">
                <p className="font-mono text-[11px] tracking-wide text-[#64748B]">Server clone is managed via GitHub token, not a local path. No server filesystem is exposed.</p>
                <Button size="sm" onClick={handleSave} className="bg-[#0F172A] text-white hover:bg-[#1E293B] border border-[#0F172A]">
                    SAVE
                </Button>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const settings = useFetch(() => getSettings(), []);
    const accounts = useFetch(() => getAccounts(), []);
    const [repos, setRepos] = useState<Repo[]>([]);
    const [whitelistDraft, setWhitelistDraft] = useState("");
    const [reposLoading, setReposLoading] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    async function loadRepos() {
        if (!accounts.data) return;
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
            const raw = (key as unknown as { raw?: string }).raw ?? key.keyMasked;
            setNewKey(raw);
            setCopied(false);
            try {
                await navigator.clipboard.writeText(raw);
                setCopied(true);
                toast(`Copied ${key.keyMasked} to clipboard`);
            } catch {
                toast(`New ${key.keyMasked} — copy it now, shown once`);
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to rotate");
        }
    }
    async function saveWebhookConfig(patch: Partial<NonNullable<import("../api/types").Settings["webhookConfig"]>>) {
        try {
            await updateSettings({ webhookConfig: patch });
            settings.reload();
            toast("Webhook config saved");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to save webhook config");
        }
    }

    const entry = settings.data?.settings;
    const whitelist = entry?.forwardWhitelist ?? [];

    return (
        <div className="mx-auto max-w-[880px]">
            <PageHeader eyebrow="Settings" title="How DriftLock behaves" description="Per-repo permissions, traffic forward whitelist, and credentials the probe uses. Server never exposes a local path." />

            <section className="mt-8">
                <SectionLabel title="WEBHOOK CAPTURE" hint="How DriftLock captures and processes webhooks from Stripe, Twilio, and other vendors." />
                {entry ? (
                    <WebhookSettings webhookConfig={entry.webhookConfig ?? {}} onSave={saveWebhookConfig} />
                ) : (
                    <div className="h-[280px] animate-pulse border border-[#E6E7EE] bg-white" />
                )}
            </section>

            <section className="mt-10">
                <SectionLabel title="WATCH AND PERMISSIONS" hint="Watched repos get probed on schedule. Suggest-only repos only ever get PRs." />
                {reposLoading && repos.length === 0 ? (
                    <div className="border border-[#E6E7EE] bg-white p-8 text-center font-mono text-xs text-[#64748B]">Loading repos…</div>
                ) : repos.length === 0 ? (
                    <div className="border border-dashed border-[#E6E7EE] bg-[#FFFBF5] p-8 text-center">
                        <p className="font-mono text-xs text-[#0F172A]">No repos yet.</p>
                        <p className="mt-1 font-mono text-[11px] text-[#64748B]">Install the GitHub App to populate this sheet.</p>
                    </div>
                ) : (
                    <div className="border border-[#E6E7EE] bg-white">
                        {repos.map((repo) => (
                            <RepoPolicyRow key={`${repo.owner}/${repo.name}`} repo={repo} />
                        ))}
                    </div>
                )}
            </section>

            <section className="mt-10">
                <SectionLabel title="PROBING" hint="Sandbox intercepts non-idempotent calls unless endpoint is whitelisted. Mirror of CLI --forward flag." />
                <div className="border border-[#0F172A] bg-white">
                    <div className="flex items-center justify-between gap-4 border-b border-[#E6E7EE] bg-[#FFFBF5] px-4 py-3">
                        <div>
                            <p className="font-mono text-xs font-semibold tracking-[0.06em] text-[#0F172A]">AUTO PROBE ON SCHEDULE</p>
                            <p className="font-mono text-[11px] leading-4 text-[#64748B]">Run sandbox capture after every repo change.</p>
                        </div>
                        <Toggle checked={entry?.autoProbe ?? false} onChange={toggleAutoProbe} label="Auto probe" />
                    </div>
                    <div className="p-4">
                        <p className="font-mono text-[11px] tracking-[0.08em] text-[#0F172A]">FORWARD WHITELIST</p>
                        <div className="mt-2 flex min-h-[28px] flex-wrap gap-1.5">
                            {whitelist.length === 0 ? (
                                <span className="font-mono text-xs text-[#94A3B8]">No whitelisted endpoints.</span>
                            ) : (
                                whitelist.map((entryLine) => (
                                    <span key={entryLine} className="inline-flex items-center gap-1 border border-[#0F172A] bg-white px-2 py-1 font-mono text-xs text-[#0F172A]">
                                        {entryLine}
                                        <button type="button" aria-label={`Remove ${entryLine}`} onClick={() => void saveWhitelist(whitelist.filter((w) => w !== entryLine))} className="ml-1 text-[#94A3B8] hover:text-[#DC2626]">
                                            ×
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>
                        <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const value = whitelistDraft.trim(); if (!value || whitelist.includes(value)) return; void saveWhitelist([...whitelist, value]); setWhitelistDraft(""); }}>
                            <input value={whitelistDraft} onChange={(e) => setWhitelistDraft(e.target.value)} placeholder="POST /v3/mail/send" className="w-64 border border-[#E6E7EE] bg-white px-3 py-1.5 font-mono text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F172A] focus:outline-none" />
                            <Button size="sm" variant="secondary" type="submit" className="border border-[#0F172A] bg-white text-[#0F172A] hover:bg-[#FFFBF5]">
                                ADD
                            </Button>
                        </form>
                    </div>
                </div>
            </section>

            <section className="mt-10 grid gap-6 sm:grid-cols-2">
                <div>
                    <SectionLabel title="API KEYS" hint="Keys the webhook accepts for scheduled runs." />
                    {newKey && (
                        <div className="mb-3 border border-[#0F172A] bg-[#FFFBF5]">
                            <div className="flex items-center justify-between border-b border-[#0F172A] bg-[#0F172A] px-3 py-1.5">
                                <p className="font-mono text-[11px] tracking-[0.08em] text-white">NEW KEY — COPY NOW, SHOWN ONCE</p>
                                <button onClick={() => setNewKey(null)} className="font-mono text-[11px] tracking-wide text-white/70 hover:text-white">DISMISS ×</button>
                            </div>
                            <div className="flex items-center gap-2 p-3">
                                <input readOnly value={newKey} className="flex-1 border border-[#0F172A] bg-white px-3 py-2 font-mono text-xs text-[#0F172A] focus:outline-none" onFocus={(e) => e.target.select()} />
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(newKey);
                                        setCopied(true);
                                        toast("Copied to clipboard");
                                        setTimeout(() => setCopied(false), 1500);
                                    }}
                                    className="border border-[#0F172A] bg-[#0F172A] text-white hover:bg-[#1E293B] shrink-0"
                                >
                                    {copied ? "COPIED ✓" : "COPY"}
                                </Button>
                            </div>
                            <p className="px-3 pb-2 font-mono text-[11px] leading-4 text-[#64748B]">Save this now. Refresh hides it. It was also auto-copied to your clipboard.</p>
                        </div>
                    )}
                    <div className="border border-[#E6E7EE] bg-white">
                        {(entry?.apiKeys ?? []).length === 0 ? (
                            <p className="px-4 py-6 text-center font-mono text-xs text-[#94A3B8]">No API keys configured.</p>
                        ) : (
                            (entry?.apiKeys ?? []).map((key) => (
                                <div key={key.id} className="flex items-center justify-between border-b border-[#E6E7EE] px-4 py-3 last:border-b-0">
                                    <div>
                                        <p className="font-mono text-xs font-semibold tracking-[-0.01em] text-[#0F172A]">{titleCase(key.name)}</p>
                                        <p className="mt-0.5 font-mono text-[11px] tracking-wide text-[#64748B]">{key.keyMasked}</p>
                                    </div>
                                    <Button size="sm" variant="secondary" onClick={() => void handleRotate()} className="border border-[#E6E7EE] bg-white text-[#0F172A] hover:bg-[#FFFBF5]">
                                        ROTATE
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div>
                    <SectionLabel title="PROBE CREDENTIALS" hint="Sandbox credentials stored masked. Values never leave the host." />
                    <div className="border border-[#E6E7EE] bg-white">
                        {(entry?.probeCredentials ?? []).length === 0 ? (
                            <p className="px-4 py-6 text-center font-mono text-xs text-[#94A3B8]">No credentials stored.</p>
                        ) : (
                            (entry?.probeCredentials ?? []).map((cred) => (
                                <div key={cred.provider} className="flex items-center justify-between border-b border-[#E6E7EE] px-4 py-3 last:border-b-0">
                                    <div className="flex items-center gap-2">
                                        <Badge tone="neutral">{titleCase(cred.provider)}</Badge>
                                        <span className="font-mono text-[11px] tracking-wide text-[#64748B]">{cred.kind}</span>
                                    </div>
                                    <span className="font-mono text-[11px] tracking-wide text-[#0F172A]">{cred.masked}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
