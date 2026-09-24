import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function AboutPage() {
    useEffect(() => {
        document.title = "About DriftLock | Self-maintaining APIs for Engineering Teams";
    }, []);

    const orgSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "DriftLock",
        url: "https://driftlock.dev",
        logo: "https://driftlock.dev/logo.png",
        description: "DriftLock is a self-maintaining API platform that detects vendor drift and opens a GitHub PR with the fix for engineering teams.",
        foundingDate: "2024",
        founder: {
            "@type": "Person",
            name: "Nalin Dalal",
            jobTitle: "Founder",
            sameAs: "https://www.linkedin.com/in/nalindalal",
        },
        address: {
            "@type": "PostalAddress",
            addressLocality: "Remote",
            addressCountry: "IN",
        },
        sameAs: ["https://github.com/nerdev-co/DriftLock", "https://discord.gg/driftlock", "https://x.com/driftlock"],
        contactPoint: {
            "@type": "ContactPoint",
            email: "nalin@nerdev.in",
            contactType: "sales",
        },
    };

    const softwareSchema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "DriftLock",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: "https://driftlock.dev",
        description: "DriftLock is a self-maintaining API platform that detects vendor drift and opens a GitHub PR with the fix for engineering teams.",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
    };

    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://driftlock.dev" },
            { "@type": "ListItem", position: 2, name: "About", item: "https://driftlock.dev/about" },
        ],
    };

    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
            {
                "@type": "Question",
                name: "What is DriftLock?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock is a self-maintaining API platform that detects vendor drift and opens a GitHub PR with the fix for engineering teams. It was founded in 2024 and is built for teams that use Stripe, Twilio, and other versioned APIs. DriftLock scans call sites, captures traffic shapes, diffs against a baseline, and creates a PR with a deterministic fix.",
                },
            },
            {
                "@type": "Question",
                name: "How much does DriftLock cost?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock is free in beta. The core flow is drift detection plus a GitHub PR. Teams install the GitHub App, select repos, and review PRs. Nothing is merged without approval. Pricing will be announced after beta.",
                },
            },
            {
                "@type": "Question",
                name: "How is DriftLock different from Renovate and Dependabot?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "Renovate and Dependabot bump the version in package.json. DriftLock migrates the code at the call site. For example, when Stripe renames source to payment_method, DriftLock finds every affected usage and opens a PR with the rename. Renovate does not touch call site code. DriftLock also supports inbound webhook drift via payload flattening and diffing.",
                },
            },
            {
                "@type": "Question",
                name: "Who founded DriftLock?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock was founded by Nalin Dalal in 2024 after a Prisma 7 breaking change nearly shipped to production before interviews. He is the founder and is reachable at nalin@nerdev.in. Background is engineering at AWS and building with agentic coding tools.",
                },
            },
            {
                "@type": "Question",
                name: "What does DriftLock do?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock does six things: outbound call site scanning, sandbox traffic capture, shape snapshot and diff, deterministic fix generation, GitHub PR creation via the Git Database API, and inbound webhook capture with flattening and diffing. Optional AI assist can be enabled via OpenAI, Anthropic, Gemini, or Cloudflare.",
                },
            },
            {
                "@type": "Question",
                name: "Do I have to merge every DriftLock PR?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "No. Every DriftLock change is a PR. Nothing is merged without you. DriftLock supports read, read-write, and suggest-only permissions, confidence thresholds, and dry-run via driftlock fix --dry-run so you can preview drift before creating a PR.",
                },
            },
        ],
    };

    return (
        <div className="mx-auto max-w-[880px]">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

            <nav className="mb-6 font-mono text-xs tracking-wide text-[#64748B]">
                <Link to="/" className="hover:text-[#0F172A] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[#CBD5E1]">/</span> About
            </nav>

            {/* Section 1: Entity Definition */}
            <h1 className="font-display text-[34px] leading-[0.95] tracking-[-0.03em] text-[#0F172A] sm:text-[42px]">About DriftLock</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[#334155]">
                DriftLock is a self-maintaining API platform that detects vendor drift and opens a GitHub PR with the fix for engineering teams.
            </p>
            <p className="mt-3 max-w-[65ch] text-[14px] leading-6 text-[#475569]">
                DriftLock scans your codebase for API call sites, captures vendor traffic to build shape snapshots, diffs new payloads against the baseline, and creates a PR with a deterministic fix. It supports both outbound drift for APIs you call and inbound drift for webhooks you receive. The first vendor is Stripe, with Twilio and Shopify on the roadmap.
            </p>
            <p className="mt-3 max-w-[65ch] text-[14px] leading-6 text-[#475569]">
                The product is built for teams that maintain Stripe integrations in TypeScript and JavaScript codebases and want to stay current without hand editing every call site.
            </p>

            {/* Section 2: Core Services */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">What DriftLock Does</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">OUTBOUND CALL SITE SCANNING</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">DriftLock scans TypeScript and JavaScript for vendor SDK calls and resolves client names to endpoints and HTTP methods.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: every affected usage is found without grep.</p>
                </div>
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">SANDBOX TRAFFIC CAPTURE</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">Tests run in a resource limited sandbox through a proxy that records request and response shapes.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: baseline snapshots reflect real vendor shapes, not mocks.</p>
                </div>
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">SHAPE DIFF AND CONFIDENCE</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">DriftLock diffs captured shapes against the baseline and scores confidence as high, medium, or low.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: the fix path is clear before code is changed.</p>
                </div>
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">DETERMINISTIC FIX GENERATION</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">Fixes apply renames, null checks, and type coercions. AI assist is optional via OpenAI, Anthropic, Gemini, or Cloudflare.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: a previewable diff with deterministic fallback.</p>
                </div>
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">GITHUB PR CREATION</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">DriftLock creates a branch and PR via the Git Database API with the fix applied to the affected files.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: review and merge in GitHub, nothing is applied directly.</p>
                </div>
                <div className="border-l-2 border-[#0F172A] pl-4">
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">INBOUND WEBHOOK DRIFT</h3>
                    <p className="mt-1 text-sm leading-5 text-[#334155]">Inbound payloads are flattened to dot notation, stored per endpoint and event type, and diffed for added and removed fields and type changes.</p>
                    <p className="mt-1 font-mono text-xs leading-4 text-[#64748B]">Outcome: handler drift is caught the same way as call site drift.</p>
                </div>
            </div>

            {/* Section 3: Differentiators */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">What Makes DriftLock Different</h2>
            <div className="mt-6 space-y-6">
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">MIGRATES CODE, NOT JUST VERSIONS</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Renovate and Dependabot bump the version in package.json. DriftLock updates the code at the call site.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">FINDS EVERY CALL SITE</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Static analysis via TypeScriptExtractor with vendor configs for Stripe finds every client resource method. No manual grep.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">VALIDATES AGAINST REAL TRAFFIC</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Sandbox capture classifies mocked versus real tests. Coverage alone cannot catch drift when responses are mocked.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">WORKS FOR TWO SURFACES</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Outbound drift for APIs you call and inbound drift for webhooks you receive share one pipeline and one PR model.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">NOTHING MERGED WITHOUT YOU</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Every change is a PR with confidence, diff summary, and permission modes. Dry run via driftlock fix --dry-run is available before any write.</p>
                </div>
            </div>

            {/* Section 4: Who Uses */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">Who Uses DriftLock</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[#334155]">
                <li>Engineering teams at seed to growth stage startups that maintain Stripe integrations in TypeScript or JavaScript</li>
                <li>Platform teams at 50 to 800 employee companies that own checkout, billing, and webhook handlers</li>
                <li>Marketplace and fintech teams that receive high volume Stripe, Twilio, or Shopify webhooks</li>
                <li>Teams stuck on an old vendor version because migration was deferred</li>
            </ul>
            <p className="mt-4 font-mono text-xs leading-4 text-[#64748B]">Industries served: fintech, marketplaces, B2B SaaS, developer tools. The CLI ships as @driftlock/cli on npm. Source is at github.com/nerdev-co/DriftLock.</p>

            {/* Section 5: Team & Origin */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">The Team Behind DriftLock</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[#334155]">DriftLock was founded by Nalin Dalal in 2024.</p>
            <p className="mt-2 max-w-[65ch] text-sm leading-5 text-[#334155]">
                The origin was a Prisma 7 breaking change that nearly shipped to production before interviews. Dependabot told him a dependency was out of date but did not touch the code. He built DriftLock to make APIs self-maintaining.
            </p>
            <p className="mt-2 max-w-[65ch] text-sm leading-5 text-[#334155]">
                DriftLock is built by Nalin and contributors at github.com/nerdev-co/DriftLock. Headquarters is remote with an India base. Primary contact is nalin@nerdev.in. Community is at discord.gg/driftlock.
            </p>
            <p className="mt-3 font-mono text-xs">
                <a href="https://www.linkedin.com/in/nalindalal" target="_blank" rel="noreferrer" className="underline decoration-[#CBD5E1] underline-offset-2 hover:decoration-[#0F172A] hover:text-[#0F172A] text-[#0F172A]">
                    Nalin Dalal on LinkedIn
                </a>
            </p>

            {/* Section 6: How it Works */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">How DriftLock Works</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 font-mono text-xs leading-5">
                <div className="border border-[#E6E7EE] bg-white p-4">
                    <p className="font-semibold tracking-[0.08em] text-[#0F172A]">OUTBOUND</p>
                    <p className="mt-2 text-[#334155]">Install GitHub App, select repos, DriftLock scans. Run driftlock fix with sandbox capture. First run baselines snapshots to .driftlock/snapshots. Later runs diff and create a PR.</p>
                </div>
                <div className="border border-[#E6E7EE] bg-white p-4">
                    <p className="font-semibold tracking-[0.08em] text-[#0F172A]">INBOUND</p>
                    <p className="mt-2 text-[#334155]">Forward webhooks to POST /webhooks/capture/stripe. DriftLock flattens payloads, stores per endpoint and event type, diffs, scans for affected files, and creates a PR.</p>
                </div>
            </div>
            <p className="mt-4 max-w-[65ch] text-sm leading-5 text-[#334155]">Communication is via GitHub PRs. Support is via Discord and GitHub issues. Onboarding is GitHub OAuth plus repo selection at /install. Turnaround is the PR creation after drift is detected.</p>

            {/* Section 7: Key Facts */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">Key Facts</h2>
            <div className="mt-4 overflow-x-auto border border-[#0F172A]">
                <table className="w-full border-collapse font-mono text-xs">
                    <tbody className="divide-y divide-[#E6E7EE]">
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Company Name</th><td className="px-3 py-2 text-[#334155]">DriftLock</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Type</th><td className="px-3 py-2 text-[#334155]">Self-maintaining API platform for drift detection and fix PRs</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Founded</th><td className="px-3 py-2 text-[#334155]">2024</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Founder</th><td className="px-3 py-2 text-[#334155]">Nalin Dalal</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Headquarters</th><td className="px-3 py-2 text-[#334155]">Remote, India</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Website</th><td className="px-3 py-2 text-[#334155]">https://driftlock.dev</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Core Offering</th><td className="px-3 py-2 text-[#334155]">Detects vendor drift from traffic shapes and opens a GitHub PR with the fix</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Pricing</th><td className="px-3 py-2 text-[#334155]">Free in beta</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Contract Terms</th><td className="px-3 py-2 text-[#334155]">No merge without approval, dry-run available, permission modes read, read-write, suggest-only</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Services</th><td className="px-3 py-2 text-[#334155]">Outbound scanning, sandbox capture, shape diff, deterministic fix, PR creation, inbound webhook capture</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Communication</th><td className="px-3 py-2 text-[#334155]">GitHub PRs, Discord, GitHub issues, email nalin@nerdev.in</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Notable Vendors</th><td className="px-3 py-2 text-[#334155]">Stripe first, Twilio and Shopify on roadmap</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Competitors</th><td className="px-3 py-2 text-[#334155]">Renovate, Dependabot</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Package</th><td className="px-3 py-2 text-[#334155]">@driftlock/cli on npm</td></tr>
                        <tr><th className="bg-[#FFFBF5] px-3 py-2 text-left font-semibold tracking-wide text-[#0F172A]">Social</th><td className="px-3 py-2 text-[#334155]">github.com/nerdev-co/DriftLock, discord.gg/driftlock</td></tr>
                    </tbody>
                </table>
            </div>

            {/* Section 8: FAQ */}
            <h2 className="mt-12 border-t border-[#0F172A] pt-6 font-display text-[22px] tracking-[-0.02em] text-[#0F172A]">Frequently Asked Questions</h2>
            <div className="mt-6 space-y-6">
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">WHAT IS DRIFTLOCK?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">DriftLock is a self-maintaining API platform that detects vendor drift and opens a GitHub PR with the fix for engineering teams. It was founded in 2024 and is built for teams that use Stripe, Twilio, and other versioned APIs. DriftLock scans call sites, captures traffic shapes, diffs against a baseline, and creates a PR with a deterministic fix.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">HOW MUCH DOES DRIFTLOCK COST?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">DriftLock is free in beta. The core flow is drift detection plus a GitHub PR. Teams install the GitHub App, select repos, and review PRs. Nothing is merged without approval.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">HOW IS DRIFTLOCK DIFFERENT FROM RENOVATE AND DEPENDABOT?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">Renovate and Dependabot bump the version in package.json. DriftLock migrates the code at the call site. When Stripe renames source to payment_method, DriftLock finds every affected usage and opens a PR with the rename. Renovate does not touch call site code.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">WHO FOUNDED DRIFTLOCK?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">DriftLock was founded by Nalin Dalal in 2024 after a Prisma 7 breaking change nearly shipped to production before interviews. He is the founder and is reachable at nalin@nerdev.in.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">WHAT DOES DRIFTLOCK DO?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">DriftLock does outbound call site scanning, sandbox traffic capture, shape diff and confidence, deterministic fix generation, GitHub PR creation, and inbound webhook capture with flattening and diffing. Optional AI assist can be enabled via OpenAI, Anthropic, Gemini, or Cloudflare.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[#0F172A]">DO I HAVE TO MERGE EVERY DRIFTLOCK PR?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[#334155]">No. Every DriftLock change is a PR. Nothing is merged without you. DriftLock supports read, read-write, and suggest-only permissions, confidence thresholds, and dry-run via driftlock fix --dry-run.</p>
                </div>
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[#E6E7EE] pt-6">
                <Link to="/" className="border border-[#0F172A] bg-[#0F172A] px-4 py-2 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B]">Back to Home</Link>
                <Link to="/install" className="border border-[#E6E7EE] bg-white px-4 py-2 font-mono text-xs tracking-wide text-[#0F172A] hover:bg-[#FFFBF5]">Install</Link>
                <a href="https://github.com/nerdev-co/DriftLock" target="_blank" rel="noreferrer" className="border border-[#E6E7EE] bg-white px-4 py-2 font-mono text-xs tracking-wide text-[#0F172A] hover:bg-[#FFFBF5]">GitHub</a>
            </div>
        </div>
    );
}
