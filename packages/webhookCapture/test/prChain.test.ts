import { describe, expect, test, mock } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { InMemorySchemaStore } from "../schemaStore";
import { DriftDetector } from "../driftDetector";
import { flattenPayload } from "../schemaFlattener";
import { diffSchemas } from "../schemaDiff";
import { isValidAIFix } from "../prCreator";

function tmpRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "driftlock-webhook-pr-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    return dir;
}

describe("AI fix syntax validation", () => {
    const rename = {
        kind: "field_rename" as const,
        field: "source",
        from: "source",
        to: "payment_method",
        description: "Rename source to payment_method",
        template: "rename",
        confidence: "high" as const,
    };

    for (const [filePath, code] of [
        ["handler.ts", 'import type { Payment } from "./types"; export const id = (payment: Payment) => payment.payment_method as string;'],
        ["handler.tsx", 'export const View = ({ payment }: { payment: any }) => <div>{payment.payment_method}</div>;'],
        ["handler.jsx", 'export const View = ({ payment }) => <div>{payment.payment_method}</div>;'],
        ["handler.js", 'export const id = payment.payment_method;'],
        ["handler.mjs", 'import payment from "./payment.mjs"; export const id = payment.payment_method;'],
        ["handler.cjs", 'module.exports = payment.payment_method;'],
    ]) {
        test(`accepts valid source in ${filePath}`, () => {
            expect(isValidAIFix(code, [rename], "const id = payment.source;", filePath)).toBe(true);
        });
    }

    test("rejects malformed source and TypeScript in a JavaScript file", () => {
        expect(isValidAIFix("export const id = (", [], "original", "handler.ts")).toBe(false);
        expect(isValidAIFix("export const id: string = 'pm_123';", [], "original", "handler.js")).toBe(false);
    });

    test("keeps semantic and unchanged-source guards", () => {
        const code = "export const id = payment.source;";
        expect(isValidAIFix(code, [rename], "original", "handler.ts")).toBe(false);
        expect(isValidAIFix("export const id = payment.other;", [rename], code, "handler.ts")).toBe(false);
        expect(isValidAIFix(code, [], code, "handler.ts")).toBe(false);
    });

    test("does not execute generated code", () => {
        expect(isValidAIFix('throw new Error("must not execute");', [], "original", "handler.js")).toBe(true);
    });
});

describe("Webhook drift → fix chain (unit)", () => {
    test("flatten → diff → detect → works generation", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("stripe", "payment_intent.succeeded", {
            id: "pi_123",
            amount: 2000,
            source: "tok_visa",
        });

        const alert = await detector.processPayload(
            "stripe",
            "payment_intent.succeeded",
            {
                id: "pi_123",
                amount: 2000,
                payment_method: "pm_123",
            },
        );

        expect(alert).not.toBeNull();
        expect(alert!.diff.added).toContain("payment_method");
        expect(alert!.diff.removed).toContain("source");
    });

    test("generates fix works from schema diff", async () => {
        const previous = flattenPayload({
            amount: 2000,
            source: "tok_visa",
        });
        const current = flattenPayload({
            amount: 2000,
            payment_method: "pm_123",
        });

        const diff = diffSchemas(previous, current);
        expect(diff.removed).toEqual(["source"]);
        expect(diff.added).toEqual(["payment_method"]);
    });

    test("applies field rename fix to source code", async () => {
        const { applyFixWork } = await import("@driftlock/diff");

        const source = `
const charge = await stripe.charges.create({
    amount: 2000,
    source: "tok_visa",
});
return charge.source;
`;

        const work = {
            kind: "field_rename" as const,
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename source to payment_method",
            template: "rename source to payment_method",
            confidence: "high" as const,
        };

        const fixed = applyFixWork(work, source);
        expect(fixed).not.toBeNull();
        expect(fixed).toContain("payment_method: \"tok_visa\"");
        expect(fixed).not.toContain("source: \"tok_visa\"");
        expect(fixed).toContain("charge.payment_method");
    });

    test("scans repo for affected files containing old field", () => {
        const repo = tmpRepo();
        writeFileSync(
            join(repo, "src", "handler.ts"),
            `
export function handlePayment(event: any) {
    const id = event.data.object.source;
    return id;
}
`,
        );
        writeFileSync(
            join(repo, "src", "unrelated.ts"),
            `
export const source = "constant";
`,
        );

        const affectedFiles: string[] = [];
        const files = require("fs").readdirSync(repo, { recursive: true });
        for (const file of files) {
            if (typeof file !== "string") continue;
            if (!/\.(ts|tsx|js)$/.test(file)) continue;
            if (file.includes("node_modules")) continue;
            const content = readFileSync(join(repo, file), "utf8");
            if (/\bsource\b/.test(content)) {
                affectedFiles.push(file);
            }
        }

        expect(affectedFiles).toContain("src/handler.ts");
        expect(affectedFiles).toContain("src/unrelated.ts");
    });

    test("end-to-end: detect drift then apply fix to repo", async () => {
        const repo = tmpRepo();
        writeFileSync(
            join(repo, "src", "stripe-handler.ts"),
            `
import Stripe from "stripe";
const stripe = new Stripe("sk_test");

export async function createCharge(amount: number) {
    const result = await stripe.charges.create({
        amount,
        source: "tok_visa",
    });
    return result.source;
}
`,
        );

        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        const alert = await detector.processPayload(
            "stripe",
            "charge.created",
            {
                amount: 2000,
                payment_method: "pm_123",
            },
        );

        expect(alert).not.toBeNull();

        const { applyFixWork } = await import("@driftlock/diff");
        const source = readFileSync(
            join(repo, "src", "stripe-handler.ts"),
            "utf8",
        );

        const renameWork = {
            kind: "field_rename" as const,
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename source to payment_method",
            template: "rename",
            confidence: "high" as const,
        };

        const fixed = applyFixWork(renameWork, source);
        expect(fixed).not.toBeNull();
        expect(fixed).toContain("payment_method: \"tok_visa\"");
        expect(fixed).not.toContain("source: \"tok_visa\"");
        expect(fixed).toContain("result.payment_method");
    });
});
