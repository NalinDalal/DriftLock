import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { track } from "../lib/analytics";

const SAMPLE_CODE = `import Stripe from "stripe";
const stripe = new Stripe("sk_test_123");

export async function createCharge(amount: number) {
  const result = await stripe.charges.create({
    amount,
    currency: "usd",
    source: "tok_visa",
  });
  return result.status;
}

export async function createRefund(chargeId: string) {
  const refund = await stripe.refunds.create({ charge: chargeId });
  return refund.id;
}`;

function detectDemoCallSites(code: string): Array<{ method: string; endpoint: string; line: number }> {
    const results: Array<{ method: string; endpoint: string; line: number }> = [];
    const re = /stripe\.([a-zA-Z.]+)\.(create|retrieve|update|list|confirm|cancel|capture)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const method = `stripe.${m[1]}.${m[2]}`;
        const map: Record<string, string> = {
            "stripe.charges.create": "POST /v1/charges",
            "stripe.charges.retrieve": "GET /v1/charges/:id",
            "stripe.refunds.create": "POST /v1/refunds",
            "stripe.customers.create": "POST /v1/customers",
        };
        const endpoint = map[method] ?? `POST /v1/${m[1].replace(".", "/")}`;
        const line = code.slice(0, m.index).split("\n").length;
        results.push({ method, endpoint, line });
    }
    return results;
}

function HighlightedCode({ code }: { code: string }) {
    const parts = code.split(/(".*?"|'.*?'|`.*?`)/g);
    return (
        <>
            {parts.map((part, i) => {
                if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith("`") && part.endsWith("`"))) {
                    return (
                        <span key={i} style={{ color: "#059669" }}>
                            {part}
                        </span>
                    );
                }
                const sub = part.split(/\b(import|from|const|let|var|async|await|export|function|return|new|Stripe|string|number|boolean)\b/g);
                return (
                    <span key={i}>
                        {sub.map((sp, j) => {
                            if (["import", "from", "const", "let", "var", "async", "await", "export", "function", "return", "new"].includes(sp)) {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "#7C3AED", fontWeight: 600 }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (["Stripe", "string", "number", "boolean"].includes(sp)) {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "#0284C7" }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (sp === "createCharge" || sp === "createRefund") {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "#0F172A", fontWeight: 700 }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (/^\d+$/.test(sp)) {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "#DC2626" }}>
                                        {sp}
                                    </span>
                                );
                            }
                            return (
                                <span key={`${i}-${j}`} style={{ color: "#0F172A" }}>
                                    {sp}
                                </span>
                            );
                        })}
                    </span>
                );
            })}
        </>
    );
}

function TryPlayground() {
    const [code, setCode] = useState(SAMPLE_CODE);
    const [burst, setBurst] = useState(0);
    const sites = useMemo(() => detectDemoCallSites(code), [code]);
    const highlightRef = useMemo(() => code, [code]);

    useEffect(() => {
        track("try_sample_view", { sites: sites.length });
    }, [sites.length]);

    function run() {
        track("try_sample_run", { sites: sites.length, chars: code.length });
        setBurst((n) => n + 1);
    }

    return (
        <div className="overflow-hidden border border-[#0F172A] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0F172A] bg-[#0F172A] px-4 py-2.5">
                <p className="font-mono text-[11px] tracking-wide text-white">TRY — NO INSTALL · SAME EXTRACTOR THE CLI USES</p>
                <span className="font-mono text-[10px] tracking-wide text-white/60">NO DATA LEAVES BROWSER</span>
            </div>
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                <div className="border-r border-[#E6E7EE] bg-[#FFFBF5] p-3 sm:p-4">
                    <div className="flex items-center justify-between pb-2">
                        <p className="font-mono text-[11px] tracking-wide text-[#0F172A]">src/payments.ts — 00{String(sites.length).padStart(2, "0")}</p>
                        <button onClick={run} className="border border-[#0F172A] bg-[#0F172A] px-3 py-1 font-mono text-[11px] tracking-wide text-white transition-[transform,background] hover:bg-[#1E293B] active:scale-[0.98]">
                            DETECT
                        </button>
                    </div>
                    <div className="relative h-[240px] overflow-hidden border border-[#0F172A]/15 bg-white">
                        <pre className="absolute inset-0 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words pointer-events-none text-[#0F172A]" style={{ margin: 0 }}>
                            <HighlightedCode code={highlightRef} />
                            {"\n"}
                        </pre>
                        <textarea
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            onScroll={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                const pre = target.previousElementSibling as HTMLElement | null;
                                if (pre) {
                                    pre.scrollTop = target.scrollTop;
                                    pre.scrollLeft = target.scrollLeft;
                                }
                            }}
                            spellCheck={false}
                            className="absolute inset-0 h-full w-full resize-none bg-transparent p-3 font-mono text-xs leading-5 caret-[#0F172A] text-transparent selection:bg-[#E6E7EE] focus:outline-none overflow-auto whitespace-pre-wrap break-words"
                            style={{ color: "transparent", caretColor: "#0F172A" }}
                        />
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-[#64748B]">Like VS Code. Keywords purple, types blue, strings green.</p>
                </div>
                <div className="bg-white p-3 sm:p-4">
                    <div className="flex items-center justify-between border-b border-[#E6E7EE] pb-2">
                        <p className="font-mono text-[11px] tracking-wide text-[#0F172A]">{sites.length} CALL SITES DETECTED</p>
                        <span key={burst} className="font-mono text-[11px] tracking-wide text-[#64748B]" style={{ transition: "transform 160ms cubic-bezier(0.16,1,0.3,1)", transform: burst ? "scale(1.04)" : "scale(1)" }}>
                            {sites.length > 0 ? "READY TO CAPTURE" : "NO CALLS"}
                        </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                        {sites.length === 0 ? (
                            <div className="border border-dashed border-[#E6E7EE] bg-[#FFFBF5] px-4 py-6 text-center font-mono text-xs text-[#64748B]">
                                No vendor calls. Try <span className="text-[#0F172A]">stripe.charges.create</span>
                            </div>
                        ) : (
                            sites.map((s) => (
                                <div key={`${s.method}:${s.line}`} className="flex items-center justify-between border border-[#E6E7EE] bg-white px-3 py-2">
                                    <div>
                                        <p className="font-mono text-xs font-medium text-[#0F172A]">{s.method}</p>
                                        <p className="font-mono text-[11px] text-[#64748B]">{s.endpoint} · L{s.line}</p>
                                    </div>
                                    <span className="font-mono text-[11px] tracking-wide text-[#0F172A]">—</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="mt-4 border-t border-[#E6E7EE] pt-3">
                        <p className="font-mono text-[11px] tracking-wide text-[#64748B]">NEXT AFTER SCAN</p>
                        <p className="mt-1 font-mono text-xs leading-4 text-[#0F172A]">Sandbox capture → shape diff → fix PR. This is step 1 of 4.</p>
                        <Link to="/install" onClick={() => track("install_clicked", { source: "playground" })} className="mt-3 inline-flex border border-[#0F172A] bg-[#0F172A] px-3 py-1.5 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B] active:scale-[0.98] transition-[transform,background]">
                            CONTINUE TO INSTALL
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function useReveal() {
    useEffect(() => {
        if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
            return;
        }
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("in");
                        obs.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
        );
        document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
        return () => obs.disconnect();
    }, []);
}

export default function LandingPage() {
    const [mounted, setMounted] = useState(false);
    useReveal();
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        track("landing_view", { variant: "blueprint-rev01" });
        return () => cancelAnimationFrame(id);
    }, []);

    const stagger = (i: number): React.CSSProperties =>
        mounted
            ? { opacity: 1, transform: "translateY(0)", transition: `opacity 480ms cubic-bezier(0.16,1,0.3,1) ${i * 50}ms, transform 480ms cubic-bezier(0.16,1,0.3,1) ${i * 50}ms` }
            : { opacity: 0, transform: "translateY(8px)" };

    return (
        <div className="-mx-6 -mt-8">
            <div className="relative overflow-hidden border-b border-[#0F172A] bg-[#FFFBF5]">
                <div className="absolute inset-0 bg-grid opacity-60" />
                <div className="absolute inset-x-0 top-0 h-[1px] bg-[#0F172A]" />
                <div className="relative mx-auto max-w-[1080px] px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
                    <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[#64748B]" style={stagger(0)}>
                        DEPENDABOT BUT FOR APIS
                        <span className="hidden sm:inline">· STRIPE FIRST</span>
                    </div>

                    <h1 className="mt-4 max-w-[680px] font-display text-[40px] leading-[0.88] tracking-[-0.035em] text-[#0F172A] sm:text-[56px]" style={stagger(1)}>
                        <span className="word-reveal" style={{ animationDelay: "30ms" }}>APIs</span>{" "}
                        <span className="word-reveal" style={{ animationDelay: "100ms" }}>should</span>{" "}
                        <span className="word-reveal italic font-normal" style={{ animationDelay: "170ms" }}>maintain</span>{" "}
                        <span className="word-reveal italic font-normal" style={{ animationDelay: "240ms" }}>themselves.</span>
                    </h1>
                    <p className="mt-4 max-w-[520px] font-mono text-[13px] leading-5 text-[#334155]" style={stagger(2)}>
                        When Stripe renames source to payment_method, DriftLock redlines every call site and pins a PR. No hunt, no guide.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3" style={stagger(3)}>
                        <Link to="/install" onClick={() => track("install_clicked", { source: "hero" })} className="bg-[#0F172A] px-5 py-2.5 font-mono text-[13px] tracking-wide text-white transition-[transform,background] hover:bg-[#1E293B] active:scale-[0.98]">
                            INSTALL GITHUB APP
                        </Link>
                        <a href="https://github.com/nerdev-co/DriftLock" target="_blank" rel="noreferrer" onClick={() => track("github_cta_clicked", { source: "hero" })} className="border border-[#0F172A] bg-white px-5 py-2.5 font-mono text-[13px] tracking-wide text-[#0F172A] transition-[transform,background] hover:bg-[#FFFBF5] active:scale-[0.98]">
                            VIEW ON GITHUB
                        </a>
                        <span className="font-mono text-xs text-[#64748B]">Free in beta · Rev. 01</span>
                    </div>

                    <div className="mt-10 border border-[#0F172A] bg-white shadow-[6px_6px_0_#0F172A] sm:rotate-[0.35deg]" style={stagger(4)}>
                        <div className="flex items-center justify-between border-b border-[#0F172A] bg-[#0F172A] px-3 py-2">
                            <span className="font-mono text-[11px] tracking-[0.12em] text-white">SHEET 01 · PR 987 · POST /v1/charges</span>
                            <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-white">
                                <span className="h-2 w-2 rounded-full bg-[#DC2626] animate-pulse" />
                                DRIFT DETECTED
                            </span>
                        </div>
                        <div className="grid sm:grid-cols-[1fr_36px_1fr]">
                            <div className="p-4 sm:p-5">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[#94A3B8]">BEFORE · YOUR CODE</p>
                                <div className="mt-3 font-mono text-xs leading-5">
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#94A3B8]">144</span>
                                        <span className="w-6 select-none text-center text-[#94A3B8]"></span>
                                        <span className="text-[#334155]">await stripe.charges.create({"{"}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#94A3B8]">145</span>
                                        <span className="w-6 select-none text-center text-[#94A3B8]"></span>
                                        <span className="text-[#334155]">&nbsp;&nbsp;amount: 2000,</span>
                                    </div>
                                    <div className="flex bg-[#FEF2F2]">
                                        <span className="w-9 select-none text-right text-[#94A3B8]">146</span>
                                        <span className="w-6 select-none text-center font-bold text-[#DC2626]">−</span>
                                        <span className="text-[#DC2626]">&nbsp;&nbsp;source: &quot;tok_visa&quot;</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#94A3B8]">147</span>
                                        <span className="w-6 select-none text-center text-[#94A3B8]"></span>
                                        <span className="text-[#334155]">&#125;);</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 border-t border-[#E6E7EE] pt-2 font-mono text-[11px]">
                                    <span className="bg-[#DC2626] px-1.5 py-0.5 text-white line-through decoration-white/60">source</span>
                                    <span className="text-[#DC2626]">removed by Stripe</span>
                                </div>
                            </div>
                            <div className="hidden sm:flex items-center justify-center border-x border-[#E6E7EE] bg-[#FFFBF5] font-mono text-[#0F172A]">→</div>
                            <div className="sm:hidden flex justify-center border-y border-[#E6E7EE] bg-[#FFFBF5] py-2 font-mono text-[#0F172A]">↓</div>
                            <div className="bg-[#F0FDF4] p-4 sm:p-5">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[#059669]">AFTER · PR BY DRIFTLOCK</p>
                                <div className="mt-3 font-mono text-xs leading-5">
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#6EE7B7]">144</span>
                                        <span className="w-6 select-none text-center text-[#6EE7B7]"></span>
                                        <span className="text-[#0F172A]">await stripe.charges.create({"{"}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#6EE7B7]">145</span>
                                        <span className="w-6 select-none text-center text-[#6EE7B7]"></span>
                                        <span className="text-[#0F172A]">&nbsp;&nbsp;amount: 2000,</span>
                                    </div>
                                    <div className="flex bg-[#ECFDF5]">
                                        <span className="w-9 select-none text-right text-[#6EE7B7]">146</span>
                                        <span className="w-6 select-none text-center font-bold text-[#059669]">+</span>
                                        <span className="text-[#059669]">&nbsp;&nbsp;payment_method: &quot;pm_123&quot;</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[#6EE7B7]">147</span>
                                        <span className="w-6 select-none text-center text-[#6EE7B7]"></span>
                                        <span className="text-[#0F172A]">&#125;);</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 border-t border-[#059669]/20 pt-2 font-mono text-[11px]">
                                    <span className="bg-[#059669] px-1.5 py-0.5 text-white">payment_method</span>
                                    <span className="text-[#059669]">1 file changed</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#0F172A] bg-[#FFFBF5] px-3 py-2 font-mono text-[11px]">
                            <span className="tracking-wide text-[#64748B]">BASELINE .driftlock/snapshots · DIFF +payment_method −source</span>
                            <span className="flex items-center gap-2">
                                <span className="text-[#059669]">fix confidence 84%</span>
                                <span className="hidden sm:inline h-3 w-px bg-[#E6E7EE]" />
                                <span className="flex items-center gap-1 text-[#0F172A]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />
                                    Checks passed · Review required
                                </span>
                                <span className="ml-2 flex h-6 w-6 items-center justify-center border border-[#0F172A] bg-white">
                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                                        <rect x="3" y="6" width="8" height="6" rx="1" stroke="#0F172A" strokeWidth="1.2" />
                                        <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="#0F172A" strokeWidth="1.2" />
                                    </svg>
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wide">
                        <span className="text-[#64748B]">WATCHES</span>
                        <span className="border border-[#0F172A] bg-white px-2.5 py-1 text-[#0F172A]">Stripe</span>
                        <span className="border border-[#0F172A] bg-white px-2.5 py-1 text-[#0F172A]">Twilio</span>
                        <span className="border border-[#0F172A] bg-white px-2.5 py-1 text-[#0F172A]">Shopify</span>
                        <span className="border border-dashed border-[#CBD5E1] bg-white px-2.5 py-1 text-[#64748B]">Bring your OpenAPI</span>
                    </div>
                </div>
            </div>

            <div className="reveal border-b border-[#E6E7EE] bg-white">
                <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-14">
                    <div className="mx-auto max-w-[720px]">
                        <h2 className="font-display text-[24px] leading-[1.05] tracking-[-0.02em] text-[#0F172A] sm:text-[28px]">
                            Changelogs do not get read. 30 percent of <span className="text-[#DC2626]">downtime</span> was a vendor change someone missed.
                        </h2>
                        <div className="mt-6 h-px w-full bg-[#0F172A]" />
                        <div className="mt-6 grid gap-6 font-mono text-xs leading-5 sm:grid-cols-3">
                            <p className="text-[#334155]">Teams freeze on old API versions because migration is tedious and grepping misses calls.</p>
                            <p className="text-[#334155]">Semver is a convention, not a guarantee. Many APIs do not follow it strictly.</p>
                            <p className="text-[#334155]">Mocked tests cannot catch drift. DriftLock classifies real versus mocked traffic.</p>
                        </div>
                        <p className="mt-6 border-l-2 border-[#0F172A] pl-4 font-mono text-xs leading-4 text-[#64748B]">I built DriftLock because Prisma 7 broke my app before interviews. What I needed was not a version bump but a code migration. <span className="text-[#94A3B8]"> — README</span></p>
                    </div>
                </div>
            </div>

            <div className="reveal mx-auto max-w-[1080px] px-6 py-8">
                <TryPlayground />
            </div>

            <div className="reveal border-y border-[#0F172A] bg-white">
                <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-12">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">Scan → Capture → Diff → Fix PR</h2>
                        <span className="font-mono text-[11px] tracking-wide text-[#64748B]">TWO SURFACES: OUTBOUND + INBOUND</span>
                    </div>
                    <div className="mt-8 relative">
                        <div className="absolute left-0 right-0 top-[18px] hidden h-px bg-[#0F172A] sm:block" />
                        <div className="grid gap-5 sm:grid-cols-4 sm:gap-6">
                            {[
                                { n: "01", t: "SCAN", d: "AST finds every vendor call.", sub: "TypeScriptExtractor" },
                                { n: "02", t: "CAPTURE", d: "Sandbox proxy records shapes.", sub: "SandboxRunner" },
                                { n: "03", t: "DIFF", d: "Added, removed, type changed.", sub: "diffShapes()" },
                                { n: "04", t: "FIX PR", d: "Deterministic rename, null check.", sub: "FixPRRunner" },
                            ].map((s) => (
                                <div key={s.n} className="flex gap-3 sm:block sm:gap-0 bg-white sm:bg-transparent">
                                    <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center border border-[#0F172A] bg-[#0F172A] font-mono text-xs tracking-wide text-white">{s.n}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A] sm:mt-3">{s.t}</p>
                                        <p className="mt-1 font-mono text-xs leading-4 text-[#64748B] sm:max-w-[18ch]">{s.d}</p>
                                        <p className="mt-1 font-mono text-[11px] tracking-wide text-[#94A3B8] sm:mt-2">{s.sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="mt-10 grid gap-0 border border-[#0F172A] lg:grid-cols-2">
                        <div className="border-b lg:border-b-0 lg:border-r border-[#0F172A] p-5">
                            <p className="font-mono text-[11px] tracking-[0.1em] text-[#0F172A]">OUTBOUND · APIs you call</p>
                            <div className="mt-3 bg-[#0F172A] px-3 py-2 font-mono text-xs leading-5 text-white">$ driftlock fix ./repo --dry-run<br /><span className="text-[#86EFAC]">✓</span> 12 call sites · 2 drifted<br /><span className="text-[#FDE68A]">→</span> stripe.charges.create: source → payment_method</div>
                        </div>
                        <div className="p-5">
                            <p className="font-mono text-[11px] tracking-[0.1em] text-[#0F172A]">INBOUND · Webhooks you receive</p>
                            <div className="mt-3 border border-[#E6E7EE] bg-[#FFFBF5] px-3 py-2 font-mono text-xs leading-5 text-[#334155]">POST /webhooks/capture/stripe → forward → handler<br />flatten data.amount → "number"<br /><span className="text-[#DC2626]">diff</span> +payment_method −source · 84%</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="reveal bg-[#FFFBF5]">
                <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-14">
                    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                        <div>
                            <h3 className="font-display text-[20px] tracking-[-0.02em] text-[#0F172A]">They bump the version. We migrate the code.</h3>
                            <div className="mt-4 space-y-3 font-mono text-xs leading-5 text-[#334155]">
                                <p>Renovate updates package.json. When stripe.charges.create needs a new field, they do not touch it.</p>
                                <p>Semver is a convention. Hunting every call site by hand is why teams stay vulnerable.</p>
                            </div>
                            <div className="mt-5 flex gap-2">
                                <Link to="/install" className="bg-[#0F172A] px-4 py-2 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B] active:scale-[0.98] transition-[transform,background]">INSTALL NOW</Link>
                                <a href="https://github.com/nerdev-co/DriftLock" target="_blank" rel="noreferrer" className="border border-[#0F172A] bg-white px-4 py-2 font-mono text-xs tracking-wide text-[#0F172A] hover:bg-white active:scale-[0.98] transition-[transform,background]">READ THE STORY</a>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0 border border-[#0F172A]">
                            <div className="bg-white p-4">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[#64748B]">BEFORE · MANUAL</p>
                                <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-[#334155]"><li>• Avoid upgrades</li><li>• Grep, miss one</li><li>• Copy guide by hand</li><li>• Weeks, so you postpone</li></ul>
                                <p className="mt-4 border-t border-[#E6E7EE] pt-2 font-mono text-[11px] text-[#DC2626]">Result: stuck</p>
                            </div>
                            <div className="bg-[#0F172A] p-4 text-white">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-white/60">AFTER · DRIFTLOCK</p>
                                <ul className="mt-3 space-y-1.5 font-mono text-xs leading-4 text-white/80"><li className="text-white">• Every call found</li><li>• Fix generated</li><li>• PR opened</li><li>• Minutes, not weeks</li></ul>
                                <p className="mt-4 border-t border-white/15 pt-2 font-mono text-[11px] text-[#86EFAC]">Result: current</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-[#0F172A] bg-white">
                <div className="mx-auto max-w-[1080px] px-6 py-10 text-center">
                    <h2 className="font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">Stay current without the migration tax.</h2>
                    <p className="mx-auto mt-2 max-w-[520px] font-mono text-xs leading-4 text-[#64748B]">Install once. Watches every repo you select. Nothing merged without you.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        <Link to="/install" className="bg-[#0F172A] px-6 py-2.5 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B] active:scale-[0.98] transition-[transform,background]">INSTALL GITHUB APP</Link>
                        <Link to="/accounts" className="border border-[#0F172A] bg-white px-6 py-2.5 font-mono text-xs tracking-wide text-[#0F172A] hover:bg-[#FFFBF5] active:scale-[0.98] transition-[transform,background]">VIEW DASHBOARD</Link>
                    </div>
                    <p className="mt-4 font-mono text-[11px] tracking-wide text-[#94A3B8]">Free in beta · Self-host webhook capture · No code merged without you</p>
                </div>
            </div>
        </div>
    );
}
