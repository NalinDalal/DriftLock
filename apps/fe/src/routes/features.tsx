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

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">How it works</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
                {[
                    { n: "01", t: "SCAN", d: "AST finds every vendor call." },
                    { n: "02", t: "CAPTURE", d: "Sandbox proxy records shapes." },
                    { n: "03", t: "DIFF", d: "Added, removed, type changed." },
                    { n: "04", t: "FIX PR", d: "Deterministic rename, null check." },
                ].map((s) => (
                    <div key={s.n} className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                        <span className="flex h-[36px] w-[36px] items-center justify-center border border-[var(--color-line-strong)] bg-[var(--color-ink)] font-mono text-xs tracking-wide text-[var(--color-paper)]">{s.n}</span>
                        <p className="mt-3 font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">{s.t}</p>
                        <p className="mt-1 font-mono text-xs leading-4 text-[var(--color-muted)]">{s.d}</p>
                    </div>
                ))}
            </div>
            <div className="mt-6 grid gap-0 border border-[var(--color-line-strong)] lg:grid-cols-2">
                <div className="border-b lg:border-b-0 lg:border-r border-[var(--color-line-strong)] p-5">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-ink)]">OUTBOUND · APIs you call</p>
                    <div className="mt-3 bg-[var(--color-ink)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-paper)]">$ driftlock fix ./repo --dry-run<br /><span className="text-[var(--color-signal-green)]/90">✓</span> 12 call sites · 2 drifted<br /><span className="text-[var(--color-signal-green)]">→</span> stripe.charges.create: source → payment_method</div>
                </div>
                <div className="p-5">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-ink)]">INBOUND · Webhooks you receive</p>
                    <div className="mt-3 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-ink)]/80">POST /webhooks/capture/stripe → forward → handler<br />flatten data.amount → "number"<br /><span className="text-[var(--color-signal-red)]">diff</span> +payment_method −source · 84%</div>
                </div>
            </div>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Why not Renovate or Dependabot</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                They bump the version in package.json. When stripe.charges.create needs a new field, they do not touch it. DriftLock migrates the code at the call site and opens the PR.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-0 border border-[var(--color-line-strong)]">
                <div className="bg-[var(--color-surface)] p-4">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">BEFORE · MANUAL</p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-ink)]/80"><li>• Avoid upgrades</li><li>• Grep, miss one</li><li>• Copy guide by hand</li><li>• Weeks, so you postpone</li></ul>
                    <p className="mt-4 border-t border-[var(--color-line)] pt-2 font-mono text-[11px] text-[var(--color-signal-red)]">Result: stuck</p>
                </div>
                <div className="bg-[var(--color-ink)] p-4 text-[var(--color-paper)]">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-paper)]/60">AFTER · DRIFTLOCK</p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-paper)]/80"><li className="text-[var(--color-paper)]">• Every call found</li><li>• Fix generated</li><li>• PR opened</li><li>• Minutes, not weeks</li></ul>
                    <p className="mt-4 border-t border-white/15 pt-2 font-mono text-[11px] text-[var(--color-signal-green)]/90">Result: current</p>
                </div>
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/install" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Install</Link>
                <Link to="/docs" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Docs</Link>
            </div>
        </div>
    );
}
