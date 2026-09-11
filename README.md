# Driftlock

**Dependabot for API changes.** A GitHub App that watches the third-party APIs your codebase depends on, catches when a vendor changes something underneath you, and opens a suggested-fix PR — without ever needing the vendor's cooperation.

---

## Problem

API vendors ship breaking changes with little warning. Useful new features launch quietly. Changelogs don't get read. Docs drift from reality. The cost lands on the *consumer* of the API — outages, silent bugs, wasted debugging time.

Precedent: 30%+ of downtime at a major cloud provider traced to unnoticed external API/package changes.

## Why now

Agentic coding tools (Claude Code, Devin, CodeRabbit, Greptile) have normalized giving an external tool write-adjacent access to a codebase. The trust curve that used to block this has already been crossed by code-review bots. We're applying the same trust model to a new trigger source: third-party API drift.

## How it works

1. **Install** — GitHub App, repo access only (same footprint as CodeRabbit/Renovate/Dependabot).
2. **Discover usage** — static analysis finds every call site touching a tracked third-party API.
3. **Find real signal** — identify which tests hit a live sandbox/test-mode endpoint vs. mocked tests.
4. **Snapshot the spec** — run sandbox-hitting tests, capture actual request/response shapes.
5. **Re-check on a schedule** — re-run periodically, capture the new response shape.
6. **Diff** — compare new snapshot against the last one. Shape change = drift.
7. **Suggest, don't apply** — on drift, open a PR from a fresh branch with a proposed fix. Human reviews and merges. Branch deleted after merge (CodeRabbit-style hygiene).
8. **Report coverage** — tell the customer which call sites are monitored, tested-but-blind, or untested.

## First target vendor

**Stripe** — mature test mode, huge installed base, predictable API versioning, plenty of design partners.

## Core principles

- **Suggest-only, always.** No auto-merge from day one.
- **No vendor cooperation needed.** We infer specs from the customer's own usage.
- **Coverage = whatever tests already safely exercise.** We do not discover unused endpoints or new features in v1.
- **No passive traffic capture.** Too heavy an ask for an early install.

## Docs

| Doc | What it covers |
|-----|----------------|
| [Architecture](./docs/architecture.md) | System components, data model, known hard problems |
| [MVP scope](./docs/mvp.md) | Success criteria, target user, explicit scope boundaries |
| [References](./references/README.md) | Problem statement sources, video, market signals, related concepts |
| [YC RFS](https://www.ycombinator.com/rfs) | The request for startups that inspired this |

## Tech stack (planned)

- **GitHub App** — Octokit for webhook handling, PR creation, branch management.
- **Static analyzer** — tree-sitter or AST-based parsing for call site extraction (TypeScript/Node first).
- **Sandbox prober** — runs customer tests, captures HTTP payloads via a lightweight interceptor.
- **Drift detector** — schema diffing on captured request/response shapes.
- **PR generator** — templated PR body with diff summary and suggested fix.
