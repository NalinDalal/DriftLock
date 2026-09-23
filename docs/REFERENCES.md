# DriftLock — Technology References

> Tools, frameworks, and libraries we're using or planning to use.

---

## Core Stack (In Use)

| Tool | Purpose | Link |
|------|---------|------|
| Bun | Runtime | https://bun.sh |
| Turborepo | Monorepo orchestration | https://turbo.build |
| Drizzle ORM | Database queries | https://orm.drizzle.team |
| PostgreSQL 16 | Database | https://postgresql.org |
| Hono | Backend API | https://hono.dev |
| TanStack Router | Frontend routing | https://tanstack.com/router |
| Octokit | GitHub API | https://octokit.github.io |

---

## AI / Agent (Planned)

| Tool | Purpose | Link | Status |
|------|---------|------|--------|
| Google ADK | Agent framework for AI-powered fixes | https://adk.dev | Research |
| OpenAI API | LLM for code analysis & fix generation | https://platform.openai.com | Planned |
| tree-sitter | AST parsing for code analysis | https://tree-sitter.github.io | Planned |

### Google ADK — Why It Matters

ADK (Agent Development Kit) is Google's open-source framework for building production-ready AI agents. Available in Python, TypeScript, Go, Java, and Kotlin.

**For DriftLock:**
- Build an AI agent that analyzes drift and generates actual code fixes
- Graph workflows for complex fix logic
- Multi-agent orchestration (one agent per vendor?)
- Built-in evaluation and safety

**Quick start (TypeScript):**
```typescript
import { LlmAgent } from '@google/adk';

const agent = new LlmAgent({
  name: 'drift-fixer',
  model: 'gemini-flash-latest',
  instruction: 'Analyze API drift and generate code fixes.',
  tools: [/* custom tools */],
});
```

**Install:**
```bash
npm install @google/adk
```

---

## Testing / Quality (Planned)

| Tool | Purpose | Link | Status |
|------|---------|------|--------|
| Vitest | Unit testing | https://vitest.dev | In use |
| Playwright | E2E testing | https://playwright.dev | Planned |

---

## Deployment (Future)

| Tool | Purpose | Link | Status |
|------|---------|------|--------|
| Cloudflare | DNS + CDN | https://cloudflare.com | In use (tunnel) |
| Docker | Containerization | https://docker.com | Planned |
| Fly.io | Deployment | https://fly.io | Planned |

---

## Competitor References

| Project | What They Do | Link |
|---------|-------------|------|
| Dependabot | Dependency updates | https://github.com/dependabot |
| Renovate | Dependency updates | https://github.com/renovatebot |
| CodeRabbit | AI code review | https://coderabbit.ai |
| Ripple | API spec diffing | https://github.com/Aakash2408/ripple |
| HelpPR | OpenAPI monitoring | https://github.com/pedapudi-pavansai/HelpPR |

---

*Last updated: September 2026*
