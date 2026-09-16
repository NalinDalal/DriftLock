# DriftLock Implementation Blueprint

## Objective
Build a complete API drift detection system with parser, AI agent, CLI+UI, git tracker, Docker sandbox testing, and auto-fix PR generation.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Bun | Fast installs, native TypeScript, built-in test runner |
| **Monorepo** | Turborepo + Bun workspaces | Fast builds, shared types, clear boundaries |
| **Parser** | tree-sitter + @babel/parser | Multi-language AST support, incremental parsing |
| **Agent** | OpenAI/Anthropic API | Code analysis, fix generation, explanation |
| **CLI** | Bun + Commander.js | Fast iteration, composable commands |
| **Frontend** | Vite + TanStack Router (React SPA) | Dashboard for client usage, talks to the webhook JSON API |
| **Database** | PostgreSQL + Drizzle ORM | Type-safe queries, migrations |
| **Queue** | BullMQ + Redis | Background jobs, retry logic, rate limiting |
| **Sandbox** | Docker + dockerode | Isolated test execution, reproducible environments |
| **Git** | simple-git + Octokit | Local git ops + GitHub API integration |
| **Diffing** | json-schema-diff + ast-diff | Structural changes, not just line diffs |

---

## Current plan (2026-09)

### App split

- `apps/webhook` (Bun native server, :3001): owns `/webhooks/*` (GitHub
  events), `/auth/*` (GitHub OAuth), and the JSON API the dashboard reads
  and writes. One deployable.
- `apps/fe` (React, Vite, TanStack Router): the customer dashboard. It only
  calls the webhook JSON API. Install and PR work stays in GitHub and the
  webhook server.

### Two GitHub identities

| Identity | What it is | What it grants |
| -------- | ---------- | -------------- |
| App installation (machine) | Installed per account (user or org) | Read repo contents, write PRs, scoped to installed repos |
| OAuth (human) | Person signs into the dashboard | `read:user` + `read:org`, only lists the accounts they belong to |

Scopes, human sign-in:
- `read:user`: the human's profile and own account.
- `read:org`: which orgs the human belongs to.
- No `repo` scope on the OAuth token. Repo data flows through the
  installation token, not the human's token.

### Dashboard model

First screen is the accounts where DriftLock is installed (own account plus
each org). Then it drills down:

`Account -> Repo -> Call sites, drift events, PRs`

Account-first, not repo-first. Installs are per-account, and that is what the
human controls.

### What humans do in the dashboard

PRs always land in GitHub. The dashboard never merges or applies code; it is
the control plane:

- Pick which orgs and repos are watched.
- Read/write permissions per repo or org, CodeRabbit-style.
- Store API keys and probe credentials; set preferences and schedules.
- See what drift was found, which PRs opened, and their status.

Humans act on PRs in GitHub, not in the dashboard.

---

## Project Structure

```
driftlock/
├── packages/
│   ├── core/                    # Shared types, utilities, constants
│   │   ├── src/
│   │   │   ├── types/           # TypeScript interfaces
│   │   │   ├── constants/       # API endpoints, error codes
│   │   │   └── utils/           # Shared helpers
│   │   └── package.json
│   ├── parser/                  # AST-based code analysis
│   │   ├── src/
│   │   │   ├── extractors/      # Language-specific extractors
│   │   │   │   ├── typescript.ts
│   │   │   │   ├── python.ts
│   │   │   │   └── index.ts
│   │   │   ├── analyzers/       # Call site analysis
│   │   │   │   ├── stripe.ts
│   │   │   │   └── base.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── agent/                   # AI-powered analysis
│   │   ├── src/
│   │   │   ├── analyzers/       # Change analysis
│   │   │   ├── generators/      # Fix generation
│   │   │   └── index.ts
│   │   └── package.json
│   ├── sandbox/                 # Docker test execution
│   │   ├── src/
│   │   │   ├── runner.ts        # Container orchestration
│   │   │   ├── proxy.ts         # HTTPS proxy for capture
│   │   │   └── index.ts
│   │   └── package.json
│   └── git/                     # Git operations
│       ├── src/
│       │   ├── tracker.ts       # Change detection
│       │   ├── differ.ts        # Diff generation
│       │   └── index.ts
│       └── package.json
├── apps/
│   ├── cli/                     # CLI interface
│   │   ├── src/
│   │   │   ├── commands/        # CLI commands
│   │   │   ├── ui/              # Terminal UI (Ink)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── fe/                      # React + Vite + TanStack Router dashboard
│   │   ├── src/
│   │   │   ├── routes/          # TanStack Router file routes
│   │   │   ├── components/      # React components
│   │   │   └── lib/             # API clients, utilities
│   │   └── package.json
│   └── webhook/                 # Bun native server: /webhooks/*, /auth/*, JSON API
│       ├── src/
│       │   ├── routes/          # Per-route handler files
│       │   ├── lib/             # API clients, utilities
│       │   └── index.ts
│       └── package.json
├── docker/
│   ├── Dockerfile.sandbox       # Test execution environment
│   └── docker-compose.yml       # Local development
├── turbo.json
└── package.json
```

---

## Implementation Steps (PR-based)

### Step 1: Project Scaffolding
**Objective:** Set up monorepo, shared types, and basic infrastructure.

**Files to Create/Modify:**
- `package.json` (root with workspaces)
- `turbo.json`
- `packages/core/src/types/` (all shared interfaces)
- `packages/core/src/constants/`
- `.gitignore`
- `.env.example`

**Dependencies:** None

**Implementation Details:**
1. Initialize Bun monorepo with workspaces
2. Configure Turborepo for build/test/lint pipelines
3. Define core types: `CallSite`, `Snapshot`, `DriftEvent`, `Fix`, `AnalysisResult`
4. Set up shared ESLint + Prettier config
5. Create Docker Compose for local PostgreSQL + Redis

**Verification:**
- [ ] `bun install` succeeds
- [ ] `bun run build` builds all packages
- [ ] `bun run test` runs (even if no tests yet)
- [ ] Docker Compose starts PostgreSQL + Redis

---

### Step 2: Parser Package
**Objective:** Build AST-based code analysis for extracting API call sites.

**Files to Create/Modify:**
- `packages/parser/src/extractors/typescript.ts`
- `packages/parser/src/extractors/python.ts`
- `packages/parser/src/analyzers/base.ts`
- `packages/parser/src/analyzers/stripe.ts`
- `packages/parser/src/index.ts`
- `packages/parser/tests/`

**Dependencies:** Step 1

**Implementation Details:**
1. Use tree-sitter for multi-language AST parsing
2. Implement TypeScript extractor:
   - Find `stripe.*` member expressions
   - Extract method calls (charges.create, customers.retrieve, etc.)
   - Infer request/response shapes from arguments and return types
3. Implement Python extractor (for future multi-language support)
4. Create base analyzer interface for vendor-specific logic
5. Build Stripe analyzer with endpoint mapping

**Verification:**
- [ ] Parses sample TypeScript files with Stripe calls
- [ ] Extracts correct call sites with endpoints
- [ ] Infers request/response shapes
- [ ] Unit tests pass for all extractors

---

### Step 3: Git Tracker Package
**Objective:** Track repository changes and detect drift.

**Files to Create/Modify:**
- `packages/git/src/tracker.ts`
- `packages/git/src/differ.ts`
- `packages/git/src/index.ts`
- `packages/git/tests/`

**Dependencies:** Step 1

**Implementation Details:**
1. Implement git diff detection using simple-git
2. Track file changes, line additions/deletions
3. Build structural differ for API call sites:
   - Detect when call sites are added/removed/modified
   - Compare request/response shapes over time
   - Classify changes as breaking/non-breaking
4. Store snapshots in database for historical comparison

**Verification:**
- [ ] Detects file changes in git repository
- [ ] Identifies API call site modifications
- [ ] Generates meaningful diffs (not just line numbers)
- [ ] Persists snapshots for comparison

---

### Step 4: Sandbox Package
**Objective:** Docker-based test execution environment.

**Files to Create/Modify:**
- `docker/Dockerfile.sandbox`
- `docker/docker-compose.yml`
- `packages/sandbox/src/runner.ts`
- `packages/sandbox/src/proxy.ts`
- `packages/sandbox/src/index.ts`
- `packages/sandbox/tests/`

**Dependencies:** Step 1

**Implementation Details:**
1. Create sandboxed Docker image with:
   - Node.js/Python runtime
   - Network isolation (only allow specific endpoints)
   - Resource limits (CPU, memory, timeout)
2. Implement container orchestration:
   - Clone repository
   - Install dependencies
   - Run test suite
   - Capture output
3. Build HTTPS proxy for request/response capture:
   - Record all outbound API calls
   - Log request/response payloads
   - Classify mock vs. real traffic
4. Implement test classification:
   - Detect mock libraries (jest.mock, nock, msw)
   - Analyze network traffic patterns
   - Categorize tests: monitored, tested-but-blind, untested

**Verification:**
- [ ] Docker container starts and stops cleanly
- [ ] Can clone and run tests in isolated environment
- [ ] Proxy captures API calls correctly
- [ ] Test classification works for common patterns

---

### Step 5: Agent Package
**Objective:** AI-powered analysis and fix generation.

**Files to Create/Modify:**
- `packages/agent/src/analyzers/` (change analysis)
- `packages/agent/src/generators/` (fix generation)
- `packages/agent/src/index.ts`
- `packages/agent/tests/`

**Dependencies:** Steps 2, 3, 4

**Implementation Details:**
1. Build change analyzer:
   - Input: old snapshot, new snapshot, diff
   - Output: change summary, impact assessment, confidence score
   - Use LLM to understand semantic changes
2. Build fix generator:
   - Input: change analysis, call site context
   - Output: suggested code fixes with explanations
   - Template-based for common patterns
   - AI-generated for complex changes
3. Implement confidence scoring:
   - High confidence: field renamed, type changed
   - Medium confidence: optional became required
   - Low confidence: complex logic changes
4. Create prompt engineering for code analysis

**Verification:**
- [ ] Analyzes API changes correctly
- [ ] Generates meaningful fix suggestions
   - [ ] Confidence scores correlate with actual breaking changes
   - [ ] Handles edge cases (nested objects, arrays, unions)

---

### Step 6: CLI Application
**Objective:** Command-line interface for local development and testing.

**Files to Create/Modify:**
- `apps/cli/src/commands/` (analyze, test, fix)
- `apps/cli/src/ui/` (terminal UI with Ink)
- `apps/cli/src/index.ts`
- `apps/cli/package.json`

**Dependencies:** Steps 2, 3, 4, 5

**Implementation Details:**
1. Create CLI commands:
   - `driftlock analyze <path>` - Parse codebase for API calls
   - `driftlock test <path>` - Run tests in sandbox
   - `driftlock diff <path>` - Compare snapshots
   - `driftlock fix <path>` - Generate fix suggestions
   - `driftlock watch <path>` - Continuous monitoring
2. Build terminal UI with Ink:
   - Interactive file selection
   - Real-time progress indicators
   - Color-coded diff output
   - Interactive fix preview
3. Implement configuration:
   - `.driftlock.yml` for project settings
   - Environment variable support
   - API key management

**Verification:**
- [ ] All CLI commands work correctly
   - [ ] Terminal UI renders properly
   - [ ] Configuration loads from file and env vars
   - [ ] Error handling provides helpful messages

---

### Step 7: Frontend Dashboard (apps/fe)
**Objective:** Dashboard for team, organization, and per-repo visibility plus settings.

**Files to Create/Modify:**
- `apps/fe/src/routes/` (TanStack Router file routes)
- `apps/fe/src/components/` (React components)
- `apps/fe/src/lib/` (API clients)
- `apps/fe/package.json`

**Dependencies:** Steps 2, 3, 4, 5

**Implementation Details:**
1. Build dashboard routes (account-first model):
   - Accounts: list of the user's account and orgs where DriftLock is installed
   - Repo: call sites, drift events, PR status for a single repo
   - Settings: watched repos, read/write permissions per repo or org, API keys and probe credentials, preferences and schedules
2. Create interactive components:
   - Code viewer with diff highlighting
   - Fix preview with before/after
   - Coverage map visualization
   - Timeline of changes
3. Hook the dashboard to the webhook JSON API only.
4. Add authentication:
   - GitHub OAuth with `read:user` + `read:org` scopes only
   - No `repo` scope; repo data comes from installation tokens via the webhook API

**Verification:**
- [ ] Dashboard loads and displays data
   - [ ] Account list matches the user's orgs with DriftLock installed
   - [ ] Code viewer renders correctly
   - [ ] Settings persist (permissions, API keys, schedules)
   - [ ] Authentication works

---

### Step 8: PR Generation
**Objective:** Automated PR creation with fix suggestions.

**Files to Create/Modify:**
- `packages/core/src/pr-generator.ts`
- Integration with GitHub API (Octokit)

**Dependencies:** Steps 5, 7

**Implementation Details:**
1. Build PR template generator:
   - What changed (summary)
   - Where it affects (file paths, line numbers)
   - Suggested fix (diff preview)
   - Confidence level
   - Coverage note (which tests verify this)
2. Implement branch management:
   - Create branches with naming convention
   - Handle merge conflicts
   - Clean up after merge/close
3. Add PR metadata:
   - Labels for drift type
   - Assignees based on code ownership
   - Milestones for tracking

**Verification:**
- [ ] Creates well-formatted PRs
   - [ ] Branch naming works correctly
   - [ ] Cleanup happens after merge
   - [ ] PR metadata is accurate

---

### Step 9: Integration & Testing
**Objective:** End-to-end testing and integration.

**Files to Create/Modify:**
- Integration tests
- E2E tests
- Documentation
- CI/CD pipeline

**Dependencies:** All previous steps

**Implementation Details:**
1. Create integration tests:
   - Parser + Agent workflow
   - Git tracking + Drift detection
   - Sandbox + Proxy capture
   - CLI + Web coordination
2. Build E2E tests:
   - Full drift detection workflow
   - PR creation and merge
   - Real Stripe API integration
3. Set up CI/CD:
   - GitHub Actions for testing
   - Automated releases
   - Documentation generation

**Verification:**
- [ ] All integration tests pass
   - [ ] E2E tests demonstrate full workflow
   - [ ] CI/CD pipeline works
   - [ ] Documentation is complete

---

## Adversarial Review Checklist

- [ ] Are steps in correct order?
- [ ] Are dependencies clear?
- [ ] Are verification criteria specific?
- [ ] Are rollback plans realistic?
- [ ] Is scope appropriate per step?
- [ ] Are there hidden complexity bombs?
- [ ] Does each step deliver testable value?
- [ ] Are security considerations addressed?

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Parser complexity | Start with Stripe TypeScript only, expand later |
| Docker performance | Use layer caching, minimal images |
| AI hallucination | Template-based fixes for common patterns |
| False positives | Confidence scoring, manual review required |
| Scope creep | Strict v1 boundaries, defer multi-vendor |

---

## Success Metrics

- [ ] Parser correctly identifies 90%+ of Stripe call sites
   - [ ] Sandbox runs test suites without security issues
   - [ ] Agent generates useful fix suggestions
   - [ ] CLI commands work reliably
   - [ ] Web UI displays information clearly
   - [ ] PRs are mergeable without manual editing

---

## Rollback Plan

Each step can be rolled back independently:
1. **Parser:** Revert to previous version, no data loss
2. **Git:** Revert snapshot storage, keep historical data
3. **Sandbox:** Stop containers, no persistent state
4. **Agent:** Disable AI features, use template-only fixes
5. **CLI/Web:** Revert to previous deployment
6. **PR:** Close unmerged branches, no impact on codebase
