import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function SecurityPage() {
    useEffect(() => {
        document.title = "Security | DriftLock Trust Center";
    }, []);

    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
            {
                "@type": "Question",
                name: "Does DriftLock use customer code to train models?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "No. DriftLock does not use customer code to train, fine-tune, or improve models. Deterministic scan and diff run on an ephemeral clone with zero code sent to any LLM. When AI fixes are enabled, only the affected file snippet plus the shape diff is sent to the customer-chosen LLM provider for that single fix. It is not retained for training, not used for product development, and not human-reviewed for model improvement.",
                },
            },
            {
                "@type": "Question",
                name: "What is DriftLock code retention policy?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock does not retain full repositories. Clones are ephemeral under /tmp/driftlock-run-* and deleted after each run. Stored data is limited to file paths, line numbers, endpoint names, shape types such as amount: number, diff summaries, and PR metadata. Raw webhook values and secrets are not stored. Run logs are kept 7 days, snapshots and diffs 30 days, and all data is deleted on app uninstall or on request within 24 hours.",
                },
            },
            {
                "@type": "Question",
                name: "What GitHub permissions does DriftLock request?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "DriftLock requests read plus suggest-only access. Every change is a GitHub PR created via the Git Database API. Nothing is merged without explicit customer approval. Dry run via driftlock fix --dry-run previews drift before any write, and confidence thresholds can skip low-confidence PRs.",
                },
            },
            {
                "@type": "Question",
                name: "How is customer data encrypted?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "Data is encrypted with TLS 1.2 or higher in transit and AES-256-GCM at rest. GitHub tokens and AI keys are encrypted with SESSION_ENC_KEY. Production fails loudly when the key is missing instead of storing secrets in plaintext.",
                },
            },
            {
                "@type": "Question",
                name: "Which subprocessors handle customer code?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "GitHub for PR creation via the Git Database API, and the customer-chosen LLM provider for AI fixes: OpenAI, Anthropic, Gemini, or Cloudflare Workers AI. Default deterministic mode sends zero code to any LLM. Self-hosted CLI and webhook capture are available so code can stay in the customer VPC.",
                },
            },
            {
                "@type": "Question",
                name: "How do I request deletion of my data?",
                acceptedAnswer: {
                    "@type": "Answer",
                    text: "Email nalin@nerdev.in. All installations, repositories, call sites, snapshots, and webhook schemas for your account are deleted within 24 hours. Uninstalling the GitHub App triggers the same wipe. Security vulnerabilities should be reported to nalin@nerdev.in and not opened as public GitHub issues.",
                },
            },
        ],
    };

    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://driftlock.dev" },
            { "@type": "ListItem", position: 2, name: "Security", item: "https://driftlock.dev/security" },
        ],
    };

    return (
        <div className="mx-auto max-w-[880px]">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Security
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">TRUST CENTER · REV. 01</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Security</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                No training on your code. No code retained for product development. Nothing merged without you.
            </p>
            <p className="mt-3 max-w-[65ch] text-[14px] leading-6 text-[var(--color-muted)]">
                This page is the canonical reference for vendor reviews. For product questions see{" "}
                <Link to="/about" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    About
                </Link>
                . For access setup see{" "}
                <Link to="/install" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    Install
                </Link>
                .
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Training: No</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                DriftLock does not use customer code to train, fine tune, or improve models. No human review for model improvement without consent.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>Default deterministic mode sends zero code to any LLM.</li>
                <li>AI fix mode sends only the affected file snippet plus the shape diff to your chosen provider for that one fix.</li>
                <li>Snippets are not retained by us for training and not used for product development.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Retention: Minimal</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Full repositories are never retained. Clones are ephemeral under /tmp/driftlock-run-* and deleted after each run.
            </p>
            <div className="mt-4 overflow-x-auto border border-[var(--color-line-strong)]">
                <table className="w-full border-collapse font-mono text-xs">
                    <tbody className="divide-y divide-[var(--color-line)]">
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Stored</th><td className="px-3 py-2 text-[var(--color-ink)]/80">File paths, line numbers, endpoint names, shape types (amount: number), diff summaries, PR metadata</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Not stored</th><td className="px-3 py-2 text-[var(--color-ink)]/80">Full repo, raw webhook values, secrets in plaintext</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Run logs</th><td className="px-3 py-2 text-[var(--color-ink)]/80">7 days</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Snapshots and diffs</th><td className="px-3 py-2 text-[var(--color-ink)]/80">30 days</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">On uninstall or request</th><td className="px-3 py-2 text-[var(--color-ink)]/80">Full wipe within 24 hours</td></tr>
                    </tbody>
                </table>
            </div>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Access And Permissions</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>GitHub App requests read plus suggest-only access.</li>
                <li>Every change is a PR via the Git Database API. Nothing is merged without explicit approval.</li>
                <li>Preview with driftlock fix --dry-run. Confidence thresholds skip low-confidence PRs.</li>
                <li>No routine human access to customer code. Break-glass only, recorded in run logs (7-day retention).</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Encryption And Secrets</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-xs leading-5 text-[var(--color-ink)]/80">
                <li>TLS 1.2 or higher in transit. AES-256-GCM at rest.</li>
                <li>GitHub tokens and AI keys encrypted with SESSION_ENC_KEY. Prod fails loudly when the key is missing.</li>
                <li>Logs redact tokens and PII. Raw payloads are never logged.</li>
            </ul>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Subprocessors And DPA</h2>
            <div className="mt-4 overflow-x-auto border border-[var(--color-line-strong)]">
                <table className="w-full border-collapse font-mono text-xs">
                    <tbody className="divide-y divide-[var(--color-line)]">
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">GitHub</th><td className="px-3 py-2 text-[var(--color-ink)]/80">PR creation via Git Database API</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">LLM provider</th><td className="px-3 py-2 text-[var(--color-ink)]/80">Customer choice: OpenAI, Anthropic, Gemini, or Cloudflare Workers AI. Only for AI fixes.</td></tr>
                        <tr><th className="bg-[var(--color-paper)] px-3 py-2 text-left font-semibold tracking-wide text-[var(--color-ink)]">Self host</th><td className="px-3 py-2 text-[var(--color-ink)]/80">CLI plus webhook proxy can run in your VPC so code never leaves.</td></tr>
                    </tbody>
                </table>
            </div>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                DPA available on request: <a href="mailto:nalin@nerdev.in?subject=DPA%20request%20for%20DriftLock" className="underline underline-offset-2 hover:text-[var(--color-ink)]">nalin@nerdev.in</a>. No SOC 2 yet. Controls above are in place and an audit is planned after beta.
            </p>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Suspected breach: notified within 72 hours to the account contact. SSO/SAML, audit logs, residency pinning, and automated backups are not yet available. Ask and we will scope them.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Frequently Asked Questions</h2>
            <div className="mt-6 space-y-6">
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">DO YOU TRAIN ON MY CODE?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">No. Customer code is never used to train, fine tune, or improve models, and never used for product development without consent.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">DO YOU RETAIN MY CODE?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">No. Only file paths, shape types, diffs, and PR metadata are stored. Full clones are deleted after each run. Webhook capture stores flattened types, not payload values.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">CAN I DISABLE AI?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">Yes. Deterministic mode is the default and sends zero code to any LLM. AI fixes are opt-in per provider.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">HOW DO I REQUEST DELETION?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">Email nalin@nerdev.in. All data for your account is deleted within 24 hours. Uninstalling the GitHub App triggers the same wipe.</p>
                </div>
                <div>
                    <h3 className="font-mono text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">HOW DO I REPORT A VULNERABILITY?</h3>
                    <p className="mt-1 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">Email nalin@nerdev.in. Do not open a public GitHub issue for security vulnerabilities.</p>
                </div>
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/install" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Install</Link>
                <Link to="/about" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">About</Link>
                <a href="mailto:nalin@nerdev.in" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Contact security</a>
            </div>
        </div>
    );
}
