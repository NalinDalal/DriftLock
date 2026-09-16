# Driftlock — Product Engineering

## Core detection loop

```
GitHub App install → discover call sites → classify tests → 
probe sandbox → diff specs → open PR → report coverage
```

The engineering challenge is making each arrow reliable enough that a design partner trusts it in week one.

What makes it hard (and interesting):

1. **Knowing what actually changed** — not just "Stripe updated" but "field X was renamed to Y in this specific endpoint." You need to map a vendor-level change onto a specific call site in a specific language/SDK.
2. **Knowing who it affects** — only repos that call that specific endpoint with that specific field. You can't blast every Stripe customer with every drift; you need per-repo, per-call-site targeting.
3. **Suggesting the right fix** — not just "something changed" but "replace `charge.amount` with `charge.value` on line 42." This is the difference between a useful bot and noise.

Every other section in this doc is a sub-problem of one of these three.

---

## 1. Static usage extraction

**Goal:** find every call site that touches Stripe, extract the endpoint, params sent, and response fields accessed.

### Approach for Stripe (v1)

Stripe's Node SDK (`stripe.*`) is a thin wrapper. The actual HTTP surface is:

```js
// Pattern 1: direct SDK call
const charge = await stripe.charges.create({ amount: 1000, currency: 'usd' });
console.log(charge.status);

// Pattern 2: via resource access
const customer = await stripe.customers.retrieve('cus_123');

// Pattern 3: list/search
const invoices = await stripe.invoices.list({ customer: 'cus_123', limit: 10 });
```

For v1, we target the **Node.js SDK** only. Extraction strategy:

1. **AST parse** — use `@babel/parser` or `tree-sitter` to find `MemberExpression` chains where the root is an identifier named `stripe` (or destructured aliases like `const { charges } = stripe`).
2. **Argument inference** — extract the literal/object passed as the first argument. This gives us the request shape the code *expects* to send.
3. **Response field tracking** — find property accesses on the returned value. `charge.status`, `invoice.lines.data[0].amount`, etc.

### Output format per call site

```json
{
  "file": "src/services/billing.ts",
  "line": 42,
  "method": "stripe.charges.create",
  "endpoint": "/v1/charges",
  "requestShape": { "amount": "number", "currency": "string", "customer": "string?" },
  "responseFields": ["status", "id", "amount", "currency"],
  "testFiles": ["src/services/billing.test.ts"]
}
```

### Known limitations

- Destructured aliases (`const s = stripe`) require scope analysis. Fall back to file-level regex for aliases we can't resolve.
- Dynamic SDK methods (`stripe[methodName](...)`) can't be statically resolved. Skip with a warning.
- Wrapper abstractions (`billingService.createCharge(...)`) that internally call Stripe will be missed unless we trace through the wrapper. Accept this coverage gap in v1.

---

## 2. Test classification (mock vs. sandbox)

**Goal:** know which tests actually hit Stripe's test-mode API vs. mock the HTTP layer.

### Detection signals (ranked by reliability)

| Signal | Reliable? | How to detect |
|--------|-----------|---------------|
| `jest.mock('stripe')` or `vi.mock('stripe')` | High | Parse test file for mock declarations |
| MSW/nock interceptors registered | High | Check for `msw`, `nock`, `fetch-mock` setup in test file |
| `stripe.setApiKey('sk_test_...')` present | Medium | Means real credentials are configured, but doesn't prove the test runs un-mocked |
| No mock signal + test command runs | High (empirical) | Run the test suite with a network proxy; if no traffic to `api.stripe.com` exits, it's blind |

### v1 heuristic (good enough)

Combine signals:

1. If any mock library is detected in the test file → **tested-but-blind**.
2. If the test command, run with our proxy, produces zero traffic to `api.stripe.com` → **untested** (or all tests in the suite are mocked).
3. Otherwise → **monitored**.

### The proxy trick

To empirically detect sandbox traffic, run the test command with:

```bash
HTTPS_PROXY=http://localhost:8888 npm test
```

Our lightweight Node proxy records all outbound HTTPS traffic. After the test run:

- Traffic to `api.stripe.com` with `Authorization: Bearer sk_test_...` → monitored.
- No traffic → blind or mocked.

This is more reliable than static mock detection alone, because it catches:
- Tests that mock at the `fetch` level (not `stripe` module level)
- Tests that use environment-based flagging to skip external calls
- Test files that import a shared mock setup

---

## 3. Sandbox probing

**Goal:** run the customer's test suite (or a probe command they nominate) against their sandbox credentials and capture request/response shapes.

### How it works

1. Customer nominates a command: e.g., `npm run test:integration` or `npm test -- --grep "stripe"`
2. We run it in a fresh CI job with:
   - Their repo checked out
   - Their env vars (`STRIPE_SECRET_KEY=sk_test_...`, etc.) injected from their GitHub Secrets
   - `HTTPS_PROXY` pointing to our local recorder
3. The proxy logs every request/response pair keyed by the test file + line number (or call site if we can instrument the SDK).

### Safety: non-idempotent endpoints

Stripe's POST endpoints (charges, customers, invoices) have real side effects even in test mode — they consume test data, can hit limits, and may trigger webhooks.

**v1 policy:**
- Only probe GET endpoints by default (retrieve, list, retrieve-upcoming-invoice).
- POST/PUT/DELETE endpoints are classified as "non-idempotent" and skipped unless:
  - The test explicitly uses Stripe test mode (`sk_test_*` key), **and**
  - The test suite has a documented "safe to replay" flag or the customer explicitly whitelists the endpoint in a config file we provide.

### Credential handling

- Never persist raw API keys. Pull from GitHub Secrets at job runtime.
- Rotate/expire keys are the customer's responsibility.
- We only need read-level access for GET probes; write access is only needed if the customer explicitly opts into POST probing.

---

## 4. Schema diffing

**Goal:** compare two snapshots of the same endpoint's request/response shape and classify changes.

### What we diff

| Layer | What we track |
|-------|--------------|
| Request | Param names, types, required vs. optional |
| Response | Top-level fields, nested objects, array element shapes, status codes |
| Both | Added fields, removed fields, type changes (string → number), optionality changes |

### Diff algorithm

Use **JSON Schema** as the intermediate representation:

1. Infer a JSON Schema from each snapshot (use a library like `json-schema-generator` or hand-roll for Stripe's known shapes).
2. Diff the two schemas using a structural diff (not line-by-line).
3. Classify each diff as:
   - **BREAKING:** field removed, field type changed, field became required, status code added/removed
   - **NON-BREAKING:** field added as optional, enum expanded
   - **UNKNOWN:** ambiguous change (e.g., array element shape changed but we only saw one element)

### False positive mitigation

- Require the same field to change in **N consecutive snapshots** before flagging (configurable, default 2).
- For TypeScript codebases, cross-reference against the codebase's type definitions: if the code already uses the new shape, it's a false positive (the developer already adapted).
- Whitelist known-safe Stripe deprecations (e.g., `source` → `payment_method` migration that Stripe announced and documented).

---

## 5. PR generation

**Goal:** produce a PR that a human can review and merge in under 2 minutes.

### PR structure

```
Title: [Driftlock] Stripe API drift detected: charge.status changed from string to nullable string

Body:
## What changed
Stripe changed the `status` field on `POST /v1/charges` responses.
- Before: `string` (e.g., "succeeded", "failed")
- After: `string | null`

## Where you use it
src/services/billing.ts:42 — `const charge = await stripe.charges.create(...)`
src/services/billing.ts:45 — `console.log(charge.status)`

## Suggested fix
Add a null check before using `charge.status`:

\`\`\`diff
- console.log(charge.status)
+ console.log(charge.status ?? 'unknown')
\`\`\`

## Coverage note
This endpoint is monitored (test: src/services/billing.test.ts, hits Stripe test mode).
```

### Fix generation strategy

For v1 Stripe, build a small **fix template library** keyed by diff pattern:

| Diff pattern | Suggested fix template |
|-------------|----------------------|
| field removed | Remove access, or use `?.` optional chaining |
| field type widened (e.g., string → string \| null) | Add null coalescing (`??`) or explicit null check |
| field type narrowed (e.g., string → enum) | Add switch/guard for new enum values |
| new required request param | Add param with sensible default or mark as required in your input type |
| status code added | Add new case to error handling switch |

This is Stripe-specific. Generalizing to N vendors is post-v1 work.

### Branch hygiene

- Branch name: `driftlock/{call-site-hash}-{timestamp}`
- Delete immediately after PR is merged or closed (webhook listener on `pull_request` events).
- One PR per drift event, not batched.

---

## 6. Infrastructure

### Stack recommendation

| Layer | Choice | Reason |
|-------|--------|--------|
| Webhook server (apps/webhook) | Bun native server | Owns `/webhooks/*`, `/auth/*`, and the dashboard JSON API in one process on :3001 |
| Dashboard (apps/fe) | React + Vite + TanStack Router | Client usage only; calls the webhook JSON API, no server-side logic |
| Background workers | Inngest or BullMQ + Redis | Event-driven, handles webhook retries and scheduled probe runs |
| Database | PostgreSQL | Call sites, snapshots, drift events, installations |
| Proxy (sandbox probing) | Custom Node HTTP(S) proxy | Lightweight, single-purpose |
| Queue for probe jobs | Same as workers | One queue, multiple consumers |
| Hosting | Vercel (dashboard) + Fly/Render (webhook server, workers, proxy) | Separate the stateless dashboard from the stateful server |

### Data retention

- Snapshots: keep last 2 per call site (current + previous). Older snapshots are cold and can be archived.
- Drift events: keep indefinitely (audit trail).
- Coverage reports: regenerate on demand from current snapshot + test classification state.

### Cost model for running a probe

A typical probe job:
- Clones the repo: ~30s, ~100MB bandwidth
- Installs deps: ~60s, cached between runs
- Runs tests: 30s–5min (customer's existing suite, we don't add significant overhead)
- Proxy overhead: negligible

Aim for **<5 min total** for a probe job. If the customer's full suite is slow, let them nominate a subset (e.g., `npm test -- --grep "stripe"`).

---

## 7. v1 implementation priority

Build in this order:

1. **GitHub App skeleton** — install webhook, repo read access, PR creation. Prove the OAuth + permission flow.
2. **Stripe static extractor** — AST parse for `stripe.*` calls. Output call sites. Run against 3–5 real open-source repos and measure precision/recall.
3. **Probe proxy** — Node HTTPS proxy that records request/response pairs. Run a customer's Stripe test suite through it end-to-end.
4. **Snapshot storage** — persist captured shapes. Build the "previous vs. current" diff UI.
5. **Diff classifier** — JSON Schema diff with breaking/non-breaking classification.
6. **PR generator** — template-based fix suggestions for Stripe-specific diff patterns.
7. **Coverage reporter** — per-call-site status, surfaced in PR comment or status check.
8. **Scheduler** — cron-like re-probing. Start with manual trigger, then add scheduled runs.

---

## 8. What to instrument from day one

Logging that will save you weeks of debugging:

- Every call site discovered (file, line, method, inferred endpoint)
- Every probe run: command, duration, exit code, traffic captured count
- Every drift event: diff summary, confidence score, whether a PR was opened
- PR lifecycle: opened → merged/closed, time-to-merge, time-to-close
- False positive signals: PR opened but customer comments "not a real issue"

This data is also your YC demo gold — "we detected 12 drifts across 8 design partners, 10 of which were real, here's the PRs."
