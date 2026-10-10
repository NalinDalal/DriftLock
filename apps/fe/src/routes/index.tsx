import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { track } from "../lib/analytics";
import { getMe } from "../api/client";

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
                        <span key={i} style={{ color: "var(--color-code-string)" }}>
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
                                    <span key={`${i}-${j}`} style={{ color: "var(--color-code-keyword)", fontWeight: 600 }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (["Stripe", "string", "number", "boolean"].includes(sp)) {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "var(--color-code-type)" }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (sp === "createCharge" || sp === "createRefund") {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "var(--color-ink)", fontWeight: 700 }}>
                                        {sp}
                                    </span>
                                );
                            }
                            if (/^\d+$/.test(sp)) {
                                return (
                                    <span key={`${i}-${j}`} style={{ color: "var(--color-code-number)" }}>
                                        {sp}
                                    </span>
                                );
                            }
                            return (
                                <span key={`${i}-${j}`} style={{ color: "var(--color-ink)" }}>
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
        <div className="overflow-hidden border border-[var(--color-line-strong)] bg-[var(--color-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2.5">
                <p className="font-mono text-[11px] tracking-wide text-[var(--color-paper)]">TRY, NO INSTALL · REGEX PREVIEW OF THE CLI SCAN</p>
                <span className="font-mono text-[10px] tracking-wide text-[var(--color-paper)]/60">NO DATA LEAVES BROWSER</span>
            </div>
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                <div className="border-r border-[var(--color-line)] bg-[var(--color-paper)] p-3 sm:p-4">
                    <div className="flex items-center justify-between pb-2">
                        <p className="font-mono text-[11px] tracking-wide text-[var(--color-ink)]">src/payments.ts rev 00{String(sites.length).padStart(2, "0")}</p>
                        <button onClick={run} className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-3 py-1 font-mono text-[11px] tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98]">
                            DETECT
                        </button>
                    </div>
                    <div className="relative h-[240px] overflow-hidden border border-[var(--color-line-strong)]/15 bg-[var(--color-surface)]">
                        <pre className="absolute inset-0 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words pointer-events-none text-[var(--color-ink)]" style={{ margin: 0 }}>
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
                            aria-label="Editable code sample. Vendor call sites are detected as you type."
                            className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent p-3 font-mono text-xs leading-5 text-transparent caret-[var(--color-ink)] selection:bg-[var(--color-line)]"
                        />
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-[var(--color-muted)]">Like VS Code. Keywords purple, types blue, strings green.</p>
                </div>
                <div className="bg-[var(--color-surface)] p-3 sm:p-4">
                    <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2">
                        <p className="font-mono text-[11px] tracking-wide text-[var(--color-ink)]">{sites.length} CALL SITES DETECTED</p>
                        <span key={burst} className="font-mono text-[11px] tracking-wide text-[var(--color-muted)]" style={{ transition: "transform 160ms cubic-bezier(0.16,1,0.3,1)", transform: burst ? "scale(1.04)" : "scale(1)" }}>
                            {sites.length > 0 ? "READY TO CAPTURE" : "NO CALLS"}
                        </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                        {sites.length === 0 ? (
                            <div className="border border-dashed border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-6 text-center font-mono text-xs text-[var(--color-muted)]">
                                No vendor calls. Try <span className="text-[var(--color-ink)]">stripe.charges.create</span>
                            </div>
                        ) : (
                            sites.map((s) => (
                                <div key={`${s.method}:${s.line}`} className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
                                    <div>
                                        <p className="font-mono text-xs font-medium text-[var(--color-ink)]">{s.method}</p>
                                        <p className="font-mono text-[11px] text-[var(--color-muted)]">{s.endpoint} · L{s.line}</p>
                                    </div>
                                    <span className="font-mono text-[11px] tracking-wide text-[var(--color-ink)]">→</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                        <p className="font-mono text-[11px] tracking-wide text-[var(--color-muted)]">NEXT AFTER SCAN</p>
                        <p className="mt-1 font-mono text-xs leading-4 text-[var(--color-ink)]">Sandbox capture → shape diff → fix PR. This is step 1 of 4.</p>
                        <Link to="/install" onClick={() => track("install_clicked", { source: "playground" })} className="mt-3 inline-flex border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-3 py-1.5 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] transition-[transform,background]">
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
    const [user, setUser] = useState<{ name: string; handle: string } | null>(null);
    useReveal();
    useEffect(() => {
        getMe()
            .then(({ user: me }) => setUser(me ?? null))
            .catch(() => setUser(null));
    }, []);
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
            <div className="relative overflow-hidden border-b border-[var(--color-line-strong)] bg-[var(--color-paper)]">
                <div className="absolute inset-0 bg-grid opacity-60" />
                <div className="absolute inset-x-0 top-0 h-[1px] bg-[var(--color-ink)]" />
                <div className="relative mx-auto max-w-[1080px] px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
                    <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]" style={stagger(0)}>
                        DEPENDABOT BUT FOR APIS
                        <span className="hidden sm:inline">· STRIPE FIRST</span>
                    </div>

                    <h1 className="display mt-4 max-w-[680px] text-[var(--color-ink)]" style={stagger(1)}>
                        <span className="word-reveal" style={{ animationDelay: "30ms" }}>APIs</span>{" "}
                        <span className="word-reveal" style={{ animationDelay: "100ms" }}>should</span>{" "}
                        <span className="word-reveal italic font-normal" style={{ animationDelay: "170ms" }}>maintain</span>{" "}
                        <span className="word-reveal italic font-normal" style={{ animationDelay: "240ms" }}>themselves.</span>
                    </h1>
                    <p className="mt-4 max-w-[520px] font-mono text-[13px] leading-5 text-[var(--color-ink)]/80" style={stagger(2)}>
                        When Stripe renames source to payment_method, DriftLock redlines every call site and pins a PR. No hunt, no guide.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3" style={stagger(3)}>
                        {user ? (
                            <>
                                <Link to="/accounts" className="bg-[var(--color-ink)] px-5 py-2.5 font-mono text-[13px] tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98]">
                                    OPEN DASHBOARD
                                </Link>
                                <Link to="/docs" className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 font-mono text-[13px] tracking-wide text-[var(--color-ink)] transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.98]">
                                    READ THE DOCS
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link to="/install" onClick={() => track("install_clicked", { source: "hero" })} className="bg-[var(--color-ink)] px-5 py-2.5 font-mono text-[13px] tracking-wide text-[var(--color-paper)] transition-[transform,background] hover:bg-[var(--color-ink)]/90 active:scale-[0.98]">
                                    INSTALL GITHUB APP
                                </Link>
                                <a href="https://github.com/nerdev-co/DriftLock" target="_blank" rel="noreferrer" onClick={() => track("github_cta_clicked", { source: "hero" })} className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 font-mono text-[13px] tracking-wide text-[var(--color-ink)] transition-[transform,background] hover:bg-[var(--color-paper)] active:scale-[0.98]">
                                    VIEW ON GITHUB
                                </a>
                            </>
                        )}
                        <span className="font-mono text-xs text-[var(--color-muted)]">Free in beta · Rev. 01</span>
                    </div>

                    <div className="mt-10 border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-[6px_6px_0_var(--color-line-strong)] sm:rotate-[0.35deg]" style={stagger(4)}>
                        <div className="flex items-center justify-between border-b border-[var(--color-line-strong)] bg-[var(--color-ink)] px-3 py-2">
                            <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-paper)]">SHEET 01 · PR 987 · POST /v1/charges</span>
                            <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-[var(--color-paper)]">
                                <span className="h-2 w-2 rounded-full bg-[var(--color-signal-red)] animate-pulse" />
                                DRIFT DETECTED
                            </span>
                        </div>
                        <div className="grid sm:grid-cols-[1fr_36px_1fr]">
                            <div className="p-4 sm:p-5">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">BEFORE · YOUR CODE</p>
                                <div className="mt-3 font-mono text-xs leading-5">
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-muted)]">144</span>
                                        <span className="w-6 select-none text-center text-[var(--color-muted)]"></span>
                                        <span className="text-[var(--color-ink)]/80">await stripe.charges.create({"{"}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-muted)]">145</span>
                                        <span className="w-6 select-none text-center text-[var(--color-muted)]"></span>
                                        <span className="text-[var(--color-ink)]/80">&nbsp;&nbsp;amount: 2000,</span>
                                    </div>
                                    <div className="flex bg-[var(--color-red-bg)]">
                                        <span className="w-9 select-none text-right text-[var(--color-muted)]">146</span>
                                        <span className="w-6 select-none text-center font-bold text-[var(--color-signal-red)]">−</span>
                                        <span className="text-[var(--color-signal-red)]">&nbsp;&nbsp;source: &quot;tok_visa&quot;</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-muted)]">147</span>
                                        <span className="w-6 select-none text-center text-[var(--color-muted)]"></span>
                                        <span className="text-[var(--color-ink)]/80">&#125;);</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-line)] pt-2 font-mono text-[11px]">
                                    <span className="bg-[var(--color-signal-red)] px-1.5 py-0.5 text-[var(--color-paper)] line-through decoration-[var(--color-paper)]/60">source</span>
                                    <span className="text-[var(--color-signal-red)]">removed by Stripe</span>
                                </div>
                            </div>
                            <div className="hidden sm:flex items-center justify-center border-x border-[var(--color-line)] bg-[var(--color-paper)] font-mono text-[var(--color-ink)]">→</div>
                            <div className="sm:hidden flex justify-center border-y border-[var(--color-line)] bg-[var(--color-paper)] py-2 font-mono text-[var(--color-ink)]">↓</div>
                            <div className="bg-[var(--color-green-bg)] p-4 sm:p-5">
                                <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-signal-green)]">AFTER · PR BY DRIFTLOCK</p>
                                <div className="mt-3 font-mono text-xs leading-5">
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-signal-green)]/70">144</span>
                                        <span className="w-6 select-none text-center text-[var(--color-signal-green)]/70"></span>
                                        <span className="text-[var(--color-ink)]">await stripe.charges.create({"{"}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-signal-green)]/70">145</span>
                                        <span className="w-6 select-none text-center text-[var(--color-signal-green)]/70"></span>
                                        <span className="text-[var(--color-ink)]">&nbsp;&nbsp;amount: 2000,</span>
                                    </div>
                                    <div className="flex bg-[var(--color-green-bg-strong)]">
                                        <span className="w-9 select-none text-right text-[var(--color-signal-green)]/70">146</span>
                                        <span className="w-6 select-none text-center font-bold text-[var(--color-signal-green)]">+</span>
                                        <span className="text-[var(--color-signal-green)]">&nbsp;&nbsp;payment_method: &quot;pm_123&quot;</span>
                                    </div>
                                    <div className="flex">
                                        <span className="w-9 select-none text-right text-[var(--color-signal-green)]/70">147</span>
                                        <span className="w-6 select-none text-center text-[var(--color-signal-green)]/70"></span>
                                        <span className="text-[var(--color-ink)]">&#125;);</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-signal-green)]/20 pt-2 font-mono text-[11px]">
                                    <span className="bg-[var(--color-signal-green)] px-1.5 py-0.5 text-[var(--color-paper)]">payment_method</span>
                                    <span className="text-[var(--color-signal-green)]">1 file changed</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 py-2 font-mono text-[11px]">
                            <span className="tracking-wide text-[var(--color-muted)]">BASELINE .driftlock/snapshots · DIFF +payment_method −source</span>
                            <span className="flex items-center gap-2">
                                <span className="text-[var(--color-signal-green)]">fix confidence 84%</span>
                                <span className="hidden sm:inline h-3 w-px bg-[var(--color-line)]" />
                                <span className="flex items-center gap-1 text-[var(--color-ink)]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal-green)]" />
                                    Checks passed · Review required
                                </span>
                                <span className="ml-2 flex h-6 w-6 items-center justify-center border border-[var(--color-line-strong)] bg-[var(--color-surface)]">
                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                                        <rect x="3" y="6" width="8" height="6" rx="1" stroke="var(--color-ink)" strokeWidth="1.2" />
                                        <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="var(--color-ink)" strokeWidth="1.2" />
                                    </svg>
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wide">
                        <span className="text-[var(--color-muted)]">WATCHES</span>
                        <span className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)]">Stripe</span>
                        <span className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)]">Twilio</span>
                        <span className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)]">Shopify</span>
                        <span className="border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-muted)]">Bring your OpenAPI</span>
                    </div>
                </div>
            </div>

            <div className="reveal border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-14">
                    <div className="mx-auto max-w-[720px]">
                        <h2 className="heading-section text-[var(--color-ink)]">
                            Changelogs do not get read. <span className="text-[var(--color-signal-red)]">Prisma 7</span> broke my app before interviews — a vendor change I missed.
                        </h2>
                        <div className="mt-6 h-px w-full bg-[var(--color-ink)]" />
                        <div className="mt-6 grid gap-6 font-mono text-xs leading-5 sm:grid-cols-3">
                            <p className="text-[var(--color-ink)]/80">Teams freeze on old API versions because migration is tedious and grepping misses calls.</p>
                            <p className="text-[var(--color-ink)]/80">Semver is a convention, not a guarantee. Many APIs do not follow it strictly.</p>
                            <p className="text-[var(--color-ink)]/80">Mocked tests cannot catch drift. DriftLock classifies real versus mocked traffic.</p>
                        </div>
                        <p className="mt-6 border-l-2 border-[var(--color-line-strong)] pl-4 font-mono text-xs leading-4 text-[var(--color-muted)]">I built DriftLock because Prisma 7 broke my app before interviews. What I needed was not a version bump but a code migration. <span className="text-[var(--color-muted)]"> · README</span></p>
                        <p className="mt-4 font-mono text-xs leading-4 text-[var(--color-muted)]">The numbers behind this are on <Link to="/statistics" className="underline underline-offset-2 hover:text-[var(--color-ink)]">API drift statistics 2026</Link>, and the company behind it is on <Link to="/about" className="underline underline-offset-2 hover:text-[var(--color-ink)]">About DriftLock</Link>.</p>
                    </div>
                </div>
            </div>

            <div className="reveal mx-auto max-w-[1080px] px-6 py-8">
                <TryPlayground />
            </div>

            <div className="reveal mx-auto max-w-[1080px] px-6 py-10 sm:py-14">
                <div className="mx-auto max-w-[720px]">
                    <h2 className="heading-section text-[var(--color-ink)]">Questions teams ask before installing</h2>
                    <div className="mt-8 space-y-6">
                        <div>
                            <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">DO I HAVE TO MERGE EVERY PR?</h3>
                            <p className="mt-1 font-mono text-xs leading-5 text-[var(--color-ink)]/80">No. Every change is a PR. Nothing is merged without you. Preview first with driftlock fix --dry-run.</p>
                        </div>
                        <div>
                            <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">HOW IS THIS DIFFERENT FROM RENOVATE?</h3>
                            <p className="mt-1 font-mono text-xs leading-5 text-[var(--color-ink)]/80">Renovate bumps the version in package.json. DriftLock migrates the code at the call site, for example source to payment_method.</p>
                        </div>
                        <div>
                            <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">WHAT DOES IT COST?</h3>
                            <p className="mt-1 font-mono text-xs leading-5 text-[var(--color-ink)]/80">Free in beta. Install the GitHub App, select repos, review PRs.</p>
                        </div>
                        <div>
                            <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">WHAT STACK IS SUPPORTED?</h3>
                            <p className="mt-1 font-mono text-xs leading-5 text-[var(--color-ink)]/80">TypeScript and JavaScript, Stripe first. Twilio and Shopify are on the roadmap.</p>
                        </div>
                    </div>
                    <p className="mt-6 font-mono text-xs leading-4 text-[var(--color-muted)]">More detail on <Link to="/features" className="underline underline-offset-2 hover:text-[var(--color-ink)]">Features</Link>, setup on <Link to="/docs" className="underline underline-offset-2 hover:text-[var(--color-ink)]">Docs</Link>.</p>
                </div>
            </div>

            <div className="reveal mx-auto max-w-[1080px] px-6 py-10 sm:py-14">
                <div className="mx-auto max-w-[720px]">
                    <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">PRICING</p>
                    <h2 className="heading-section mt-2 text-[var(--color-ink)]">Free in beta. $99 Team and $299 Scale are coming soon.</h2>
                    <div className="mt-4">
                        <Link to="/pricing" className="inline-flex border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] transition-[transform,background]">SEE PRICING</Link>
                    </div>
                </div>
            </div>

            <div className="border-t border-[var(--color-line-strong)] bg-[var(--color-surface)]">
                <div className="mx-auto max-w-[1080px] px-6 py-10 text-center">
                    <h2 className="heading-section text-[var(--color-ink)]">Stay current without the migration tax.</h2>
                    <p className="mx-auto mt-2 max-w-[520px] font-mono text-xs leading-4 text-[var(--color-muted)]">Install once. Watches every repo you select. Nothing merged without you.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {user ? (
                            <>
                                <Link to="/accounts" className="bg-[var(--color-ink)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] transition-[transform,background]">OPEN DASHBOARD</Link>
                                <Link to="/docs" className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)] active:scale-[0.98] transition-[transform,background]">READ THE DOCS</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/install" className="bg-[var(--color-ink)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90 active:scale-[0.98] transition-[transform,background]">INSTALL GITHUB APP</Link>
                                <Link to="/accounts" className="border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-2.5 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)] active:scale-[0.98] transition-[transform,background]">VIEW DASHBOARD</Link>
                            </>
                        )}
                    </div>
                    <p className="mt-4 font-mono text-[11px] tracking-wide text-[var(--color-muted)]">Free in beta · Self-host webhook capture · No code merged without you · <Link to="/security" className="underline underline-offset-2 hover:text-[var(--color-ink)]">No training. No retention.</Link></p>
                </div>
            </div>
        </div>
    );
}
