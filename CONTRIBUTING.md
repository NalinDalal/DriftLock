# Contributing to DriftLock

Thanks for your interest in contributing! DriftLock is in early development, and there's a lot of meaningful work to do.

---

## Before you start

1. **Check existing discussions** — [GitHub Discussions](https://github.com/nerdev-co/DriftLock/discussions) has architecture decisions and implementation plans. Comment there before starting work on something new.
2. **Open an issue** — For bugs or feature requests, open an issue first. For larger changes, start a discussion.
3. **Read the blueprint** — [BLUEPRINT.md](./BLUEPRINT.md) has the full implementation plan with task breakdowns.

---

## Development setup

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for sandbox testing)
- Git

### Getting started

```bash
# Clone the repo
git clone git@github.com:nerdev-co/DriftLock.git
cd DriftLock

# Install dependencies
bun install

# Start local services (PostgreSQL + Redis)
docker compose -f docker/docker-compose.yml up -d

# Build all packages
bun run build
```

### Project structure

```text
driftlock/
├── packages/
│   ├── core/       # Shared types, constants, utils
│   ├── parser/     # AST-based code analysis
│   ├── agent/      # AI-powered fix generation
│   ├── sandbox/    # Docker test execution
│   └── git/        # Git operations
├── apps/
│   ├── cli/        # Command-line interface
│   └── web/        # Web dashboard
└── docker/         # Sandbox Dockerfiles
```

---

## Making changes

### Branch naming

```text
feat/<description>     # New features
fix/<description>      # Bug fixes
docs/<description>     # Documentation
refactor/<description> # Code restructuring
```

Examples:
- `feat/tree-sitter-parser`
- `fix/sandbox-timeout`
- `docs/update-readme`

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(parser): add TypeScript extractor for stripe.* calls
fix(sandbox): handle container timeout gracefully
docs(readme): update quick start section
```

### Code style

- **TypeScript** — strict mode, explicit types
- **Formatting** — Prettier (runs on commit via husky)
- **Linting** — ESLint with TypeScript plugin

```bash
bun run lint        # Check for issues
bun run format      # Auto-fix formatting
```

### Testing

```bash
bun run test        # Run all tests
bun run test --watch  # Watch mode
```

Write tests for:
- New features
- Bug fixes (regression tests)
- Edge cases in parsers

---

## Pull requests

### Before submitting

1. **Sync with main** — `git rebase main` (not merge)
2. **Run checks** — `bun run build && bun run test && bun run lint`
3. **Update docs** — if your change affects usage or architecture

### PR template

```markdown
## What

Brief description of the change.

## Why

Link to issue or discussion. Explain the problem being solved.

## How

Technical approach. Any tradeoffs or alternatives considered.

## Testing

How was this tested? Steps to reproduce.

## Checklist

- [ ] Code builds (`bun run build`)
- [ ] Tests pass (`bun run test`)
- [ ] Lint passes (`bun run lint`)
- [ ] Docs updated (if applicable)
```

### PR guidelines

- **One concern per PR** — don't bundle unrelated changes
- **Small and focused** — easier to review = faster merge
- **Include context** — link to discussion/issue, explain why not just what
- **Add screenshots** — for UI changes

---

## Working on specific packages

### Parser (`packages/parser`)

Mostly tree-sitter based. See `docs/product-engineering.md` for extraction strategy.

```bash
bun run --filter @driftlock/parser dev  # Watch mode
bun run --filter @driftlock/parser test # Run tests
```

### Agent (`packages/agent`)

Requires `OPENAI_API_KEY` env var for testing.

```bash
export OPENAI_API_KEY=sk-...
bun run --filter @driftlock/agent test
```

### Sandbox (`packages/sandbox`)

Requires Docker running. Tests spin up containers.

```bash
bun run --filter @driftlock/sandbox test
```

### CLI (`apps/cli`)

Run directly during development:

```bash
bun run --filter @driftlock/cli dev analyze ./src
```

---

## Reporting bugs

Open an issue with:

1. **What happened** — steps to reproduce
2. **What you expected** — desired behavior
3. **Environment** — OS, Bun version, Node version
4. **Logs/output** — relevant error messages

---

## Suggesting features

Start a [GitHub Discussion](https://github.com/nerdev-co/DriftLock/discussions) under "Ideas":

1. **Problem** — what's the pain point?
2. **Proposed solution** — what would you build?
3. **Alternatives considered** — what else did you think about?
4. **Scope** — v1, v2, or future?

---

## Security

Do NOT open public issues for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for responsible disclosure.

---

## Code of conduct

Be respectful, constructive, and inclusive. We're building something useful — let's keep the environment welcoming.

---

## Questions?

Open a [Discussion](https://github.com/nerdev-co/DriftLock/discussions) or reach out on [Discord](https://discord.gg/driftlock).
