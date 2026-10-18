# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** nalin@nerdev.in

Do NOT open a public GitHub issue for security vulnerabilities. We will
acknowledge receipt and work with you on a fix and disclosure timeline.

## Production hardening checklist

DriftLock fails closed in production (`NODE_ENV=production`):

- `GITHUB_WEBHOOK_SECRET` — rejects unsigned GitHub deliveries with 401.
  Dev-only escape hatch: `ALLOW_UNSIGNED_WEBHOOKS=true` accepts unsigned
  requests; it must remain unset in production.
- `CAPTURE_SECRETS` (`"endpoint:secret,..."`) — rejects unsigned captures
  with 401 per endpoint. Dev-only escape hatch: `ALLOW_UNSIGNED_CAPTURE=true`
  accepts unsigned requests; it must remain unset in production.
- `BEARER_TOKEN` — the backend refuses to boot in production without it
  (otherwise it serves in dev-only `open` mode).
- `SESSION_ENC_KEY` — AES-256-GCM for stored GitHub OAuth tokens
  (generate: `openssl rand -hex 32`). The backend refuses to boot in
  production without it; unset in dev means plaintext with a warning.
- `DATABASE_URL` — never rely on the local default credentials in production.
- `/api/settings/rotate` requires POST; `/api/runs` only accepts known test
  runner commands (`npm`/`bun`/`yarn`/`pnpm` test, `npx jest`, `node --test`)
  with no shell operators.

See `.env.example` as the canonical environment matrix.
