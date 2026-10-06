import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function FeaturesPage() {
    useEffect(() => {
        document.title = "Features | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Features
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">DEPENDABOT BUT FOR APIS · STRIPE FIRST</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Features</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                DriftLock finds every vendor call site, detects shape drift against a baseline, and opens a GitHub PR with the fix. Nothing is merged without you.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">What it scans</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Static analysis over TypeScript and JavaScript finds every vendor SDK call and resolves it to an endpoint and HTTP method. Run it with one command:
            </p>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]">
                $ driftlock analyze ./src
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Stripe SDK calls such as stripe.charges.create and stripe.refunds.create</li>
                <li>Endpoint and method inference, for example POST /v1/charges</li>
                <li>Webhook handler field reads such as event.data.object.source</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">What drift it finds</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Tests run in a sandbox through a capture proxy. Captured request and response shapes are diffed against the committed baseline in .driftlock/snapshots/:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Added fields, for example payment_method added</li>
                <li>Removed fields, for example source removed</li>
                <li>Type changes, for example amount number to string</li>
            </ul>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Each drift gets a confidence score from 0 to 100. Preview without writes using driftlock fix --dry-run.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">What the fix PR looks like</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Each drift becomes a branch and PR via the Git Database API with the fix applied to the affected files. Deterministic fixes cover renames, null checks, and type coercions. AI assist is optional and only used when confidence is 60 or higher.
            </p>
            <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                BEFORE: source: &quot;tok_visa&quot;
                <br />
                AFTER: payment_method: &quot;pm_123&quot; · 1 file changed · confidence 84%
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/install" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Install</Link>
                <Link to="/docs" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Docs</Link>
            </div>
        </div>
    );
}
