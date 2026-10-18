# 30-Second Pitch — DriftLock (for YC App / Paul Hartness / Marketing)

## Core Message (Marketing + Founder Skills)

> **DriftLock** makes APIs self-maintaining. When a vendor ships a breaking change or a new feature, Driftlock scans your codebase, identifies affected usages, and opens a PR with a suggested fix. AI-assisted fixes available via AI_PROVIDER; deterministic by default.

**Why now:** Agentic coding tools normalized giving external tools write-adjacent access to codebases. Dependabot/Renovate proved bots opening PRs works. The gap: nobody handles the layer above — the actual API contract between your code and a vendor's live service.

**The problem:** API vendors ship breaking changes with little warning. Changelogs don't get read. The cost lands entirely on the consumer — production outages, silent bugs, hours of debugging. I learned it firsthand: Prisma 7 broke my Next.js app right before interviews, and the "fix" was hunting every call site by hand. YC's "Self-Maintaining APIs" RFS describes the same pattern at larger scale — its author traces 30% of downtime to unnoticed external API changes from his AWS tenure.

**The unfair advantage:** Two things:

1. I lived the consumer pain — Prisma 7 nearly blew up my app before interviews — and validated the pattern against YC's "Self-Maintaining APIs" RFS, which reports the same breakage across 50+ vendors plus 30% AWS downtime from unnoticed API changes.
2. The core technical insight: we don't need vendors to publish specs or cooperate at all. We infer the API contract from the customer's own code and sandbox test runs, then diff that inferred contract over time. This means we can start working with any vendor, immediately, with zero coordination. It also means we never hit the "vendor won't publish a spec" wall.

**YC relevance:** I'm applying to YC W26/S26. The gap this fills — API contract enforcement between code and live services — is exactly the kind of B2B developer tool YC funds. YC's own RFS cites 30% downtime from unnoticed external API changes at AWS, and nobody's built the layer above Dependabot/Renovate yet.

**The ask:** I'm not looking for a co-founder or a favor. I'm looking for early customers and for people who can refer Stripe subscription businesses to me. If you know any SaaS running subscriptions on Stripe, point them my way — that's a real gift and costs you nothing.

## Variations

### For Paul Hartness (Research Call)

> "I'm researching how teams get hurt when a vendor changes an API under them. Not selling anything, I just want to hear how it actually went for you." Then shut up and let him talk. Ask: "What actually broke? How did you find out? How long between change and discovery? What did the fix cost? Did you check changelogs?"

### For YC Application

> "DriftLock makes APIs self-maintaining. When vendors ship breaking changes, Driftlock scans codebases, identifies affected usages, and opens PRs with fixes. AI-assisted fixes available via AI_PROVIDER; deterministic by default. We don't need vendor cooperation — we infer the API contract from code and sandbox test runs. I hit this when Prisma 7 broke my app; YC's RFS reports the same pattern at scale (30% AWS downtime from unnoticed API changes). Target: TypeScript/Node teams with Stripe test-mode integrations."

### For General Marketing

> "DriftLock is a self-maintaining API system that detects vendor contract drift and auto-generates fix PRs. We capture webhooks, detect schema changes, scan code for affected files, and open GitHub PRs. No vendor cooperation needed. First product: Stripe integration. Trying YC W26/S26. Looking for early customers who run Stripe subscriptions."

## Key Principles from Skillset

- **Product Messaging** (ui/product-messaging): Landing page content hierarchy, hero/value prop/section copy — each section should communicate one thing clearly
- **Copywriting** (business/copywriting): Landing page copy, headlines, CTAs — focus on benefits, not features
- **Startup Founder** (business/startup-founder): Setting up company, legal structure, MVP, funding, pricing strategy
- **Customer Research** (business/customer-research): Interviews, surveys, persona generation, JTBD (Jobs to be Done)
- **Marketing Psychology** (business/marketing-psychology): Mental models, persuasion, buyer behavior
- **Freelancing** (business/freelancing): Studio pitch, client proposals, quotations, invoices, contracts
- **Launch** (business/launch): ORB framework, five-phase approach, Product Hunt launch

## 30-Second Pitch Structure

1. **Hook (5 sec):** "I'm building DriftLock — makes APIs self-maintaining."
2. **Problem (10 sec):** "API vendors ship breaking changes with little warning. Cost lands on consumer. Prisma 7 broke my app before interviews — and YC's RFS says 30% of cloud downtime is unnoticed API changes."
3. **Solution (10 sec):** "Driftlock scans your codebase, identifies affected usages, and can open a PR with a suggested fix. AI-assisted fixes available via AI_PROVIDER; deterministic by default. We don't need vendor cooperation — we infer from your code and sandbox runs."
4. **Differentiation (5 sec):** "We don't need vendors to publish specs. We infer the API contract from your own code. That's the gap nobody's filled yet."
5. **Ask/Close (5 sec):** "I'm not looking for a co-founder. I'm looking for early customers who run Stripe subscriptions. If you know any SaaS running Stripe, point them my way — that's the real gift."
