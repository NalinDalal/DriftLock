# OpenAPI Diff Strategies

**Status:** Reference material. Most v1 vendors won't have OpenAPI specs.

## How vendors handle specs today

| Vendor tier | Spec availability | Driftlock approach |
|-------------|-------------------|--------------------|
| Mature (Stripe, Twilio) | Official OpenAPI spec published | Can diff against published spec as secondary signal |
| Mid-stage (most SaaS) | No spec, but versioned API | Rely entirely on inferred spec from customer usage |
| Early-stage | No spec, no versioning | Rely entirely on inferred spec from customer usage |

## Why we don't depend on vendor specs

- Most early-stage vendors (our target market) don't publish specs.
- Even published specs drift from the actual API behavior.
- Our inferred-spec approach works regardless of vendor maturity.
- Vendor specs are a bonus signal, not a requirement.

## Diff strategies we may use

- **JSON Schema diff** — if we normalize captured payloads to JSON Schema, diffing is straightforward (added/removed fields, type changes, required vs optional).
- **Structural diff** — compare raw JSON shapes without full schema normalization. Simpler but noisier.
- **Semantic diff** — use an LLM to interpret whether a schema change is breaking, non-breaking, or additive. Higher accuracy but higher latency and cost.
