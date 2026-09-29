import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { track } from "../lib/analytics";

type Vendor = "stripe" | "webhook" | "twilio" | "shopify";

const VENDORS: Array<{ id: Vendor; label: string; sub: string; soon?: boolean }> = [
    { id: "stripe", label: "Stripe payments", sub: "Outbound calls you make" },
    { id: "webhook", label: "Stripe webhooks", sub: "Inbound payloads you receive" },
    { id: "twilio", label: "Twilio", sub: "Watching next", soon: true },
    { id: "shopify", label: "Shopify", sub: "Watching next", soon: true },
];

const SAMPLES: Record<string, string> = {
    stripe: `import Stripe from "stripe";
const stripe = new Stripe("sk_test_123");

export async function createCharge(amount: number) {
  const result = await stripe.charges.create({
    amount,
    currency: "usd",
    source: "tok_visa",
  });
  return result.status;
}`,
    webhook: `export async function handle(event: any) {
  const payment = event.data.object;
  return {
    amount: payment.amount,
    source: payment.source,
  };
}`,
};

function detectStripe(code: string): Array<{ method: string; endpoint: string; line: number }> {
    const results: Array<{ method: string; endpoint: string; line: number }> = [];
    const re = /stripe\.([a-zA-Z.]+)\.(create|retrieve|update|list|confirm|cancel|capture)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const method = `stripe.${m[1]}.${m[2]}`;
        const map: Record<string, string> = {
            "stripe.charges.create": "POST /v1/charges",
            "stripe.refunds.create": "POST /v1/refunds",
            "stripe.customers.create": "POST /v1/customers",
        };
        results.push({
            method,
            endpoint: map[method] ?? `POST /v1/${m[1].replace(".", "/")}`,
            line: code.slice(0, m.index).split("\n").length,
        });
    }
    return results;
}

function detectWebhook(code: string): Array<{ method: string; endpoint: string; line: number }> {
    const results: Array<{ method: string; endpoint: string; line: number }> = [];
    const re = /\b(event|req|request|payload|body)\s*((?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*)+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const chain = `${m[1]}${m[2].replace(/\s+/g, "")}`;
        if (/data\s*\.\s*object|body|payload/.test(m[2])) {
            results.push({
                method: chain,
                endpoint: "payload read",
                line: code.slice(0, m.index).split("\n").length,
            });
        }
    }
    return results;
}

export default function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [code, setCode] = useState("");
    const [ran, setRan] = useState(false);

    useEffect(() => {
        document.title = "Onboarding | DriftLock";
        track("onboarding_view", {});
    }, []);

    const sites = useMemo(() => {
        if (vendor === "stripe") return detectStripe(code);
        if (vendor === "webhook") return detectWebhook(code);
        return [];
    }, [code, vendor]);

    function pick(id: Vendor, soon?: boolean) {
        setVendor(id);
        setCode(soon ? "" : (SAMPLES[id] ?? ""));
        setRan(false);
        track("onboarding_intent_selected", { vendor: id, soon: soon ? 1 : 0 });
        if (!soon) setStep(2);
    }

    function run() {
        setRan(true);
        track("onboarding_detect_run", { vendor: vendor ?? "none", sites: sites.length });
    }

    function finish() {
        track("onboarding_step_complete", { vendor: vendor ?? "none", sites: sites.length });
        setStep(3);
    }

    const first = sites[0];

    return (
        <div className="-mx-6 -mt-8">
            <div className="border-b border-[var(--color-line-strong)] bg-[var(--color-paper)]">
                <div className="mx-auto max-w-[1080px] px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
                    <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">
                        ONBOARDING · STEP {Math.min(step, 3)} OF 3 · NO TOUR, REAL OUTCOME
                    </p>
                    <h1 className="display mt-4 max-w-[640px] text-[var(--color-ink)]">
                        {step === 1 && "What are you protecting?"}
                        {step === 2 && "Watch it get found."}
                        {step === 3 && "That is the whole product."}
                    </h1>
                    <p className="mt-4 max-w-[520px] font-mono text-[13px] leading-5 text-[var(--color-ink)]/80">
                        {step === 1 && "Pick your surface. The next screen runs the real scan on real code, not a slideshow."}
                        {step === 2 && "This is the same extractor the CLI uses. Paste your own code or run the sample."}
                        {step === 3 && "DriftLock does this on every change and opens the fix as a PR. Install it on your repo."}
                    </p>
                </div>
            </div>

            <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-12">
                {step === 1 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {VENDORS.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => pick(v.id, v.soon)}
                                className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5 text-left transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.99]"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm font-semibold text-[var(--color-ink)]">{v.label}</p>
                                    {v.soon ? (
                                        <span className="border border-dashed border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] tracking-wide text-[var(--color-muted)]">SOON</span>
                                    ) : (
                                        <span className="font-mono text-xs text-[var(--color-ink)]">→</span>
                                    )}
                                </div>
                                <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{v.sub}</p>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && vendor && (
                    <div className="overflow-hidden border border-[var(--color-line-strong)] bg-[var(--color-surface)]">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2.5">
                            <p className="font-mono text-[11px] tracking-wide text-[var(--color-paper)]">
                                {vendor === "stripe" ? "YOUR CODE → CALL SITES" : "YOUR HANDLER → PAYLOAD READS"} · SAME EXTRACTOR THE CLI USES
                            </p>
                            <button onClick={() => setStep(1)} className="font-mono text-[11px] tracking-wide text-[var(--color-paper)]/60 underline underline-offset-2 hover:text-[var(--color-paper)]">
                                CHANGE SURFACE
                            </button>
                        </div>
                        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="border-r border-[var(--color-line)] bg-[var(--color-paper)] p-3 sm:p-4">
                                <div className="flex items-center justify-between pb-2">
                                    <p className="font-mono text-[11px] tracking-wide text-[var(--color-ink)]">PASTE CODE — NOTHING LEAVES YOUR BROWSER</p>
                                    <button onClick={run} className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-3 py-1 font-mono text-[11px] tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98]">
                                        DETECT
                                    </button>
                                </div>
                                <textarea
                                    value={code}
                                    onChange={(e) => { setCode(e.target.value); setRan(false); }}
                                    spellCheck={false}
                                    className="h-[240px] w-full resize-none border border-[var(--color-line-strong)]/15 bg-[var(--color-surface)] p-3 font-mono text-xs leading-5 text-[var(--color-ink)] focus:outline-none"
                                />
                            </div>
                            <div className="bg-[var(--color-surface)] p-3 sm:p-4">
                                <p className="border-b border-[var(--color-line)] pb-2 font-mono text-[11px] tracking-wide text-[var(--color-ink)]">
                                    {!ran ? "PRESS DETECT" : sites.length > 0 ? `${sites.length} FOUND — THIS IS THE PRODUCT WORKING` : "NO CALLS FOUND"}
                                </p>
                                {ran && (
                                    <div className="mt-3 flex flex-col gap-2">
                                        {sites.length === 0 ? (
                                            <div className="border border-dashed border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-6 text-center font-mono text-xs text-[var(--color-muted)]">
                                                Nothing to protect here. Paste code that calls {vendor === "stripe" ? "stripe.*" : "event.data.object"}.
                                            </div>
                                        ) : (
                                            sites.map((s) => (
                                                <div key={`${s.method}:${s.line}`} className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
                                                    <div>
                                                        <p className="font-mono text-xs font-medium text-[var(--color-ink)]">{s.method}</p>
                                                        <p className="font-mono text-[11px] text-[var(--color-muted)]">{s.endpoint} · L{s.line}</p>
                                                    </div>
                                                    <span className="font-mono text-[11px] text-[var(--color-signal-green)]">✓</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={finish}
                                    disabled={ran && sites.length === 0}
                                    className="mt-4 inline-flex w-full items-center justify-center bg-[var(--color-ink)] px-4 py-2.5 font-mono text-xs tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] disabled:opacity-40"
                                >
                                    {ran && sites.length > 0 ? "IT FOUND THEM — WHAT NEXT? →" : "CONTINUE →"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div>
                        <div className="border border-[var(--color-line-strong)] bg-[var(--color-surface)]">
                            <div className="flex items-center justify-between border-b border-[var(--color-line-strong)] bg-[var(--color-ink)] px-3 py-2">
                                <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-paper)]">WHEN THIS DRIFTS · PR 987</span>
                                <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-[var(--color-paper)]">
                                    <span className="h-2 w-2 rounded-full bg-[var(--color-signal-red)] animate-pulse" />
                                    DRIFT DETECTED
                                </span>
                            </div>
                            <div className="grid sm:grid-cols-2">
                                <div className="border-b border-[var(--color-line-strong)] p-4 sm:border-r sm:border-b-0 sm:p-5">
                                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">BEFORE · YOUR CODE TODAY</p>
                                    <div className="mt-3 bg-[var(--color-red-bg)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-signal-red)]">
                                        {first ? first.method : vendor === "stripe" ? "stripe.charges.create" : "event.data.object"} → <span className="line-through">source</span> removed by vendor
                                    </div>
                                </div>
                                <div className="bg-[var(--color-green-bg)] p-4 sm:p-5">
                                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-signal-green)]">AFTER · PR BY DRIFTLOCK</p>
                                    <div className="mt-3 bg-[var(--color-green-bg-strong)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-signal-green)]">
                                        same call site → payment_method · confidence 84% · review required
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 py-2 font-mono text-[11px]">
                                <span className="tracking-wide text-[var(--color-muted)]">EVERY SITE LIKE {first ? first.method : "THE ONES ABOVE"} GETS THIS TREATMENT</span>
                                <span className="text-[var(--color-ink)]">Nothing merged without you</span>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <Link
                                to="/install"
                                onClick={() => track("install_clicked", { source: "onboarding" })}
                                className="bg-[var(--color-ink)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98]"
                            >
                                INSTALL GITHUB APP
                            </Link>
                            <Link
                                to="/actions"
                                onClick={() => track("actions_clicked", { source: "onboarding" })}
                                className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-ink)] transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.98]"
                            >
                                OR USE GITHUB ACTIONS
                            </Link>
                            <button
                                onClick={() => { setStep(2); setRan(false); }}
                                className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-ink)] transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.98]"
                            >
                                SCAN AGAIN
                            </button>
                        </div>
                        <p className="mt-4 font-mono text-[11px] tracking-wide text-[var(--color-muted)]">Free in beta · Self-host webhook capture · Paid tiers after beta</p>
                    </div>
                )}
            </div>
        </div>
    );
}
