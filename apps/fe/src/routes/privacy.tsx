import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function PrivacyPage() {
    useEffect(() => {
        document.title = "Privacy | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Privacy
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">BETA · LAST UPDATED OCT 2026</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Privacy</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                DriftLock collects the minimum needed to detect drift and open fix PRs. No sale of personal data. No training on your code.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">What We Collect</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>GitHub account identity via OAuth: login, name, avatar URL.</li>
                <li>Repository metadata you select: owner, name, default branch, visibility.</li>
                <li>Code-derived metadata only: file paths, line numbers, endpoint names, shape types, diff summaries, PR metadata.</li>
                <li>Webhook schema types per endpoint and event type. Raw payload values are not stored.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">What We Do Not Collect</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Full repository contents. Clones are ephemeral and deleted after each run.</li>
                <li>Secrets in plaintext. Tokens and AI keys are encrypted with AES-256-GCM.</li>
                <li>Data for sale, advertising, or model training.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Retention And Deletion</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Run logs 7 days. Snapshots and diffs 30 days. Full wipe within 24 hours on app uninstall or on request to nalin@nerdev.in. See{" "}
                <Link to="/security" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    Security
                </Link>{" "}
                for the full retention table and DPA availability.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Contact</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Privacy questions or deletion requests: <a href="mailto:nalin@nerdev.in" className="underline underline-offset-2 hover:text-[var(--color-ink)]">nalin@nerdev.in</a>.
            </p>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/security" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Security</Link>
                <Link to="/terms" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Terms</Link>
            </div>
        </div>
    );
}
