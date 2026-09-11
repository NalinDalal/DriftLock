# Driftlock — MVP Doc

## One-liner
Your vendor changes something. Your code breaks silently. You find out at 2am.

Driftlock notices the change before you do, opens a PR with the fix, and you review and merge. No vendor cooperation needed.

## The problem

Stripe renames a field. Twilio deprecates an endpoint. Shopify changes a response type. You don't find out until production breaks.

- Changelogs don't get read. Docs drift from reality.
- The cost lands on the *consumer*, not the vendor.
- 30%+ of downtime at a major cloud provider was traced to unnoticed external API changes.

## What makes it hard

- **Knowing what actually changed.** Not "Stripe updated" — "field X was renamed to Y in this endpoint."
- **Knowing who it affects.** Only repos that call that specific endpoint with that specific field.
- **Suggesting the right fix.** Not "something changed" — "replace `charge.amount` with `charge.value` on line 42."

## Why now

Agentic coding tools (Claude Code, Devin, CodeRabbit, Greptile) have normalized giving an external tool write-adjacent access to a codebase. The trust curve has been crossed. We're applying the same trust model to a new trigger source: third-party API drift.

## Who pays

**Consumers/integrators of third-party APIs** — engineering teams who depend on external services and bear the cost when those services change. Not the API vendors themselves. This avoids needing any vendor cooperation, spec publication, or buy-in.

## The core loop

1. **Install** — GitHub App, repo access only (same footprint as CodeRabbit/Renovate/Dependabot).
2. **Discover usage** — static analysis of the codebase to find every call site touching a tracked third-party API (endpoints, params sent, fields read from responses).
3. **Find real signal, not mocks** — identify which tests actually hit a live sandbox/test-mode endpoint vs. tests that mock the API call. Only sandbox-hitting tests produce real, checkable data.
4. **Snapshot the spec** — run the sandbox-hitting tests (one command), capture actual request/response shapes, store as the current "inferred spec" for that call site. No vendor-published spec required.
5. **Re-check on a schedule** — re-run the same command periodically, capture the new response shape.
6. **Diff** — compare new snapshot against the last one. A shape change = drift.
7. **Suggest, don't apply** — on drift, open a PR from a fresh branch with a proposed fix. Human reviews and merges. Branch is deleted immediately after merge (CodeRabbit-style hygiene).
8. **Report coverage** — separately, tell the customer which of their API call sites are: (a) monitored (hit by a real sandbox test), (b) tested but blind (test exists but mocks the call — looks covered, isn't), (c) untested (no visibility at all).

## Explicit scope boundaries for v1

- **Suggest-only.** No auto-merge, no auto-apply, from day 1. Trust is earned, not assumed.
- **No vendor cooperation needed or expected.** We never ask a vendor to publish anything.
- **Coverage = whatever the customer's tests already safely exercise.** We do not discover unused endpoints or "features you're not using yet" — that's changelog/docs crawling, out of scope for v1.
- **No passive production traffic capture.** Too heavy an ask for an early install. Static analysis + scheduled sandbox test runs only.
- **Non-idempotent endpoints need explicit handling.** Anything with real side effects (charges, emails sent, etc.) is only safe to re-check if it's already hitting a true sandbox/test-mode credential in the customer's existing tests — never re-run against production.

## First target vendor

**Stripe** — mature test mode, huge installed base, predictable API versioning, plenty of design partners.

## Target user (v1 design partners)

Small-to-mid engineering teams with:
- An existing CI test suite that hits Stripe's test mode (not fully mocked).
- At least one prior incident/pain point from an unnoticed Stripe change.

## Success criteria for MVP

- Correctly detect at least one real historical Stripe breaking change or field deprecation, retroactively, against a real design partner's test history.
- Produce a coverage report a design partner says is accurate (matches their own sense of what's tested vs. mocked).
- Get one design partner to accept and merge a suggested-fix PR.
- False positive rate low enough that a design partner doesn't disable the bot in week one.

## Known hard problems (don't hand-wave these in the pitch)

- **Mocked vs. sandbox tests look identical from the outside** unless you actually trace whether the test made a network call. Detecting this reliably is core infra, not a nice-to-have.
- **Coverage is a hard ceiling, not a soft one.** If it's not tested against a real sandbox, it's invisible. Say this plainly to customers.
- **New-feature discovery is a different product.** Resist scope creep here for v1.

## Out of scope for v1

- Auto-merge / auto-apply.
- Multi-vendor support (start with one vendor, prove the loop, then generalize).
- Passive traffic monitoring / proxying.
- Discovering unused API surface / new features.
