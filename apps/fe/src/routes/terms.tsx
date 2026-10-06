import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function TermsPage() {
    useEffect(() => {
        document.title = "Terms | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Terms
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">BETA · LAST UPDATED OCT 2026</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Terms</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                DriftLock is free in beta. Every change is a PR. Nothing is merged without you.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Service</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>DriftLock scans selected repos, detects vendor drift, and opens fix PRs via the GitHub API.</li>
                <li>AI fixes are optional and off by default. Deterministic fixes apply renames, null checks, and type coercions.</li>
                <li>Preview with driftlock fix --dry-run before any write.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Customer Duties</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>You review every PR before merge. You own the merge decision.</li>
                <li>You grant only the repos you want watched and can revoke via GitHub App settings at any time.</li>
                <li>You do not use DriftLock to violate vendor terms or applicable law.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Beta Terms</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Beta is provided as is, without warranty. Pricing will be announced after beta. Either party can terminate by uninstalling the GitHub App, which triggers a full data wipe within 24 hours.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Contact</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Questions: <a href="mailto:nalin@nerdev.in" className="underline underline-offset-2 hover:text-[var(--color-ink)]">nalin@nerdev.in</a>. Security issues follow{" "}
                <Link to="/security" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    Security
                </Link>
                : email only, never a public issue.
            </p>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/security" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Security</Link>
                <Link to="/privacy" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Privacy</Link>
            </div>
        </div>
    );
}
