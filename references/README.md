# Driftlock — References & Sources

Problem statement, market signals, and inspiration sources collected during ideation.

## Problem statement

- 30%+ of downtime at a major cloud provider traced to unnoticed external API/package changes (author's firsthand experience at AWS).
- Pattern observed across 50+ API vendor relationships, mostly early-stage startups.

## Inspiration

- **Dependabot for API changes** — semantic breaking-change detection and auto-remediation across vendors.
- **CodeRabbit** — trust model: GitHub App install, PR-based suggestions, branch deleted after merge.
- **Consumer-driven contracts** — inferred from actual usage rather than vendor-published specs.

## External links

| Source | URL |
|--------|-----|
| YC RFS — Self-Maintaining APIs | https://www.ycombinator.com/rfs |
| Problem statement video | https://www.youtube.com/shorts/c3TxAUir2R8 |

## Market signals

- Agentic coding tools (Claude Code, Devin, Greptile) have normalized codebase access for external tools.
- Dependabot/Renovate proved the PR-based bot trust model works at scale.
- API versioning is a solved problem for providers but unsolved for consumers.

## Related concepts

- [Changelog detection](./changelog-detection.md) — out of scope for v1, but noted.
- [OpenAPI diff strategies](./openapi-diff.md) — how vendors do/do not publish specs.
