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
                Save templates/driftlock.yml as .github/workflows/driftlock.yml and push. Baselines commit back so the next run can compare. Each fix becomes a PR.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Env keys</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>GITHUB_TOKEN: required for PR creation</li>
                <li>AI_PROVIDER + AI_API_KEY: optional, openai / anthropic / gemini / cloudflare</li>
                <li>CONFIDENCE_THRESHOLD: optional, 0 to 100, default 0</li>
            </ul>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Without AI keys fixes are deterministic: renames, null checks, type coercions.
            </p>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/features" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Features</Link>
                <Link to="/contact" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Get help</Link>
            </div>
        </div>
    );
}
