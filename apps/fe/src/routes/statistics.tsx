import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function StatisticsPage() {
    useEffect(() => {
        const prevTitle = document.title;
        document.title = "API Drift Statistics 2026 | DriftLock Research";
        const meta = document.querySelector('meta[name="description"]');
        const content =
            "API drift statistics 2026: industry figures on webhook failures and downtime plus DriftLock measured findings from Stripe fixtures. Updated quarterly.";
        const prevContent = meta?.getAttribute("content") ?? null;
        let tag: HTMLMetaElement | null = null;
        if (meta) {
            meta.setAttribute("content", content);
        } else {
            tag = document.createElement("meta");
            tag.setAttribute("name", "description");
            tag.setAttribute("content", content);
            document.head.appendChild(tag);
        }
        return () => {
            document.title = prevTitle;
            if (meta) {
                if (prevContent !== null) meta.setAttribute("content", prevContent);
            } else if (tag) {
                tag.remove();
            }
        };
    }, []);

    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://driftlock.dev" },
            { "@type": "ListItem", position: 2, name: "About", item: "https://driftlock.dev/about" },
            { "@type": "ListItem", position: 3, name: "API Drift Statistics 2026", item: "https://driftlock.dev/statistics" },
        ],
    };

    const articleSchema = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "API Drift Statistics 2026",
        description:
            "Industry statistics on API drift, webhook failures, and upgrade avoidance, plus DriftLock measured findings from Stripe fixtures and sandbox runs.",
        url: "https://driftlock.dev/statistics",
        datePublished: "2026-10-06",
        dateModified: "2026-10-06",
        author: {
            "@type": "Person",
            name: "Nalin Dalal",
            url: "https://www.linkedin.com/in/nalindalal",
        },
        publisher: {
            "@type": "Organization",
            name: "DriftLock",
            url: "https://driftlock.dev",
        },
    };

    const datasetSchema = {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "DriftLock Stripe fixture drift measurement 2026",
        description:
            "Static scan and shape diff results from the DriftLock sample fixture with 2 Stripe call sites, measured in October 2026.",
        creator: {
            "@type": "Person",
            name: "Nalin Dalal",
            sameAs: "https://www.linkedin.com/in/nalindalal",
        },
        temporalCoverage: "2026-10",
        measurementMethod:
            "TypeScriptExtractor static scan of packages/tests/fixtures/sample-project/src/payments.ts, sandbox proxy capture, diffShapes comparison against baseline snapshot.",
    };

    return (
        <div className="mx-auto max-w-[880px]">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />

            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span>{" "}
                <Link to="/about" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    About
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Statistics
            </nav>

            <h1 className="display text-[var(--color-ink)]">API Drift Statistics 2026</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                DriftLock collects industry statistics on API drift and publishes its own measured findings from Stripe fixtures and sandbox runs for engineering teams that maintain Stripe integrations.
            </p>
            <p className="mt-3 max-w-[65ch] text-[14px] leading-6 text-[var(--color-muted)]">
                Stable address: driftlock.dev/statistics. This page is updated every quarter. Last reviewed October 2026. Changes are recorded at the bottom of the page. Research by{" "}
                <a href="https://www.linkedin.com/in/nalindalal" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    Nalin Dalal
                </a>{" "}
                for{" "}
                <Link to="/about" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    DriftLock
                </Link>
                .
            </p>

            <h2 id="industry-statistics" className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">
                Industry statistics
            </h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-muted)]">
                Each figure links to the original report with its publication context and the period it measured.
            </p>
            <div className="mt-6 space-y-4">
                <div id="stripe-webhook-revenue-leak" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        One Stripe account leaked 2,300 dollars per month for 11 months because invoice.payment_failed returned 200 OK, so Stripe stopped retrying while the handler never revoked access. In a related audit of 6 Stripe accounts, 4 had a critical webhook gap with an average loss of 340 dollars per month.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Source: IndieHackers founder report. Period measured: 11 month leak window plus 6 account audit.{" "}
                        <a href="https://www.indiehackers.com/post/i-found-2-300-leaking-silently-from-a-founders-stripe-account-he-had-no-idea-for-11-months-d54003963d" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                            Read the original audit
                        </a>
                        .
                    </p>
                </div>
                <div id="webhooks-at-scale" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        Teams processing millions of mission critical webhook events across Shopify, Stripe, and Intercom report no good alternative to hand rolled handlers.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Source: IndieHackers practitioner discussion. Period measured: ongoing production webhook volume at time of writing.{" "}
                        <a href="https://www.indiehackers.com/post/dealing-with-webhooks-sucks-but-there-s-something-you-can-do-about-it-70cd46e170" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                            Read the discussion
                        </a>
                        .
                    </p>
                </div>
                <div id="upgrade-avoidance" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        Founders handling real money report double subscriptions from double Checkout, missed cancel webhooks charging forever, wrong Price IDs in environment files, and paid but no service states. The common mitigation is logging everything plus daily reconciliation jobs.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Source: IndieHackers practitioner discussion on billing bugs. Period measured: production billing incidents reported by founders.{" "}
                        <a href="https://www.indiehackers.com/post/how-do-you-deal-with-the-fear-of-bugs-when-real-money-is-on-the-line-24bcbd5516" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                            Read the discussion
                        </a>
                        .
                    </p>
                </div>
            </div>

            <h2 id="driftlock-research" className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">
                DriftLock research
            </h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-muted)]">
                The customer question behind this research: how long does it take to know a vendor change affects my code, and can a PR be opened without hand editing every call site. Method and sample are published beside each finding so writers can cite the number with its meaning intact.
            </p>
            <div className="mt-6 space-y-4">
                <div id="fixture-scan-coverage" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        Static scan found 2 of 2 Stripe call sites in the DriftLock sample fixture in October 2026, with endpoint and HTTP method inference for stripe.charges.create and stripe.refunds.create.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Unit: call sites detected. Sample: 2 calls in packages/tests/fixtures/sample-project/src/payments.ts. Timeframe: October 2026. Method: TypeScriptExtractor static analysis, no network calls. Excluded: dynamic calls built from string variables. Author: Nalin Dalal for DriftLock.
                    </p>
                </div>
                <div id="fixture-shape-diff" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        Shape diff on the Stripe source to payment_method rename detected 1 field removed and 1 field added in the sample payload, scored as high confidence in the October 2026 fixture run.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Unit: fields added, removed, and type changed. Sample: 1 payment_intent.succeeded payload pair. Timeframe: October 2026. Method: flatten to dot notation, compare against baseline snapshot in .driftlock/snapshots, confidence from change count plus removal weight. Excluded: accounts that never sent a campaign equivalent, which is unobserved webhook event types with no baseline. Author: Nalin Dalal for DriftLock.
                    </p>
                </div>
                <div id="test-suite-baseline" className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                    <p className="text-sm leading-5 text-[var(--color-ink)]/80">
                        DriftLock maintained 279 passing tests covering scan, sandbox capture, shape diff, fix generation, and PR creation in October 2026.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-4 text-[var(--color-muted)]">
                        Unit: tests passing. Sample: full monorepo suite in packages/tests. Timeframe: October 2026. Method: bun test across unit, integration, and end to end suites. Excluded: manual QA and production customer repos, of which there are none yet in beta. Author: Nalin Dalal for DriftLock.
                    </p>
                </div>
            </div>

            <h2 id="method" className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">
                Method
            </h2>
            <div className="mt-4 space-y-2 text-sm leading-5 text-[var(--color-ink)]/80">
                <p className="max-w-[65ch]">
                    Industry figures include the source link, the publication context, and the period measured. DriftLock does not restate a number without its unit, sample, and timeframe.
                </p>
                <p className="max-w-[65ch]">
                    DriftLock findings use product records that already exist: the sample fixture, the CLI extractor, the sandbox runner, and the diff module. Underlying code and calculations are saved in the public repo at github.com/nerdev-co/DriftLock. No customer data is used because DriftLock is in beta with no production customer measurements to report.
                </p>
                <p className="max-w-[65ch]">
                    Findings are published as selectable text. Charts on this page are supporting visuals only. Each research section has a direct link, for example #fixture-scan-coverage, when the CMS supports anchors.
                </p>
            </div>

            <h2 id="changelog" className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">
                Review log
            </h2>
            <div className="mt-4 overflow-x-auto border border-[var(--color-line-strong)]">
                <table className="w-full border-collapse font-mono text-xs">
                    <tbody className="divide-y divide-[var(--color-line)]">
                        <tr>
                            <th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">October 2026</th>
                            <td className="px-3 py-2 text-[var(--color-ink)]/80">Initial publication. 3 industry figures with source links. 3 fixture findings with method, sample, and timeframe.</td>
                        </tr>
                        <tr>
                            <th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Next review</th>
                            <td className="px-3 py-2 text-[var(--color-ink)]/80">January 2027. Replace outdated figures, check source links, record changes here.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/about" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">
                    Back to About DriftLock
                </Link>
                <Link to="/install" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">
                    Install
                </Link>
                <Link to="/security" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">
                    Security
                </Link>
            </div>
        </div>
    );
}
