# DriftLock Quick Start

## Prerequisites

- Bun 1.0+
- Docker Desktop (for sandbox testing)
- OpenAI API key (for AI-powered analysis)

## Setup

```bash
# Clone the repository
git clone git@github.com:nerdev-co/DriftLock.git
cd DriftLock

# Install dependencies
bun install

# Copy environment config (Bun auto-loads .env from the repo root)
cp .env.example .env

# Start local services (PostgreSQL)
docker compose up -d postgres

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
- `packages/agent` - AI-powered analysis and fix generation
- `packages/sandbox` - Docker test execution
- `packages/git` - Git operations and tracking
- `apps/cli` - Command-line interface
- `apps/web` - Web dashboard

### Running in Development

```bash
# Build all packages
bun run build

# Run CLI in development mode
bun run --filter @driftlock/cli dev analyze ./src

# Run web app in development mode
bun run --filter @driftlock/web dev
```

### Testing

```bash
# Run all tests
bun run test

# Run tests for specific package
bun run --filter @driftlock/parser test

# Run tests in watch mode
bun run --filter @driftlock/agent test:watch
```

## Configuration

Supply credentials through the `OPENAI_API_KEY` environment variable using your
shell or CI secret manager. Never put API keys in `.driftlock.yml` or commit them.
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

See [BLUEPRINT.md](./BLUEPRINT.md) for detailed implementation plan.

## Next Steps

1. Complete Step 1: Project Scaffolding
2. Implement parser package with TypeScript support
3. Build Docker sandbox environment
4. Create CLI commands
5. Build web dashboard
6. Integrate with GitHub API for PR creation
