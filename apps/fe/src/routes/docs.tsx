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
                Save templates/driftlock.yml as .github/workflows/driftlock.yml and push. Baselines commit back so the next run can compare. Prefer the <Link to="/actions" search={{ repo: undefined }} className="underline underline-offset-2 hover:text-[var(--color-ink)]">/actions</Link> wizard: pick repo, provider, and model, and it writes the file for you.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">5. Triggers</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Schedule (every 6h), push, and manual dispatch: full runs, baselines commit back, PRs open.</li>
                <li>Pull requests: detection-only (--dry-run). Untrusted events never open PRs or push baselines.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Model keys (BYOK)</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Model calls run on the key you already have. Your key stays in your repo secrets or env — we never see your model bill. PRs require a configured key; without one, runs detect and suggest only.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>OpenAI: AI_PROVIDER=openai + AI_API_KEY (AI_MODEL optional, default gpt-4o). AI_BASE_URL override supported.</li>
                <li>Gemini: AI_PROVIDER=gemini + GEMINI_API_KEY (GEMINI_MODEL optional, e.g. gemini-3.8-flash).</li>
                <li>Anthropic: AI_PROVIDER=anthropic + AI_API_KEY. Model fixes only — agent PRs need OpenAI or Gemini.</li>
                <li>Cloudflare: AI_PROVIDER=cloudflare + CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (CLOUDFLARE_AI_MODEL optional).</li>
                <li>CONFIDENCE_THRESHOLD: optional, 0 to 100, default 0. Model fixes apply at confidence 60+.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Reading the report</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Keyless runs list each drift (file, line, removed vs added fields) and end open: N found, 0 fixed, with the exact keys to set.</li>
                <li>Keyed runs open mergeable PRs when verification passes, drafts when it cannot (labeled UNVERIFIED, unmergeable until marked ready).</li>
                <li>With --json, the last stdout line is always a machine-readable summary for CI.</li>
            </ul>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/features" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Features</Link>
                <Link to="/contact" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Get help</Link>
            </div>
        </div>
    );
}
