# Driftlock — MVP Scope

## One-liner

A GitHub App that watches the third-party APIs your codebase depends on, catches when a vendor changes something underneath you, and opens a suggested-fix PR — without ever needing the vendor's cooperation.

## Target user (v1 design partners)

Small-to-mid engineering teams with:
- An existing CI test suite that hits Stripe's test mode (not fully mocked).
- At least one prior incident/pain point from an unnoticed Stripe change.

## Success criteria

- Correctly detect at least one real historical Stripe breaking change or field deprecation, retroactively, against a real design partner's test history.
- Produce a coverage report a design partner says is accurate (matches their own sense of what's tested vs. mocked).
- Get one design partner to accept and merge a suggested-fix PR.
- False positive rate low enough that a design partner doesn't disable the bot in week one.

## Explicit scope boundaries

### In scope (v1)
- Single vendor: **Stripe**.
- Single language/framework target (likely TypeScript/Node).
- GitHub App only (no GitLab/Bitbucket/GitHub Enterprise).
- Suggest-only PRs. No auto-merge.
- Coverage reporting (monitored / tested-but-blind / untested).

### Out of scope (v1)
- Auto-merge / auto-apply.
- Multi-vendor support.
- Passive traffic monitoring / proxying.
- New-feature discovery (changelog/docs crawling).
- Discovering unused API surface.

## Known hard problems

- **Mocked vs. sandbox tests** — looks identical from the outside unless you trace whether the test made a network call. Detecting this reliably is core infra.
- **Coverage ceiling** — if it's not tested against a real sandbox, it's invisible. Say this plainly to customers.
- **Non-idempotent endpoints** — POST /charges can't be replayed safely without explicit sandbox handling.
- **Spec inference precision** — dynamic dispatch, wrapper SDKs, and generated clients can obscure the actual HTTP surface.
