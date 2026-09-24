import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { getWebhookEndpoints, getWebhookDrifts, getWebhookSchemas } from "../api/client";
import type { WebhookDrift, WebhookEndpoint, WebhookSchema } from "../api/types";
import { Badge, type BadgeTone } from "../components/Badge";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { useFetch } from "../lib/useFetch";
import { timeAgo } from "../lib/format";

type Tab = "drifts" | "endpoints" | "schemas";
const TABS: Array<{ id: Tab; label: string }> = [
    { id: "drifts", label: "Drifts" },
    { id: "endpoints", label: "Endpoints" },
    { id: "schemas", label: "Schema History" },
];
const STATUS_TONE: Record<string, BadgeTone> = {
    detected: "amber",
    pr_created: "blue",
    merged: "green",
    forwarded: "neutral",
};

function DriftCard({ drift }: { drift: WebhookDrift }) {
    return (
        <Card className="overflow-hidden p-0">
            <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[13px] font-semibold text-[#0a0a0f]">{drift.eventType}</p>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">{drift.endpointId.slice(0, 8)}</span>
                    <Badge tone={STATUS_TONE[drift.status] ?? "neutral"}>{drift.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {drift.diff.added.length > 0 && <Badge tone="green">added: {drift.diff.added.join(", ")}</Badge>}
                    {drift.diff.removed.length > 0 && <Badge tone="red">removed: {drift.diff.removed.join(", ")}</Badge>}
                    {drift.diff.typeChanged.length > 0 && (
                        <Badge tone="blue">
                            type changed: {drift.diff.typeChanged.map((c) => `${c.field}: ${c.from}→${c.to}`).join(", ")}
                        </Badge>
                    )}
                    {drift.diff.added.length === 0 && drift.diff.removed.length === 0 && drift.diff.typeChanged.length === 0 && (
                        <span className="text-xs text-zinc-400">No field-level changes recorded.</span>
                    )}
                </div>
                <p className="mt-3 text-xs text-zinc-400">{timeAgo(drift.detectedAt)}</p>
            </div>
            <div className="h-1 w-full bg-amber-400" />
        </Card>
    );
}

function EndpointRow({ endpoint }: { endpoint: WebhookEndpoint }) {
    return (
        <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[#0a0a0f]">{endpoint.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{endpoint.url}</p>
                <p className="mt-1 text-xs text-zinc-400">created {timeAgo(endpoint.createdAt)}</p>
            </div>
            <Badge tone={endpoint.active ? "green" : "neutral"}>{endpoint.active ? "active" : "inactive"}</Badge>
        </Card>
    );
}

function SchemaRow({ schema }: { schema: WebhookSchema }) {
    const fieldCount = Object.keys(schema.flattenedSchema).length;
    return (
        <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-medium text-[#0a0a0f]">{schema.eventType}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{fieldCount} fields · flattened dot-notation</p>
            </div>
            <p className="shrink-0 text-xs tabular-nums text-zinc-400">{timeAgo(schema.capturedAt)}</p>
        </Card>
    );
}

export default function WebhookDashboard() {
    const [tab, setTab] = useState<Tab>("drifts");
    const endpoints = useFetch(() => getWebhookEndpoints(), []);
    const drifts = useFetch(() => getWebhookDrifts(), []);
    const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
    const schemas = useFetch(
        () => (selectedEndpoint ? getWebhookSchemas(selectedEndpoint) : Promise.resolve({ schemas: [] })),
        [selectedEndpoint],
    );

    return (
        <div>
            <Link to="/" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900">
                ← Dashboard
            </Link>
            <PageHeader
                eyebrow="Webhooks"
                title="Inbound drift"
                description="Capture, flatten, and diff inbound webhook payloads. Drift here is a schema change between deliveries."
            />

            {endpoints.data && (
                <div className="mb-6 grid grid-cols-3 gap-3">
                    <Card className="px-4 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Endpoints</p>
                        <p className="mt-1 text-[20px] font-semibold tracking-tight text-[#0a0a0f]">{endpoints.data.endpoints.length}</p>
                    </Card>
                    <Card className={`px-4 py-3 ${(drifts.data?.drifts.length ?? 0) > 0 ? "border-amber-200 bg-amber-50/50" : ""}`}>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Drifts</p>
                        <p className={`mt-1 text-[20px] font-semibold tracking-tight ${(drifts.data?.drifts.length ?? 0) > 0 ? "text-amber-600" : "text-[#0a0a0f]"}`}>
                            {drifts.data?.drifts.length ?? 0}
                        </p>
                    </Card>
                    <Card className="px-4 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Schemas</p>
                        <p className="mt-1 text-[20px] font-semibold tracking-tight text-[#0a0a0f]">{schemas.data?.schemas.length ?? 0}</p>
                    </Card>
                </div>
            )}

            <div className="mb-5 flex gap-1 rounded-full bg-zinc-100 p-1">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`flex-1 sm:flex-none rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                            tab === id ? "bg-white text-[#0a0a0f] shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === "drifts" &&
                (drifts.loading ? (
                    <p className="text-sm text-zinc-500">Loading drifts...</p>
                ) : drifts.error ? (
                    <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{drifts.error}</div>
                ) : (drifts.data?.drifts ?? []).length === 0 ? (
                    <EmptyState title="No webhook drifts detected" hint="Payload shape changes will appear here as soon as a vendor changes a field." />
                ) : (
                    <div className="flex flex-col gap-3">
                        {drifts.data?.drifts.map((drift) => (
                            <DriftCard key={drift.id} drift={drift} />
                        ))}
                    </div>
                ))}

            {tab === "endpoints" &&
                (endpoints.loading ? (
                    <p className="text-sm text-zinc-500">Loading endpoints...</p>
                ) : endpoints.error ? (
                    <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{endpoints.error}</div>
                ) : (endpoints.data?.endpoints ?? []).length === 0 ? (
                    <EmptyState title="No webhook endpoints" hint="Register endpoints to start capturing schemas." />
                ) : (
                    <div className="flex flex-col gap-3">
                        {endpoints.data?.endpoints.map((ep) => (
                            <EndpointRow key={ep.id} endpoint={ep} />
                        ))}
                    </div>
                ))}

            {tab === "schemas" && (
                <>
                    <div className="mb-4">
                        <select
                            value={selectedEndpoint ?? ""}
                            onChange={(e) => setSelectedEndpoint(e.target.value || null)}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 focus:border-zinc-300 focus:outline-none"
                        >
                            <option value="">Select an endpoint to view schemas</option>
                            {endpoints.data?.endpoints.map((ep) => (
                                <option key={ep.id} value={ep.id}>
                                    {ep.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {schemas.loading ? (
                        <p className="text-sm text-zinc-500">Loading schemas...</p>
                    ) : schemas.error ? (
                        <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{schemas.error}</div>
                    ) : !selectedEndpoint ? (
                        <EmptyState title="Pick an endpoint" hint="Schema snapshots are stored per endpoint and event type." />
                    ) : (schemas.data?.schemas ?? []).length === 0 ? (
                        <EmptyState title="No schema snapshots" hint="Schemas will be recorded as payloads arrive." />
                    ) : (
                        <div className="flex flex-col gap-3">
                            {schemas.data?.schemas.map((schema) => (
                                <SchemaRow key={schema.id} schema={schema} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
