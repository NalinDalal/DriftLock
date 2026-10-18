import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function PricingPage() {
    useEffect(() => {
        document.title = "Pricing | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Pricing
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">PRICING</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">3 fix PRs free. Then credits.</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                Models are managed and included, no keys. Scan 10 credits, drift detect 20, AI fix PR 100. 1,000 credits = $15.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] p-5 text-[var(--color-paper)]">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-paper)]/60">TRIAL · LIVE NOW</p>
                    <p className="mt-2 font-mono text-2xl font-semibold">$0</p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-paper)]/80"><li>• 300 credits free, no card, 14-day expiry</li><li>• 3 AI fix PRs to prove value</li><li>• 4th run stops with out_of_credits</li></ul>
                    <Link to="/install" className="mt-4 inline-flex bg-[var(--color-paper)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:opacity-90 active:scale-[0.98] transition-[transform,opacity]">INSTALL GITHUB APP</Link>
                </div>
                <div className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">STARTER</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-[var(--color-ink)]">$29<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span></p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-ink)]/80"><li>• 1,500 credits/mo, ~15 AI PRs</li><li>• Up to 2 private repos, unlimited seats</li><li>• Overage $15 per 1,000 credits</li></ul>
                    <a href="mailto:nalin@nerdev.in?subject=DriftLock%20Starter%20plan%20waitlist" className="mt-4 inline-flex border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-surface)] active:scale-[0.98] transition-[transform,background]">NOTIFY ME</a>
                </div>
                <div className="border border-[var(--color-ink)] bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-ink)]">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">TEAM · MOST POPULAR</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-[var(--color-ink)]">$99<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span></p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-ink)]/80"><li>• 7,000 credits/mo, ~70 AI PRs</li><li>• Up to 5 private repos, unlimited seats</li><li>• Overage $15 per 1,000 credits</li><li>• Fix history dashboard</li></ul>
                    <a href="mailto:nalin@nerdev.in?subject=DriftLock%20Team%20plan%20waitlist" className="mt-4 inline-flex border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-surface)] active:scale-[0.98] transition-[transform,background]">NOTIFY ME</a>
                </div>
                <div className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">SCALE</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-[var(--color-ink)]">$299<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span></p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-ink)]/80"><li>• 25,000 credits/mo, ~250 AI PRs</li><li>• Up to 20 repos, priority models</li><li>• Higher run concurrency</li><li>• Overage $15 per 1,000 credits</li></ul>
                    <a href="mailto:nalin@nerdev.in?subject=DriftLock%20Scale%20plan%20waitlist" className="mt-4 inline-flex border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-surface)] active:scale-[0.98] transition-[transform,background]">NOTIFY ME</a>
                </div>
                <div className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5 sm:col-span-2">
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">ENTERPRISE · TALK TO US</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-[var(--color-ink)]">Custom</p>
                    <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[var(--color-ink)]/80"><li>• SSO/SAML, self-host, BYOK option</li><li>• SLA, DPA, audit log</li></ul>
                    <a href="mailto:nalin@nerdev.in?subject=DriftLock%20Enterprise%20plan" className="mt-4 inline-flex border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-surface)] active:scale-[0.98] transition-[transform,background]">TALK TO US</a>
                </div>
            </div>
            <p className="mt-6 font-mono text-xs leading-4 text-[var(--color-muted)]">Managed models included: no API keys, nothing in repo secrets. 1 AI PR costs us ~$0.10 and sells for ~$1.50 (100 credits). Credits reset monthly, no rollover.</p>
            <p className="mt-6 font-mono text-xs leading-4 text-[var(--color-muted)]">Billing starts at 10 active beta teams or infra over $500/mo, whichever first, with 30 days notice. First 10 design partners stay free 6 months.</p>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/features" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Features</Link>
                <Link to="/docs" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Docs</Link>
            </div>
        </div>
    );
}
