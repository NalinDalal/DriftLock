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

# Start local services (PostgreSQL + Redis)
docker compose -f docker/docker-compose.yml up -d

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
# Compare with main branch
bun run --filter @driftlock/cli driftlock diff ./repo

# Compare with specific branch
bun run --filter @driftlock/cli driftlock diff ./repo --base develop
```

### 4. Generate Fixes

```bash
# Generate fix suggestions (requires OpenAI API key)
bun run --filter @driftlock/cli driftlock fix ./repo

# With explicit API key
bun run --filter @driftlock/cli driftlock fix ./repo --api-key sk-...
```

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

Create `.driftlock.yml` in your project root:

```yaml
openaiApiKey: sk-...
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
