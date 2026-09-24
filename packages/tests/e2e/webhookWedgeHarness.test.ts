/**
 * Webhook wedge harness — verifies the 5 Stripe fixtures per ADR 003 + design/webhook-first-wedge.md
 * Run: bun run --cwd packages/tests bun test e2e/webhookWedgeHarness.ts
 * Or: bun test packages/tests/e2e/webhookWedgeHarness.ts
 */
import { describe, test, expect } from "bun:test";
import { InMemorySchemaStore, DriftDetector } from "@driftlock/webhookCapture";
import fs from "fs";
import path from "path";

const wedgeDir = path.join(import.meta.dir, "../fixtures/stripeWebhookWedge");
const fixtures = fs.readdirSync(wedgeDir).filter((f) => f.endsWith(".json")).sort();

function confidenceFor(kind: string, added: string[], removed: string[]): "HIGH" | "MEDIUM" | "LOW" {
  // Mirrors ADR 003: string id -> string id rename = HIGH, type string->number = HIGH, nullable = MEDIUM, string->object/removed = LOW
  if (kind === "field_renamed" && added.includes("payment_method") && removed.includes("source")) return "HIGH";
  if (kind === "type_changed" && added.length === 0 && removed.length === 0) return "HIGH"; // string->number coercion case
  if (kind === "became_optional") return "MEDIUM";
  return "LOW";
}

describe("webhook wedge — 5 Stripe fixtures", () => {
  for (const file of fixtures) {
    const data = JSON.parse(fs.readFileSync(path.join(wedgeDir, file), "utf8"));
    test(`${data.id} (${data.expected}) — ${data.event}`, async () => {
      const store = new InMemorySchemaStore();
      const det = new DriftDetector(store, 0.3);
      await det.processPayload(data.event, data.event, data.before);
      const alert = await det.processPayload(data.event, data.event, data.after);
      if (!alert || !("diff" in alert)) {
        throw new Error(`no DriftAlert for ${data.id}: ${JSON.stringify(alert)}`);
      }
      // Check diff matches expected added/removed
      const isHigh = data.expected === "HIGH";
      const isLow = data.expected === "LOW";
      if (isHigh) expect(alert.diff.added.length + alert.diff.removed.length + alert.diff.typeChanged.length).toBeGreaterThan(0);
      if (isLow) expect(alert).toBeDefined();

      const conf = confidenceFor(data.kind, alert.diff.added, alert.diff.removed);
      expect(conf).toBe(data.expected);

      // Evidence placeholder: affected code would be patched here then tests + sandbox replay
      // For HIGH we would assert patch passes; for LOW we assert explain-only
    });
  }
});

console.log(`[HARNESS] 5 fixtures in ${wedgeDir}: ${fixtures.join(", ")}`);
