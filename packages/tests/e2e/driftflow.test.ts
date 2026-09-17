import { describe, expect, test } from "bun:test";
import { TypeScriptExtractor } from "@driftlock/parser";
import { STRIPE_VENDOR } from "@driftlock/core";
import { PRGenerator } from "@driftlock/git";
import type { DiffSummary, DriftEvent, Fix } from "@driftlock/core";
import {
    applyFixWork,
    diffShapes,
    fixWorksForDiff,
    inferShape,
    type FixWork,
    type Shape,
    type ShapeDiffResult,
} from "@driftlock/diff";

interface VendorCapture {
    request: unknown;
    response: unknown;
}

interface DetectedDrift {
    diff: ShapeDiffResult;
    works: FixWork[];
}

const CALL_SITE_CODE = `
const result = await stripe.charges.create({
    amount: 2000,
    currency: "usd",
    source: "tok_visa",
});
return result.status;
`;

function shapeOf(payload: unknown): Shape {
    const node = inferShape(payload);
    if (node.kind !== "object" || !node.properties) {
        throw new Error("shapeOf expects an object payload");
    }
    return node.properties;
}

class InMemorySnapshotStore {
    private snapshots = new Map<string, { request: Shape; response: Shape }>();

    save(callSiteId: string, request: Shape, response: Shape) {
        this.snapshots.set(callSiteId, { request, response });
    }

    latest(callSiteId: string) {
        return this.snapshots.get(callSiteId) ?? null;
    }
}

class FakeProbe {
    constructor(private captures: VendorCapture[]) {}

    capture() {
        return this.captures.shift() as VendorCapture;
    }
}

function detectDrift(
    callSiteId: string,
    probe: FakeProbe,
    store: InMemorySnapshotStore,
): DetectedDrift | null {
    const capture = probe.capture();
    const requestShape = shapeOf(capture.request);
    const responseShape = shapeOf(capture.response);

    const previous = store.latest(callSiteId);
    if (!previous) {
        store.save(callSiteId, requestShape, responseShape);
        return null;
    }

    const requestDiff = diffShapes(previous.request, requestShape, {
        direction: "request",
    });
    const responseDiff = diffShapes(previous.response, responseShape);

    const breaking =
        requestDiff.breakingChanges.concat(responseDiff.breakingChanges);
    if (breaking.length === 0) {
        return null;
    }

    const works = [
        ...fixWorksForDiff(requestDiff),
        ...fixWorksForDiff(responseDiff),
    ];

    return { diff: requestDiff, works };
}

function buildFix(
    driftEventId: string,
    works: FixWork[],
    primary: FixWork,
    source: string,
) {
    const combined = works.reduce<string>(
        (acc, work) => applyFixWork(work, acc) ?? acc,
        source,
    );
    const fix: Fix = {
        id: "fix_1",
        driftEventId,
        type: primary.kind,
        description: primary.description,
        diff: `- ${primary.from}: "tok_visa"\n+ ${primary.to}: "tok_visa"`,
        confidence: primary.confidence,
        files: [{ path: "src/payments.ts", changes: combined }],
        generatedAt: new Date(),
    };
    return fix;
}

describe("E2E: drift detection pipeline", () => {
    test("capture -> snapshot -> schema diff -> fix -> PR flags a real drift", async () => {
        const extractor = new TypeScriptExtractor({ vendors: [STRIPE_VENDOR] });
        const { callSites } = await extractor.extractFromFile(
            "src/payments.ts",
            CALL_SITE_CODE,
        );
        expect(callSites).toHaveLength(1);
        const callSite = callSites[0];
        expect(callSite.method).toBe("stripe.charges.create");
        expect(callSite.endpoint).toBe("/v1/charges");
        expect(callSite.httpMethod).toBe("POST");

        const store = new InMemorySnapshotStore();
        const probe = new FakeProbe([
            {
                request: { amount: 2000, currency: "usd", source: "tok_visa" },
                response: {
                    id: "ch_1",
                    status: "succeeded",
                    balance_transaction: "txn_1",
                },
            },
            {
                request: { amount: 2000, currency: "usd", payment_method: "pm_1" },
                response: {
                    id: "ch_2",
                    status: null,
                    balance_transaction: "txn_1",
                    fee: 30,
                },
            },
        ]);

        const first = detectDrift(callSite.id, probe, store);
        expect(first).toBeNull();

        const drift = detectDrift(callSite.id, probe, store);
        expect(drift).not.toBeNull();
        const detected = drift as DetectedDrift;

        expect(detected.works).toHaveLength(2);
        const kinds = detected.works.map((w) => w.kind).sort();
        expect(kinds).toEqual(["field_rename", "null_check"]);

        const rename = detected.works.find((w) => w.kind === "field_rename");
        expect(rename?.from).toBe("source");
        expect(rename?.to).toBe("payment_method");

        const diffSummary: DiffSummary = {
            addedFields: detected.diff.addedFields,
            removedFields: detected.diff.removedFields,
            typeChanges: detected.diff.typeChanges,
            optionalityChanges: detected.diff.optionalityChanges,
            breakingChanges: detected.diff.breakingChanges,
            nonBreakingChanges: detected.diff.nonBreakingChanges,
        };
        expect(diffSummary.breakingChanges).toContain(
            "Renamed request parameter 'source' to 'payment_method'",
        );

        const event: DriftEvent = {
            id: "de_1",
            callSiteId: callSite.id,
            detectedAt: new Date(),
            oldSnapshotId: "snap_1",
            newSnapshotId: "snap_2",
            diffSummary,
            suggestedFix: null,
            confidence: detected.diff.confidence,
            prNumber: null,
            status: "detected",
        };
        expect(event.confidence).toBe("high");
        expect(event.status).toBe("detected");

        const fix = buildFix(
            event.id,
            detected.works,
            detected.works[0],
            CALL_SITE_CODE,
        );
        event.suggestedFix = fix;
        event.status = "fix_generated";
        expect(fix.type).toBe("field_rename");

        const changes = fix.files[0].changes;
        expect(changes).toContain("payment_method: \"tok_visa\"");
        expect(changes).not.toContain("source: \"tok_visa\"");
        expect(changes).toContain('result.status ?? ""');

        let pullRequestsCreated = 0;
        let prTitle = "";
        const octokitStub = {
            rest: {
                git: {
                    getRef: async () => ({
                        data: { object: { sha: "abc123" } },
                    }),
                    createRef: async () => ({ data: {} }),
                },
                repos: {
                    getContent: async () => {
                        throw new Error("file not found");
                    },
                    createOrUpdateFileContents: async () => ({ data: {} }),
                },
                pulls: {
                    create: async ({
                        title,
                    }: {
                        title: string;
                    }) => {
                        pullRequestsCreated += 1;
                        prTitle = title;
                        return {
                            data: {
                                html_url: "https://github.com/acme/payments/pull/987",
                                number: 987,
                            },
                        };
                    },
                },
            },
        } as unknown as NonNullable<
            ConstructorParameters<typeof PRGenerator>[1]
        >;

        const prGenerator = new PRGenerator("github-token", octokitStub);
        const pr = await prGenerator.createFixPR(
            "acme",
            "payments",
            { driftEvent: event, callSite, fix, files: fix.files },
            "main",
        );

        expect(pr.number).toBe(987);
        expect(pr.branch).toMatch(/^driftlock\/fix-/);
        expect(pullRequestsCreated).toBe(1);
        expect(prTitle).toContain("Rename");
        expect(prTitle).toContain("stripe.charges.create");
    });

    test("identical vendor shapes produce no drift and no PR", async () => {
        const extractor = new TypeScriptExtractor({ vendors: [STRIPE_VENDOR] });
        const { callSites } = await extractor.extractFromFile(
            "src/payments.ts",
            CALL_SITE_CODE,
        );
        const callSite = callSites[0];

        const store = new InMemorySnapshotStore();
        const probe = new FakeProbe([
            {
                request: { amount: 2000, currency: "usd", source: "tok_visa" },
                response: { id: "ch_1", status: "succeeded" },
            },
            {
                request: { amount: 2000, currency: "usd", source: "tok_visa" },
                response: { id: "ch_1", status: "succeeded" },
            },
        ]);

        const first = detectDrift(callSite.id, probe, store);
        expect(first).toBeNull();

        const second = detectDrift(callSite.id, probe, store);
        expect(second).toBeNull();

        expect(store.latest(callSite.id)).not.toBeNull();
    });

    test("first capture with no prior snapshot is skipped, not run", async () => {
        const extractor = new TypeScriptExtractor({ vendors: [STRIPE_VENDOR] });
        const { callSites } = await extractor.extractFromFile(
            "src/payments.ts",
            CALL_SITE_CODE,
        );
        const callSite = callSites[0];

        const store = new InMemorySnapshotStore();
        const probe = new FakeProbe([
            {
                request: { amount: 1 },
                response: { id: "ch_1" },
            },
        ]);

        const result = detectDrift(callSite.id, probe, store);
        expect(result).toBeNull();
        expect(store.latest(callSite.id)).not.toBeNull();
    });
});