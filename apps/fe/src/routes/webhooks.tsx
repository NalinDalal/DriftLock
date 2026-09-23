import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
    getWebhookEndpoints,
    getWebhookDrifts,
    getWebhookSchemas,
} from "../api/client";
import type {
    WebhookEndpoint,
    WebhookDrift,
    WebhookSchema,
} from "../api/types";
import { Badge, type BadgeTone } from "../components/Badge";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Stat } from "../components/Stat";
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
        <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                    {drift.eventType}
                </p>
                <Badge tone="neutral">{drift.endpointId.slice(0, 8)}</Badge>
                <div className="ml-auto flex items-center gap-2">
                    <Badge tone={STATUS_TONE[drift.status] ?? "neutral"}>
                        {drift.status}
                    </Badge>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {drift.diff.added.length > 0 && (
                    <Badge tone="green">
                        added: {drift.diff.added.join(", ")}
                    </Badge>
                )}
                {drift.diff.removed.length > 0 && (
                    <Badge tone="red">
                        removed: {drift.diff.removed.join(", ")}
                    </Badge>
                )}
                {drift.diff.typeChanged.length > 0 && (
                    <Badge tone="blue">
                        type changed:{" "}
                        {drift.diff.typeChanged
                            .map((c) => `${c.field}: ${c.from}→${c.to}`)
                            .join(", ")}
                    </Badge>
                )}
            </div>
            <div className="mt-3 text-xs text-neutral-500">
                {timeAgo(drift.detectedAt)}
            </div>
        </Card>
    );
}

function EndpointRow({ endpoint }: { endpoint: WebhookEndpoint }) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                        {endpoint.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                        {endpoint.url}
                    </p>
                </div>
                <Badge tone={endpoint.active ? "green" : "neutral"}>
                    {endpoint.active ? "active" : "inactive"}
                </Badge>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
                created {timeAgo(endpoint.createdAt)}
            </div>
        </Card>
    );
}

function SchemaRow({ schema }: { schema: WebhookSchema }) {
    const fieldCount = Object.keys(schema.flattenedSchema).length;
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                        {schema.eventType}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                        {fieldCount} fields
                    </p>
                </div>
                <p className="text-xs text-neutral-500">
                    {timeAgo(schema.capturedAt)}
                </p>
            </div>
        </Card>
    );
}

export default function WebhookDashboard() {
    const [tab, setTab] = useState<Tab>("drifts");
    const endpoints = useFetch(() => getWebhookEndpoints(), []);
    const drifts = useFetch(() => getWebhookDrifts(), []);
    const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(
        null,
    );
    const schemas = useFetch(
        () =>
            selectedEndpoint
                ? getWebhookSchemas(selectedEndpoint)
                : Promise.resolve({ schemas: [] }),
        [selectedEndpoint],
    );

    return (
        <div>
            <Link
                to="/"
                className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors duration-150 hover:text-neutral-900"
            >
                ← Dashboard
            </Link>
            <PageHeader
                eyebrow="Webhooks"
                title="Webhook Dashboard"
                description="Monitor inbound webhook drifts, endpoints, and schema history"
            />

            {endpoints.data && (
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Stat
                        label="Endpoints"
                        value={endpoints.data.endpoints.length}
                    />
                    <Stat
                        label="Drifts detected"
                        value={drifts.data?.drifts.length ?? 0}
                        className={
                            (drifts.data?.drifts.length ?? 0) > 0
                                ? "text-amber-600"
                                : ""
                        }
                    />
                    <Stat
                        label="Schemas tracked"
                        value={
                            schemas.data?.schemas.length ?? 0
                        }
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

            {tab === "drifts" &&
                (drifts.loading ? (
                    <p className="text-sm text-neutral-500">Loading drifts...</p>
                ) : drifts.error ? (
                    <p className="text-sm text-red-600">{drifts.error}</p>
                ) : (drifts.data?.drifts ?? []).length === 0 ? (
                    <EmptyState
                        title="No webhook drifts detected"
                        hint="Webhook payload changes will appear here."
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {drifts.data?.drifts.map((drift) => (
                            <DriftCard key={drift.id} drift={drift} />
                        ))}
                    </div>
                ))}

            {tab === "endpoints" &&
                (endpoints.loading ? (
                    <p className="text-sm text-neutral-500">
                        Loading endpoints...
                    </p>
                ) : endpoints.error ? (
                    <p className="text-sm text-red-600">{endpoints.error}</p>
                ) : (endpoints.data?.endpoints ?? []).length === 0 ? (
                    <EmptyState
                        title="No webhook endpoints"
                        hint="Register endpoints to start capturing webhook schemas."
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {endpoints.data?.endpoints.map((endpoint) => (
                            <EndpointRow
                                key={endpoint.id}
                                endpoint={endpoint}
                            />
                        ))}
                    </div>
                ))}

            {tab === "schemas" && (
                <>
                    <div className="mb-4">
                        <select
                            value={selectedEndpoint ?? ""}
                            onChange={(e) =>
                                setSelectedEndpoint(e.target.value || null)
                            }
                            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none"
                        >
                            <option value="">All endpoints</option>
                            {endpoints.data?.endpoints.map((ep) => (
                                <option key={ep.id} value={ep.id}>
                                    {ep.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {schemas.loading ? (
                        <p className="text-sm text-neutral-500">
                            Loading schemas...
                        </p>
                    ) : schemas.error ? (
                        <p className="text-sm text-red-600">{schemas.error}</p>
                    ) : (schemas.data?.schemas ?? []).length === 0 ? (
                        <EmptyState
                            title="No schema snapshots"
                            hint="Webhook schemas will be recorded as payloads arrive."
                        />
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
