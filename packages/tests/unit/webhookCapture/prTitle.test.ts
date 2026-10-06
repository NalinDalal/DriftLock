import { describe, expect, test } from "bun:test";
import { buildWebhookPRTitle } from "@driftlock/webhookCapture/prCreator";
import type { DriftAlert } from "@driftlock/webhookCapture/driftDetector";

function alert(): DriftAlert {
    return {
        endpointId: "stripe",
        eventType: "payment_intent.succeeded",
        diff: { added: ["data.object.payment_method"], removed: ["data.object.source"], typeChanged: [] },
        previous: {},
        current: {},
    } as unknown as DriftAlert;
}

describe("buildWebhookPRTitle honesty", () => {
    test("comment-out (custom) work is titled Flag, never Fix", () => {
        const title = buildWebhookPRTitle(alert(), [
            { kind: "custom", field: "data.object.source", description: "", template: "", confidence: "high" },
        ]);
        expect(title).toMatch(/^driftlock: Flag /);
        expect(title).not.toMatch(/Fix/);
    });

    test("rename work keeps the Rename title", () => {
        const title = buildWebhookPRTitle(alert(), [
            { kind: "field_rename", field: "source", from: "source", to: "payment_method", description: "", template: "", confidence: "high" },
        ]);
        expect(title).toMatch(/^driftlock: Rename /);
    });
});
