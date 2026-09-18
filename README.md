<div align="center">

<img src="./assets/logo-icon.svg" width="100" />

# DriftLock

**Self-maintaining APIs.**

API providers announce changes. DriftLock applies them to your codebase.

DriftLock scans your codebase for API call sites, captures vendor traffic to build shape snapshots, detects breaking changes between snapshots, and opens a PR with a suggested fix. AI-powered fix generation is on the roadmap.

[Website](https://driftlock.dev) · [Discord](https://discord.gg/driftlock) · [Issues](https://github.com/nerdev-co/DriftLock/issues)

[![npm](https://img.shields.io/npm/v/@driftlock/cli?color=blue)](https://www.npmjs.com/package/@driftlock/cli)
[![GitHub stars](https://img.shields.io/github/stars/nerdev-co/DriftLock)](https://github.com/nerdev-co/DriftLock/stargazers)
[![Build](https://img.shields.io/github/actions/workflow/status/nerdev-co/DriftLock/ci.yml?branch=main)](https://github.com/nerdev-co/DriftLock/actions)
[![License](https://img.shields.io/github/license/nerdev-co/DriftLock)](./LICENSE)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/nerdev-co/DriftLock?utm_source=oss&utm_medium=github&utm_campaign=nerdev-co%2FDriftLock&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

</div>

---

```mermaid
flowchart LR
    A[Vendor API Changes] --> B[DriftLock]
    B --> C[Find Affected Code]
    C --> D[Understand API Diff]
    D --> E[Generate Fix]
    E --> F[Pull Request]
    F --> G[You Review & Merge]
```

---

## [The problem statement](https://www.ycombinator.com/rfs)

The original pitch that started DriftLock, verbatim:

> Over the past year, I've worked with over 50 API vendors, mostly early-stage
> startups. One pattern is consistent: API communication is broken.
>
> Breaking changes ship with little warning. Useful features quietly launch and
> go unnoticed. Changelogs don't get read. Heck, when I worked at AWS, over 30%
> of our service downtime was due to external api/package changes going
> unnoticed. This friction made sense before agentic coding tools existed.
> However, now it doesn't.
>
> Agentic coding tools like Claude Code, Devin, Greptile, etc prove that
> developers and enterprises are willing to give codebase access to external
> tools, provided they're valuable. Two years ago, this was unthinkable. Now
> it's standard practice.
>
> The infrastructure for automated code changes exists. What's missing is the
> application layer connecting API providers to their customers' codebases. API
> providers shouldn't just announce changes; they should apply them.
>
> When Stripe ships a breaking change or a new feature, an agent should scan
> customer codebases, identify affected usages, and open a PR with the fix.
>
> This could work as per-provider agents. "Install Stripe's update agent", or
> as a neutral third-party service tracking changes across vendors, like
> Dependabot but for APIs. If you're working on this, consider applying to YC.

That last line is the entire product in four words: **"Dependabot, but for
APIs"**. The sentence before it is the litmus test we use against every
feature in this repo:

> *An agent scans customer codebases, identifies affected usages, and opens a
> PR with the fix.*

If a proposed feature does not move DriftLock toward that, it's plumbing or
scope creep. This section is the guard against drift.

---

## What DriftLock is

DriftLock is the application layer connecting API providers to their customers'
codebases. It's a neutral third-party service tracking changes across vendors.
The codebase access is a solved problem (agentic tools proved it); the
**application layer** is what's missing.

The cost of a vendor change always lands on the consumer. DriftLock moves it
back to automation: it scans your codebase for API call sites, watches for
vendor changes, detects how they affect your usages, and opens a PR with the
fix. AI-powered fix generation is on the roadmap.

---

## Personal story

I built DriftLock because I got bitten by an API break myself.

I had a Next.js app running on Prisma 6. Then Prisma 7 shipped, and the app broke. I didn't catch it until right before my interviews, if I hadn't noticed in time, it would have blown up in production at the worst possible moment.

That's when it clicked: dependency upgrades don't just bump a version number. They change the actual code you write. Changelogs are easy to miss. Migration guides are easy to skip. Semver doesn't save you when the API surface changes.

What I needed wasn't another tool that tells me a dependency is out of date. I needed something that would automatically update the affected code in my codebase — something that makes my APIs self-maintaining.

That's DriftLock.

---

## How it works

```mermaid
flowchart LR
    A[Install GitHub App] --> B[Discover Call Sites]
    B --> C[Classify Tests]
    C --> D[Probe API]
    D --> E[Diff API Shapes]
    E --> F[Generate Fix PR]
    F --> G[Review & Merge]
```

| Step         | What happens                                                   |
| ------------ | -------------------------------------------------------------- |
| **Scan**     | Static analysis finds every API call in your codebase          |
| **Classify** | Identifies which tests hit real sandbox vs. mocked             |
| **Probe**    | Runs your tests, captures actual request/response shapes       |
| **Diff**     | Compares captured shapes against the baseline snapshot         |
| **Fix**      | Generates fix suggestions; PR creation available with `--repo` |
| **Report**   | Shows which call sites are monitored, blind, or untested       |

AI-powered fix generation is on the roadmap. The current implementation produces fix suggestions and supports PR creation.

---

## Quick start

```bash
# Install
bun add -g @driftlock/cli

# Analyze your codebase
driftlock analyze ./src

# Run in sandbox
driftlock test ./repo

# Detect drift
driftlock fix ./repo --dry-run

# Create PR with suggested fix
driftlock fix ./repo --repo owner/repo
```

[Full documentation →](./docs/architecture.md)

---

## What you're used to vs. what DriftLock does

| Today                                  | With DriftLock                                   |
| -------------------------------------- | ------------------------------------------------ |
| Avoid upgrades because they're tedious | Automated codebase scanning                      |
| Manually find affected call sites      | All affected calls found automatically           |
| Copy-paste migration guide changes     | Fix suggestions generated, PR creation available |
| Weeks to upgrade, so you put it off    | Minutes to review a PR                           |
| Stuck on old versions                  | Stay current with minimal effort                 |

---

## Why not Renovate / Dependabot?

They update the version number in `package.json`. They don't change your code.

When `stripe.charges.create({ amount: 100 })` needs to become `stripe.charges.create({ value: 100 })`, Renovate doesn't touch that. DriftLock does.

| Renovate              | DriftLock                   |
| --------------------- | --------------------------- |
| Bumps version         | Updates your code           |
| Handles `npm install` | Handles call site migration |
| Dependency management | Code migration              |

---

## Why not just semver?

Semver is a convention, not a guarantee. Many APIs don't follow it strictly. And even when they do, upgrading major versions means manually finding and fixing every affected call site — which is why teams avoid it.

DriftLock works regardless of versioning scheme. It monitors the actual API surface, not the version number.

---

## Why not just test coverage?

High test coverage helps — if your tests aren't mocked. Most are. DriftLock classifies which tests actually hit the real API vs. which just mock the response. You can't catch API drift with mocked tests.

---

## First target: Stripe

Stripe has mature test mode, huge installed base, and plenty of teams stuck on old API versions. First vendor — not the only one.

Twilio, Shopify, and others are on the roadmap.

AI-powered fix generation is on the roadmap. The current implementation captures traffic shapes, detects drift between snapshots, and applies deterministic fixes; full automated PR generation with AI-generated patches is planned.

---

## Security

If you discover a security vulnerability, please report it responsibly.

**Email:** nalin@nerdev.in

Do NOT open a public GitHub issue for security vulnerabilities.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Community

- [Discord](https://discord.gg/driftlock) — Ask questions, share feedback
- [GitHub Discussions](https://github.com/nerdev-co/DriftLock/discussions) — Architecture decisions, design talks
- [Twitter](https://twitter.com/driftlock) — Updates and announcements

---

## License

MIT © [DriftLock](https://github.com/nerdev-co/DriftLock)
