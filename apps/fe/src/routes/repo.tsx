import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { getRepo, getRepoDrifts, updateRepoPolicy } from "../api/client";
import type {
    CallSiteSummary,
    DriftEvent,
    Permission,
    Pull,
    Repo,
} from "../api/types";
import { Badge, type BadgeTone } from "../components/Badge";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Stat } from "../components/Stat";
import { Toggle } from "../components/Toggle";
import { EmptyState } from "../components/EmptyState";
import { useFetch } from "../lib/useFetch";
import { toast } from "../lib/toast";
import { PERMISSION_LABELS, timeAgo } from "../lib/format";

type Tab = "drift" | "callsites" | "pulls";

const TABS: Array<{ id: Tab; label: string }> = [
    { id: "drift", label: "Drift" },
    { id: "callsites", label: "Call sites" },
    { id: "pulls", label: "Pull requests" },
];

const SNAPSHOT_TONE: Record<CallSiteSummary["snapshot"], BadgeTone> = {
    baseline: "green",
    drifted: "amber",
    rebaselined: "blue",
    "pending-capture": "neutral",
};

const CONFIDENCE_TONE: Record<DriftEvent["confidence"], BadgeTone> = {
    high: "green",
    medium: "amber",
    low: "red",
};

const STATUS_TONE: Record<DriftEvent["status"], BadgeTone> = {
    detected: "amber",
    fix_generated: "blue",
    pr_created: "blue",
    merged: "green",
    rebaselined: "neutral",
};

const TAG_LABEL: Record<DriftEvent["tag"], string> = {
    traffic: "Live traffic",
    docs: "Docs",
    intercepted: "Intercepted",
};

function asError(err: unknown): string {
    return err instanceof Error ? err.message : "Request failed";
}

function DriftCard({
    event,
    owner,
    name,
}: {
    event: DriftEvent;
    owner: string;
    name: string;
}) {
    return (
        <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                    {event.packageName} · {event.method}
                </p>
                <Badge tone="neutral">{event.callSiteId}</Badge>
                <div className="ml-auto flex items-center gap-2">
                    <Badge tone="neutral">{TAG_LABEL[event.tag]}</Badge>
                    <Badge tone={CONFIDENCE_TONE[event.confidence]}>
                        {event.confidence}
                    </Badge>
                    <Badge tone={STATUS_TONE[event.status]}>
                        {event.status.replace("_", " ")}
                    </Badge>
                </div>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{event.summary}</p>
            {event.changes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {event.changes.map((change) => (
                        <Badge
                            key={`${event.id}-${change.field}`}
                            tone={
                                change.kind === "added"
                                    ? "green"
                                    : change.kind === "removed"
                                      ? "red"
                                      : "blue"
                            }
                        >
                            {change.kind} · {change.field}
                        </Badge>
                    ))}
                </div>
            )}
            <div className="mt-3 text-xs text-neutral-500">
                {timeAgo(event.detectedAt)} ·{" "}
                {event.confirmed ? "confirmed" : "unconfirmed"} ·{" "}
                {event.prNumber ? (
                    <a
                        href={`https://github.com/${owner}/${name}/pull/${event.prNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-accent hover:underline"
                    >
                        PR #{event.prNumber}
                    </a>
                ) : (
                    "no PR yet"
                )}
            </div>
        </Card>
    );
}

function CallSiteRow({ site }: { site: CallSiteSummary }) {
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                        {site.method}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                        {site.filePath}:{site.line}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                        <span className="text-neutral-400">
                            {site.packageName}
                        </span>
                        {site.endpoint ? (
                            <>
                                {" · "}
                                <span className="font-mono">
                                    {site.httpMethod} {site.endpoint}
                                </span>
                            </>
                        ) : (
                            <span className="text-neutral-400">
                                {" · endpoint pending capture"}
                            </span>
                        )}
                    </p>
                </div>
                <Badge tone={SNAPSHOT_TONE[site.snapshot]}>
                    {site.snapshot.replace("-", " ")}
                </Badge>
            </div>
            {site.requestShape && site.requestShape.length > 0 && (
                <p className="mt-3 text-xs text-neutral-500">
                    request {site.requestShape.map((f) => f.field).join(", ")}
                </p>
            )}
            {site.responseFields.length > 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                    reads from response: {site.responseFields.join(", ")}
                </p>
            )}
        </Card>
    );
}

function PullRow({ pull }: { pull: Pull }) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <a
                        href={pull.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-medium text-accent hover:underline"
                    >
                        #{pull.number} {pull.title}
                    </a>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">
                        {pull.branch} · updated {timeAgo(pull.updatedAt)}
                    </p>
                </div>
                <Badge tone={pull.status === "open" ? "amber" : "green"}>
                    {pull.status}
                </Badge>
            </div>
        </Card>
    );
}

export default function RepoPage({
    owner,
    name,
}: {
    owner: string;
    name: string;
}) {
    const [tab, setTab] = useState<Tab>("drift");
    const detail = useFetch(() => getRepo(owner, name), [owner, name]);
    const drifts = useFetch(() => getRepoDrifts(owner, name), [owner, name]);
    const repo = detail.data?.repo ?? null;

    async function setPolicy(patch: {
        watched?: boolean;
        permission?: Permission;
    }) {
        try {
            await updateRepoPolicy(owner, name, patch);
            detail.reload();
            toast(
                patch.watched !== undefined
                    ? patch.watched
                        ? "Repo watching enabled"
                        : "Repo watching paused"
                    : `Permission set to ${PERMISSION_LABELS[patch.permission as string]}`,
            );
        } catch (err) {
            toast(asError(err));
        }
    }

    return (
        <div>
            <Link
                to="/accounts/$owner"
                params={{ owner }}
                className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors duration-150 hover:text-neutral-900"
            >
                ← {owner}
            </Link>
            <PageHeader
                eyebrow="Repo"
                title={`${owner}/${name}`}
                description={repo?.description}
                actions={
                    repo && (
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-neutral-600">
                                Watch
                                <Toggle
                                    checked={repo.watched}
                                    onChange={(watched) =>
                                        setPolicy({ watched })
                                    }
                                    label="Watch repo"
                                />
                            </label>
                            <select
                                value={repo.permission}
                                onChange={(e) =>
                                    setPolicy({
                                        permission: e.target
                                            .value as Permission,
                                    })
                                }
                                className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none"
                            >
                                <option value="read">Read</option>
                                <option value="read-write">Read + write</option>
                                <option value="suggest-only">Suggest only</option>
                            </select>
                        </div>
                    )
                }
            />

            {repo && (
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Call sites" value={repo.stats.callSites} />
                    <Stat
                        label="Drift open"
                        value={repo.stats.driftOpen}
                        className={
                            repo.stats.driftOpen > 0
                                ? "text-amber-600"
                                : ""
                        }
                    />
                    <Stat label="Open PRs" value={repo.stats.pullsOpen} />
                    <Stat
                        label="Pending capture"
                        value={repo.stats.pendingCapture}
                        hint={`last probe ${timeAgo(repo.stats.lastProbeAt)}`}
                    />
                </div>
            )}

            <div className="mb-4 flex items-center gap-1 border-b border-neutral-200">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors duration-150 ${
                            tab === id
                                ? "border-neutral-900 font-medium text-neutral-900"
                                : "border-transparent text-neutral-500 hover:text-neutral-900"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === "drift" &&
                (drifts.loading ? (
                    <p className="text-sm text-neutral-500">Loading drift...</p>
                ) : drifts.error ? (
                    <p className="text-sm text-red-600">{drifts.error}</p>
                ) : (drifts.data?.drifts ?? []).length === 0 ? (
                    <EmptyState
                        title="No drift in the last baseline"
                        hint="Baseline traffic matches the recorded snapshots."
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {drifts.data?.drifts.map((event) => (
                            <DriftCard
                                key={event.id}
                                event={event}
                                owner={owner}
                                name={name}
                            />
                        ))}
                    </div>
                ))}

            {tab === "callsites" &&
                (detail.loading ? (
                    <p className="text-sm text-neutral-500">
                        Loading call sites...
                    </p>
                ) : detail.error ? (
                    <p className="text-sm text-red-600">{detail.error}</p>
                ) : (detail.data?.callsites ?? []).length === 0 ? (
                    <EmptyState
                        title="No API call sites found"
                        hint="Imports that resolve to external packages show up here."
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {detail.data?.callsites.map((site) => (
                            <CallSiteRow key={site.id} site={site} />
                        ))}
                    </div>
                ))}

            {tab === "pulls" &&
                (detail.loading ? (
                    <p className="text-sm text-neutral-500">
                        Loading pull requests...
                    </p>
                ) : detail.error ? (
                    <p className="text-sm text-red-600">{detail.error}</p>
                ) : (detail.data?.pulls ?? []).length === 0 ? (
                    <EmptyState
                        title="No pull requests"
                        hint="DriftLock PRs from the fix pipeline appear here."
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {detail.data?.pulls.map((pull) => (
                            <PullRow key={pull.number} pull={pull} />
                        ))}
                    </div>
                ))}
        </div>
    );
}