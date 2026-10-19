import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function DocsPage() {
    useEffect(() => {
        document.title = "Docs | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Docs
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">GET STARTED IN 5 MINUTES</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Docs</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                Install once, scan locally, preview drift, then push the workflow so CI opens fix PRs.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">1. Install</h2>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]">
                bunx @driftlock/cli --help
            </div>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                No install needed on CI. For the GitHub App flow use <Link to="/install" className="underline underline-offset-2 hover:text-[var(--color-ink)]">/install</Link>.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">2. Run analyze</h2>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]">
                driftlock analyze ./src
            </div>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Lists every vendor call site with endpoint and method. Add -o json for CI output.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">3. Run fix dry-run</h2>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]">
                driftlock fix ./repo --dry-run
            </div>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                First run records the baseline to .driftlock/snapshots/. Later runs diff against it. Dry-run shows drift and creates nothing.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">4. Push the workflow</h2>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]">
                driftlock fix ./repo --repo owner/repo --command &quot;bun test&quot; --commit-baselines --json
            </div>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Save templates/driftlock.yml as .github/workflows/driftlock.yml and push. Baselines commit back so the next run can compare. Prefer the <Link to="/actions" search={{ repo: undefined }} className="underline underline-offset-2 hover:text-[var(--color-ink)]">/actions</Link> wizard: pick a repo and it writes the file for you. No provider or model to pick, models are managed and included in your credits.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">5. Triggers</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Schedule (every 6h), push, and manual dispatch: full runs, baselines commit back, PRs open.</li>
                <li>Pull requests: detection-only (--dry-run). Untrusted events never open PRs or push baselines.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Credits included, no keys</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Models are managed and included. No API keys to set up, nothing stays in your repo secrets. Every install gets 300 credits free (3 AI PRs, no card, 14-day expiry).
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Scan: 10 credits. Drift detect: 20 credits. AI fix PR: 100 credits.</li>
                <li>Starter $29/mo: 1,500 credits. Team $99/mo: 7,000 credits. Scale $299/mo: 25,000 credits.</li>
                <li>Overage: $15 per 1,000 credits. Credits reset monthly, no rollover.</li>
                <li>CONFIDENCE_THRESHOLD: optional extra filter, 0 to 100, default 0 — drift scoring below it is skipped, with no alert and no fix. Model fixes separately require a hard minimum confidence of 60 (AI_FIX_CONFIDENCE_THRESHOLD), whatever this is set to.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Reading the report</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Runs 1 to 3 open fix PRs while trial credits last (file, line, removed vs added fields).</li>
                <li>Out of credits: runs stop with out_of_credits and a link to upgrade at /pricing. No silent skips.</li>
                <li>Paid runs open mergeable PRs when verification passes, drafts when it cannot (labeled UNVERIFIED, unmergeable until marked ready).</li>
                <li>With --json, the last stdout line is always a machine-readable summary for CI: callSites, drifts, fixes, prs, baselines, pendingCapture, baselinesCommitted.</li>
            </ul>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/features" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Features</Link>
                <Link to="/contact" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Get help</Link>
            </div>
        </div>
    );
}
