# DriftLock Quick Start

## Prerequisites

- Bun 1.0+
- Docker Desktop (for sandbox testing)
- AI provider key for AI-powered fixes (optional; one of `AI_API_KEY` for
  openai/anthropic, `GEMINI_API_KEY` for gemini, or `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` for cloudflare). Deterministic fixes need no key.

## Setup

```bash
# Clone the repository
git clone git@github.com:nerdev-co/DriftLock.git
cd DriftLock

# Install dependencies
bun install

# Copy environment config (Bun auto-loads .env from the repo root)
cp .env.example .env

# Start local services (PostgreSQL; service name is `db`)
docker compose up -d db

# Build all packages
bun run build

# Initialize DriftLock configuration
bun run --filter @driftlock/cli driftlock init
```

## Usage

### 1. Analyze Codebase

```bash
# Analyze a directory for API call sites
bun run --filter @driftlock/cli driftlock analyze ./src

# Output as JSON
bun run --filter @driftlock/cli driftlock analyze ./src --output json
```

### 2. Run Tests in Sandbox

```bash
# Run tests in isolated Docker container
bun run --filter @driftlock/cli driftlock test ./repo

# Custom test command
bun run --filter @driftlock/cli driftlock test ./repo --command "bun test"

# Custom timeout
bun run --filter @driftlock/cli driftlock test ./repo --timeout 600000
```

### 3. Compare Snapshots

```bash
# Report working-tree status
bun run --filter @driftlock/cli driftlock diff ./repo

# Compare with main branch
bun run --filter @driftlock/cli driftlock diff ./repo --base main

# Compare with specific branch
bun run --filter @driftlock/cli driftlock diff ./repo --base develop
```

With `--base`, the comparison includes committed, staged, and unstaged changes
to tracked files. Untracked files are included only in the no-base status report.

### 4. Detect Drift and Generate Fixes

Run `fix` twice. The first run captures API traffic in a sandbox and stores a
baseline snapshot in `.driftlock/snapshots/`. After the vendor API changes,
re-run to compare captured shapes against the baseline and generate fixes.

```bash
# First run captures a baseline snapshot
bun run --filter @driftlock/cli driftlock fix ./repo

# After the vendor API changes, re-run to detect drift
bun run --filter @driftlock/cli driftlock fix ./repo --dry-run

# Non-interactive test command
bun run --filter @driftlock/cli driftlock fix ./repo --command "bun test"

# Create a PR with the fix (requires GITHUB_TOKEN)
bun run --filter @driftlock/cli driftlock fix ./repo --repo owner/repo
```

Drift triggers on a change in the captured request/response shapes, not on
changes to your own git history. Deterministic fixes (field renames, null
checks, type coercions) are applied statically; the base branch is used only
for the PR's target.

## Development

### Package Structure

- `packages/core` - Shared types and utilities
- `packages/parser` - AST-based code analysis
- `packages/agent` - Agent migration loop and vendor contracts
- `packages/aiFix` - Deterministic + LLM fix generation
- `packages/pipeline` - Scan, sandbox run, drift detection
- `packages/diff` - Shape infer/merge/diff and fix planning
- `packages/sandbox` - Docker test execution
- `packages/git` - Git operations and PR creation
- `packages/db` - Drizzle/Postgres persistence
- `packages/vendorWatch` - Vendor spec polling
- `packages/webhookCapture` - Inbound webhook capture and fix
- `apps/cli` - Command-line interface
- `apps/be` - Backend API (Bun, default port 8787 locally)
- `apps/fe` - Web dashboard (Vite, port 5173)
- `apps/webhook` - GitHub App + inbound capture (port 3001)

> Ports: local `bun run dev` serves the API on **8787**; `docker compose`
> maps the API to **3000** (`VITE_API_URL=http://localhost:3000`). Webhook
> capture is **3001** in both.

### Running in Development

```bash
# Build all packages
bun run build

# Run CLI in development mode
bun run --filter @driftlock/cli dev analyze ./src

# Run web app in development mode
bun run --filter @driftlock/fe dev
```

### Testing

```bash
# Run all unit tests (canonical suite in packages/tests)
bun run test:unit

# Run tests for specific package
bun run --filter @driftlock/parser test

# Run tests in watch mode
bun run --filter @driftlock/agent test:watch
```

## Configuration

Supply AI credentials through the environment using your shell or CI secret
manager (see `.env.example` as the canonical matrix). Supported providers:

- `AI_PROVIDER=openai|anthropic` with `AI_API_KEY` (+ optional `AI_MODEL`)
- `AI_PROVIDER=gemini` with `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`)
- `AI_PROVIDER=cloudflare` with `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` (+ optional `CLOUDFLARE_AI_MODEL`)

Never put API keys in `.driftlock.yml` or commit them.
The `init` command does not request or store a key. The CLI does not yet load
credentials or other settings from this file.

Create `.driftlock.yml` in your project root:

```yaml
testCommand: bun test
enableProxy: true
sandbox:
  image: oven/bun:1
  memoryLimit: 512m
  cpuLimit: 1.0
  timeout: 300000
```

## Architecture

See [docs/](./docs/) for the pitch, YC application, and ADRs
(`docs/adr/`). `PRODUCT.md` states the product positioning and principles.

## Current state

Outbound drift (`analyze`/`test`/`diff`/`fix`), inbound webhook capture with
PR creation, and optional AI fixes across four providers are implemented and
covered by `bun run test:unit` (692 tests). Stripe is the first live vendor;
Twilio/Shopify are next.
