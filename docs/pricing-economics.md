# DriftLock Pricing Economics — Internal Notes

**Status:** Decided, pricing.tsx reflects this. Backend metering + Stripe wiring in Phase 2.

---

## 1. Unit Economics (Per AI PR)

| Item | Cost to Us | Notes |
|------|------------|-------|
| LLM calls (4-5 per PR, gemini-flash) | ~$0.05–$0.10 | 6k in + 1.5k out tokens × 4 calls |
| Infra (sandbox, DB, bandwidth) | ~$0.05 | Fixed per run |
| **Total cost per AI PR** | **~$0.10** | Conservative upper bound |

| Item | Revenue | Notes |
|------|---------|-------|
| User pays (100 credits) | $1.50 | 1000 credits = $15 fixed rate |

**Gross margin per PR: $1.40 (14x)**

---

## 2. Where the Margin Goes (Why 14x ≠ 14x Net)

### A. Stripe Fees
- 2.9% + $0.30 per successful charge
- Team plan ($99/mo): ~$3.17/mo per customer
- Scale plan ($299/mo): ~$8.97/mo per customer
- **Budget 3–4% of revenue for payment processing**

### B. Failed Runs (Credit Burn Without Revenue)
- Verify fails, PR never opens, but tokens already burned
- Estimate: 10–15% of runs fail at verify stage
- Cost: $0.10 × 0.15 = $0.015 per attempted PR (absorbed in margin)

### C. Trial Abuse
- 300 free credits = 3 AI PRs
- No card required, 14-day expiry
- Abuse vectors: multiple GitHub accounts, bot signups, throwaway emails
- Realistic: 100 trial signups → ~$10–30 cost (most do 1–2 runs)
- Conversion: ~5% trial → paid = 5 Team customers = $495/mo
- **Trial CAC: ~$20–60 per converted customer** (acceptable)

### D. Fixed Burn
- 4-person team: ~$4,000/mo (salary + benefits)
- Infra baseline: ~$500/mo (DB, CI, monitoring, domain, email)
- **Total fixed burn: ~$4,500/mo**

---

## 3. Break-Even Math

| Plan | Monthly Revenue | Variable Cost (est.) | Contribution |
|------|-----------------|----------------------|--------------|
| Starter ($29) | $29 | $5–8 | ~$21–24 |
| **Team ($99)** | **$99** | **$5–8** | **~$91–94** |
| Scale ($299) | $299 | $10–15 | ~$284–289 |

**Team plan is the hero.**
- 1 Team customer ≈ $92 contribution margin
- **50 Team customers = $4,600/mo = break-even**
- 50+ = profitable

Starter exists as funnel → upgrade to Team. Scale is upside.

---

## 4. Credit Design Rationale

- **Fixed rate: 1000 credits = $15** (no volume discounts, no per-model pricing)
- User thinks in PRs, not credits → UI shows "~70 AI PRs" not "7,000 credits"
- Credits reset monthly, no rollover (simplifies accounting, prevents hoarding)
- Overage: $15 per 1000 credits (same rate, auto-charge)

---

## 5. What User Sees (No Token/$$ Confusion)

| Screen | Message |
|--------|---------|
| Dashboard | `🪙 240 / 300 credits` |
| PR opened toast | `Fix PR opened · -100 credits · 240 left` |
| 4th run (trial) | `Out of credits. 3/3 trial PRs used. Upgrade to continue → /pricing` |
| /pricing | Dollars, credits, AND "~N AI PRs" all three shown |

---

## 6. Phase 2 Work (Kill BYOK)

- `actions.tsx:19-67` — still shows model/provider picker → remove
- `settings.tsx` — still shows API key input → remove
- Backend metering: track `cost_cents` per run for training guide
- Stripe: subscription + usage-based overage billing
- Webhook: `invoice.payment_failed` → pause runs, email user

---

## 7. Key Decisions Logged

| Date | Decision | By |
|------|----------|----|
| 2026-10-13 | Credit model: Scan 10, Detect 20, PR 100. $15/1000. 300 free trial. | Nalin |
| 2026-10-13 | No BYOK in UI. Provider/model picker removed from wizard. | Nalin |
| 2026-10-13 | Team $99 is hero plan. Break-even at 50 Team customers. | Nalin |

---

## 8. Training Guide (Future)

When metering is live, populate with real `cost_cents` per run:

| Model | Avg Input Tokens | Avg Output Tokens | Cost/PR (est.) |
|-------|------------------|-------------------|----------------|
| gemini-flash | 6,000 | 1,500 | $0.06 |
| gemini-pro | 6,000 | 1,500 | $0.18 |
| sonnet | 6,000 | 1,500 | $0.22 |
| gpt-4o-mini | 6,000 | 1,500 | $0.08 |

Use this to tune credit costs if model mix shifts.