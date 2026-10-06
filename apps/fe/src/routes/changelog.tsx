import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

interface Entry {
    date: string;
    title: string;
    notes: string[];
}

const ENTRIES: Entry[] = [
    {
        date: "2026-10-06",
        title: "Scheduled vendor watch loop and honest PRs",
        notes: [
            "New always-on loop in the backend service: polls vendor specs on an interval and migrates every watched repo when members are removed. Opt-in with WATCH_ENABLED=true.",
            "Fix PRs now refuse snapshot-only diffs with code-change titles and carry a verified file list in the body.",
            "Webhook fix PRs title comment-outs as Flag, never Fix.",
            "CI workflow template runs on a schedule and commits baselines back so the next run compares.",
        ],
    },
    {
        date: "2026-10-06",
        title: "First real migration PR on stripe-test",
        notes: [
            "Stripe source to payment_method drift detected at confidence 85 and opened as PR #14 with the rename applied across all three affected files.",
            "Proved the loop end to end: detect, identify usages, open PR with the fix, no humans driving.",
        ],
    },
    {
        date: "2026-10-06",
        title: "API drift statistics and research page",
        notes: [
            "New /statistics page: industry figures with sources plus DriftLock measured findings, updated quarterly.",
        ],
    },
    {
        date: "2026-10-06",
        title: "Response field renames detected",
        notes: [
            "Shape diff now recognizes same-parent, same-type remove/add pairs as renames on the response path and maps them to rename fixes.",
        ],
    },
    {
        date: "2026-10-04",
        title: "Model provider selection per run",
        notes: [
            "CLI runs can select the model provider, defaulting to OpenAI wire protocol (Ollama-compatible via base URL override).",
        ],
    },
    {
        date: "2026-10-03",
        title: "Gemini provider support",
        notes: ["Per-provider default models for the migration agent."],
    },
    {
        date: "2026-10-02",
        title: "Provider registry and adversarial harness",
        notes: [
            "New models plug in without loop edits; runners enforce an allowlist.",
        ],
    },
];

export default function ChangelogPage() {
    useEffect(() => {
        document.title = "Changelog | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Changelog
            </nav>

            <h1 className="display text-[var(--color-ink)]">Changelog</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                What shipped, in order. Only real changes appear here.
            </p>

            <div className="mt-8 space-y-8">
                {ENTRIES.map((entry) => (
                    <section key={`${entry.date}-${entry.title}`} className="border-t border-[var(--color-line-strong)] pt-4">
                        <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-muted)]">{entry.date}</p>
                        <h2 className="mt-1 heading-card text-[var(--color-ink)]">{entry.title}</h2>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-[var(--color-ink)]/80">
                            {entry.notes.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
