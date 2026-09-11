# Driftlock — YC Application Draft

Based on the W26/S26 application format. Draft answers below — refine the voice to match how you actually talk.

---

## 1. What does your company do?

Driftlock watches the third-party APIs your codebase depends on, catches when a vendor changes something underneath you, and opens a suggested-fix PR — without ever needing the vendor's cooperation.

Think Dependabot, but for API contracts instead of package versions.

## 2. What is the problem you are solving?

API vendors ship breaking changes with little warning. Useful features launch quietly. Changelogs don't get read. The cost lands entirely on the consumer — production outages, silent bugs, hours of debugging.

I worked at AWS. Over 30% of our service downtime was traced to unnoticed external API and package changes. Since then I've worked with 50+ API vendors, mostly early-stage startups. The pattern is identical everywhere: communication is broken, and the consumer eats the cost.

This made sense before agentic coding tools existed. Now it doesn't.

## 3. Who are your users?

Engineering teams at small-to-mid companies who depend on external APIs (Stripe, Twilio, Shopify, etc.) and have been burned by unnoticed changes. Specifically: the person on the team who gets paged at 2am because Stripe changed a response field and nobody noticed.

For our MVP, we're targeting TypeScript/Node teams with existing Stripe test-mode integrations. Stripe because their test mode is mature, their installed base is massive, and plenty of teams already have sandbox-hit testing.

## 4. How do you know people want this?

The problem is well-documented: Dependabot and Renovate proved that automated PR-based maintenance bots work at scale. CodeRabbit proved developers will give a bot PR-write access if it's useful. Agentic coding tools (Claude Code, Devin, Greptile) have normalized codebase access for external tools entirely.

The gap is that these tools handle dependency versions and code review, but nobody handles the layer above: the actual API contract between your code and a vendor's live service. That's the unsolved problem.

I've had 50+ conversations with API vendors and their consumers. Every consumer has a story about downtime caused by an unnoticed API change. Every vendor knows their changelogs don't get read. The pain is real and acknowledged on both sides.

## 5. What is your unfair advantage?

Two things:

First, I've been on both sides. I worked at AWS where I saw the provider side of API communication failures, and I've worked with 50+ API vendors as an integrator where I experienced the consumer side. I know the problem from both angles.

Second, the core technical insight: we don't need vendors to publish specs or cooperate at all. We infer the API contract from the customer's own code and sandbox test runs, then diff that inferred contract over time. This means we can start working with any vendor, immediately, with zero coordination. It also means we never hit the "vendor won't publish a spec" wall that kills most API monitoring tools.

## 6. Why now?

Three things changed in the last two years:

1. Agentic coding tools normalized giving external tools write-adjacent access to codebases. Two years ago, "let a bot open PRs in your repo" was unthinkable. Now it's standard (Dependabot, Renovate, CodeRabbit all do this).
2. The number of API dependencies per codebase has exploded. Teams integrate with 10-20 external services. Each one is a potential drift surface.
3. AI coding tools are generating more code that calls external APIs. More generated code = more integration surface = more drift risk.

The infrastructure for automated code changes exists. The trust curve has been crossed. What's missing is the application layer connecting API drift to customer codebases.

## 7. Where do you see the company in 5 years?

Driftlock becomes the default layer between API providers and their consumers — the contract enforcement layer that ensures when a vendor changes something, affected consumers know immediately and have a fix ready.

We start with Stripe, prove the loop, then expand to every major API vendor. Over time, we build the data moat: which vendors drift most, which changes actually break things, which patterns cause the most downtime. That data becomes the industry's reference for API stability.

Long-term, we're the reason "API broke and nobody noticed" stops being a category of production incident.

## 8. How will you make money?

Per-repo pricing, monthly. Think Dependabot's model — flat rate per repo, tiered by number of tracked API integrations.

- **Free tier:** 1 repo, 1 vendor tracked (Stripe). Gets people in the door.
- **Pro:** $29/mo per repo, unlimited vendors. For small teams.
- **Team:** $99/mo per repo, priority support, coverage reports, audit logs. For companies with compliance needs.

API vendors are not the customer. The consumer is. This avoids the enterprise BD sales cycle and lets us sell through PLG — install the GitHub App, see your coverage report, upgrade for full monitoring.

## 9. Tell us about a time you did something impressive.

[Fill in with your actual story — AWS experience, the 50-vendor work, or another strong example. This is where your personal credibility lands.]

## 10. Anything else we should know?

The hardest technical problem we've solved in our thinking: distinguishing mocked tests from sandbox-hitting tests. Most teams have test suites that look comprehensive but actually mock the API layer. Those tests are invisible to us — they produce no real signal. Our approach: we trace whether a test actually makes a network call, classify tests as "real" or "mocked," and report coverage honestly. This means we tell customers "these 3 call sites are monitored, these 7 are not" instead of pretending everything is covered.

We're also upfront about the coverage ceiling: if you don't test it against a real sandbox, we can't catch drift on it. No tool can. We'd rather be honest about our limits than ship false confidence.

---

## Notes for Nalin

- **Question 9** needs your real story. The AWS stat is strong but it's an observation, not a "time you did something impressive." What's the thing you built, shipped, or fixed that proves you can execute?
- **Tone:** The draft is direct and specific. YC partners hate fluff. Keep it that way.
- **Length:** These are short answers. Don't expand them. Each one should be scannable in 30 seconds.
- **Review before submitting:** Read each answer out loud. If it sounds like a pitch deck, rewrite it to sound like how you'd explain it to a smart friend over coffee.
