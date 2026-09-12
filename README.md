<div align="center">

<img src="./assets/logo.png" width="100" />

# DriftLock

**Dependabot for API changes.**

Your vendor renames a field. Your code breaks silently. You find out at 2am.

DriftLock notices the change before you do, opens a PR with the fix, and you review and merge.

[Website](https://driftlock.dev) · [Discord](https://discord.gg/driftlock) · [Issues](https://github.com/nerdev-co/DriftLock/issues)

[![npm](https://img.shields.io/npm/v/@driftlock/cli?color=blue)](https://www.npmjs.com/package/@driftlock/cli)
[![GitHub stars](https://img.shields.io/github/stars/nerdev-co/DriftLock)](https://github.com/nerdev-co/DriftLock/stargazers)
[![Build](https://img.shields.io/github/actions/workflow/status/nerdev-co/DriftLock/ci.yml?branch=main)](https://github.com/nerdev-co/DriftLock/actions)
[![License](https://img.shields.io/github/license/nerdev-co/DriftLock)](./LICENSE)

</div>

---

## Why DriftLock

You already use Dependabot for dependency updates. Renovate for version bumps. CodeRabbit for AI review.

But when Stripe renames `charge.amount` to `charge.value` — nothing catches it.

Changelogs don't get read. Docs drift from reality. SDK migration guides sit in bookmarks you'll never open. **30%+ of downtime at a major cloud provider was traced to unnoticed external API changes.**

The cost always lands on you — the consumer — not the vendor who made the change.

DriftLock fills the gap: it watches your actual API usage, compares it against what the vendor's API *actually returns* today, and opens a PR when they diverge. No vendor cooperation. No spec publication. No manual doc-checking.

---

## How it works

```text
Install GitHub App → Discover call sites → Classify tests →
Probe sandbox → Diff specs → Open PR → Report coverage
```

| Step | What happens |
|------|--------------|
| **Discover** | Static analysis finds every `stripe.*` call in your codebase |
| **Classify** | Identifies which tests hit real sandbox vs. mocked |
| **Probe** | Runs your tests, captures actual request/response shapes |
| **Diff** | Compares new snapshot against previous — shape change = drift |
| **Fix** | Opens a PR with the diff and a suggested fix |
| **Report** | Shows which call sites are monitored, blind, or untested |

---

## Quick start

```bash
# Install
bun add -g @driftlock/cli

# Analyze your codebase
driftlock analyze ./src

# Run in sandbox
driftlock test ./repo

# Generate fixes
driftlock fix ./repo
```

[Full documentation →](./docs/architecture.md)

---

## What you're used to vs. what DriftLock does

| Today | With DriftLock |
|-------|----------------|
| Read changelogs manually (you don't) | Automated drift detection |
| Find out when prod breaks | Get a PR before it breaks |
| "Something changed, no idea what" | "Field X renamed to Y on this endpoint" |
| Fix it yourself, hope you got it right | Suggested fix, ready to merge |
| No idea which tests are real | Coverage report per call site |

---

## First target: Stripe

Stripe has mature test mode, huge installed base, predictable API versioning, and plenty of design partners.

Support for Twilio, Shopify, and others is on the roadmap.

---

## Security

If you discover a security vulnerability, please report it responsibly.

**Email:** security@driftlock.dev

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
