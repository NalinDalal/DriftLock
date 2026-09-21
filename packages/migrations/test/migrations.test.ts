import { describe, expect, test } from "bun:test";
import {
    generateMigrationPlan,
    getNextStep,
    completeStep,
    failStep,
    getStepDiffForMigration,
    type MigrationPlan,
    type MigrationStep,
} from "../index";
import type { ShapeDiffResult } from "@driftlock/diff";

function makeDiff(overrides: Partial<ShapeDiffResult> = {}): ShapeDiffResult {
    return {
        addedFields: [],
        removedFields: [],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        confidence: "high",
        changes: [],
        ...overrides,
    };
}

describe("generateMigrationPlan", () => {
    test("creates plan with single rename step", () => {
        const diff = makeDiff({
            changes: [
                {
                    kind: "request_renamed",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                },
            ],
        });

        const plan = generateMigrationPlan(diff, "stripe", "charge.created");

        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0].type).toBe("rename");
        expect(plan.steps[0].field).toBe("source");
        expect(plan.steps[0].from).toBe("source");
        expect(plan.steps[0].to).toBe("payment_method");
        expect(plan.status).toBe("pending");
    });

    test("creates plan with multiple independent steps", () => {
        const diff = makeDiff({
            changes: [
                {
                    kind: "request_renamed",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                },
                {
                    kind: "field_removed",
                    field: "old_field",
                },
            ],
        });

        const plan = generateMigrationPlan(diff, "stripe", "charge.created");

        expect(plan.steps).toHaveLength(2);
        expect(plan.steps[0].status).toBe("pending");
        expect(plan.steps[1].status).toBe("pending");
    });

    test("orders dependent steps correctly", () => {
        const diff = makeDiff({
            changes: [
                {
                    kind: "type_changed",
                    field: "amount",
                    oldType: "string",
                    newType: "number",
                },
                {
                    kind: "request_renamed",
                    field: "amount",
                    from: "amount",
                    to: "value",
                },
            ],
        });

        const plan = generateMigrationPlan(diff, "stripe", "charge.created");

        expect(plan.steps).toHaveLength(2);
        const renameStep = plan.steps.find((s) => s.type === "rename");
        const typeStep = plan.steps.find((s) => s.type === "type_change");
        expect(renameStep).toBeDefined();
        expect(typeStep).toBeDefined();
    });

    test("generates unique plan id", () => {
        const diff = makeDiff({
            changes: [
                {
                    kind: "request_renamed",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                },
            ],
        });

        const plan1 = generateMigrationPlan(diff, "stripe", "charge.created");
        const plan2 = generateMigrationPlan(diff, "twilio", "message.sent");

        expect(plan1.id).not.toBe(plan2.id);
    });
});

describe("getNextStep", () => {
    test("returns first step with no dependencies", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "pending",
                },
                {
                    id: "step-2",
                    order: 2,
                    description: "Change amount type",
                    type: "type_change",
                    field: "amount",
                    oldType: "string",
                    newType: "number",
                    dependencies: ["step-1"],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "pending",
        };

        const next = getNextStep(plan);
        expect(next).not.toBeNull();
        expect(next!.id).toBe("step-1");
    });

    test("returns dependent step when dependency is complete", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "completed",
                    prNumber: 123,
                    prUrl: "https://github.com/test/pr/123",
                },
                {
                    id: "step-2",
                    order: 2,
                    description: "Change amount type",
                    type: "type_change",
                    field: "amount",
                    oldType: "string",
                    newType: "number",
                    dependencies: ["step-1"],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "in_progress",
        };

        const next = getNextStep(plan);
        expect(next).not.toBeNull();
        expect(next!.id).toBe("step-2");
    });

    test("returns null when all steps complete", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "completed",
                    prNumber: 123,
                    prUrl: "https://github.com/test/pr/123",
                },
            ],
            createdAt: new Date(),
            completedAt: new Date(),
            status: "completed",
        };

        const next = getNextStep(plan);
        expect(next).toBeNull();
    });

    test("skips steps with failed dependencies", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "failed",
                },
                {
                    id: "step-2",
                    order: 2,
                    description: "Change amount type",
                    type: "type_change",
                    field: "amount",
                    oldType: "string",
                    newType: "number",
                    dependencies: ["step-1"],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "failed",
        };

        const next = getNextStep(plan);
        expect(next).toBeNull();
    });
});

describe("completeStep", () => {
    test("marks step as completed", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "pending",
        };

        completeStep(plan, "step-1", 123, "https://github.com/test/pr/123");

        expect(plan.steps[0].status).toBe("completed");
        expect(plan.steps[0].prNumber).toBe(123);
        expect(plan.steps[0].prUrl).toBe("https://github.com/test/pr/123");
        expect(plan.status).toBe("completed");
        expect(plan.completedAt).toBeDefined();
    });

    test("marks plan as in_progress when steps remain", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "pending",
                },
                {
                    id: "step-2",
                    order: 2,
                    description: "Change amount type",
                    type: "type_change",
                    field: "amount",
                    oldType: "string",
                    newType: "number",
                    dependencies: ["step-1"],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "pending",
        };

        completeStep(plan, "step-1", 123, "https://github.com/test/pr/123");

        expect(plan.status).toBe("in_progress");
        expect(plan.completedAt).toBeUndefined();
    });

    test("throws for non-existent step", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [],
            createdAt: new Date(),
            status: "pending",
        };

        expect(() => completeStep(plan, "nonexistent", 123, "url")).toThrow(
            "Step nonexistent not found",
        );
    });
});

describe("failStep", () => {
    test("marks step and plan as failed", () => {
        const plan: MigrationPlan = {
            id: "test",
            endpointId: "stripe",
            eventType: "charge.created",
            steps: [
                {
                    id: "step-1",
                    order: 1,
                    description: "Rename source to payment_method",
                    type: "rename",
                    field: "source",
                    from: "source",
                    to: "payment_method",
                    dependencies: [],
                    status: "pending",
                },
            ],
            createdAt: new Date(),
            status: "pending",
        };

        failStep(plan, "step-1");

        expect(plan.steps[0].status).toBe("failed");
        expect(plan.status).toBe("failed");
    });
});

describe("getStepDiffForMigration", () => {
    test("generates diff for rename step", () => {
        const step: MigrationStep = {
            id: "step-1",
            order: 1,
            description: "Rename source to payment_method",
            type: "rename",
            field: "source",
            from: "source",
            to: "payment_method",
            dependencies: [],
            status: "pending",
        };

        const diff = getStepDiffForMigration(step);
        expect(diff.addedFields).toEqual(["payment_method"]);
        expect(diff.removedFields).toEqual(["source"]);
    });

    test("generates diff for type change step", () => {
        const step: MigrationStep = {
            id: "step-1",
            order: 1,
            description: "Change amount type",
            type: "type_change",
            field: "amount",
            oldType: "string",
            newType: "number",
            dependencies: [],
            status: "pending",
        };

        const diff = getStepDiffForMigration(step);
        expect(diff.typeChanges).toEqual([
            { field: "amount", oldType: "string", newType: "number" },
        ]);
    });

    test("generates diff for add field step", () => {
        const step: MigrationStep = {
            id: "step-1",
            order: 1,
            description: "Add required field",
            type: "add_field",
            field: "billing_details",
            dependencies: [],
            status: "pending",
        };

        const diff = getStepDiffForMigration(step);
        expect(diff.addedFields).toEqual(["billing_details"]);
    });

    test("generates diff for remove field step", () => {
        const step: MigrationStep = {
            id: "step-1",
            order: 1,
            description: "Remove old field",
            type: "remove_field",
            field: "deprecated_field",
            dependencies: [],
            status: "pending",
        };

        const diff = getStepDiffForMigration(step);
        expect(diff.removedFields).toEqual(["deprecated_field"]);
    });
});
