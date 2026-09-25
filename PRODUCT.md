# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: engineering teams (backend/fullstack) maintaining Stripe (first vendor, Twilio/Shopify next) integrations in TypeScript/JavaScript codebases. Situation: dependency upgrades and webhook payload changes ship without warning, migration guides are missed, and 30 percent of downtime traces to unnoticed external API changes. Job: decide if vendor drift affects their code and apply the fix without hunting call sites by hand.

Secondary audiences: startup founders deciding to install versus postponing upgrades, junior devs evaluating what changes in their code.

## Product Purpose

DriftLock is Dependabot but for APIs. It scans codebase for API call sites, captures vendor traffic to build shape snapshots, detects breaking changes between snapshots, and opens a GitHub PR with the suggested fix. Success is staying current on vendor APIs with minutes of review, not weeks of manual migration, and with nothing merged without explicit approval.

## Positioning

The application layer connecting API providers to customer codebases. Not a version bumper. Renovate and Dependabot update package.json, DriftLock updates call site code. The mechanism is AST scan plus sandbox traffic capture plus semantic shape diff plus deterministic fix plus PR via Git Database API. A neighbor cannot copy this truthfully without solving codebase access that agentic tools proved valuable and without building the drift detection loop.

## Operating Context

Workflows: driftlock analyze ./src, driftlock fix --dry-run, driftlock fix --repo owner/repo, inbound webhook capture at /webhooks/capture/stripe with flatten to dot notation and forward to handler. Tools: TypeScriptExtractor, SandboxRunner with proxy, diffShapes, FixPRRunner, GitHub App install flow. Environments: GitHub repos, .driftlock/snapshots baseline, Docker sandbox for capture. Materials: vendor SDKs, OpenAPI, HAR captures, PR diffs.

## Capabilities and Constraints

Confirmed capabilities: static scan for stripe.*.* call sites with endpoint and HTTP method inference, multi vendor pattern, sandbox runner with proxy flag handling, shape infer and diff with confidence high/medium/low, fix work kinds field_rename and null_check, PR generation with branch driftlock fix and body. Constraints: Stripe first vendor, AI fix optional via openai/anthropic/gemini/cloudflare, confidence threshold, read and suggest only permissions, no merge without review. Undecided: pricing, multi tenant isolation beyond row, self host versus managed webhook capture.

## Brand Commitments

Name DriftLock, lock mark, ink and neutral system currently at #0a0a0f / #f8f8f9 / zinc / emerald / amber with Instrument Serif display plus Geist plus JetBrains Mono. Dependabot but for APIs is core line. Voice is plain and technical, outcomes over decoration. Impeccable house rules apply: no purple slop, bought not generated, Tailwind strictly, no em dashes, restraint.

## Evidence on Hand

README problem statement and YC pitch, CLI at apps/cli/index.ts, parser at packages/parser/index.ts, sandbox at packages/sandbox, diff at packages/diff, sample fixture packages/tests/fixtures/sample-project/src/payments.ts with stripe.charges.create source tok_visa and refunds.create, Playwright style landing at apps/fe/src/routes/index.tsx with TryPlayground, 279 tests passing, no fabricated customers or benchmarks.

## Product Principles

One hypothesis per feature, instrument from day one.
Complexity matches problem, monolith first, buy auth and analytics.
Whitespace separates, one surprising detail beats decoration everywhere.
Every fix is a PR, nothing merged without you.

## Accessibility & Inclusion

WCAG AA target, keyboard navigable, reduced motion respects prefers-reduced-motion.
