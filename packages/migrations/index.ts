import type { ShapeDiffResult, TypeChange } from "@driftlock/diff";

export interface MigrationStep {
    id: string;
    order: number;
    description: string;
    type: "rename" | "type_change" | "add_field" | "remove_field" | "restructure";
    field: string;
    from?: string;
    to?: string;
    oldType?: string;
    newType?: string;
    dependencies: string[];
    status: "pending" | "in_progress" | "completed" | "failed";
    prNumber?: number;
    prUrl?: string;
}

export interface MigrationPlan {
    id: string;
    endpointId: string;
    eventType: string;
    steps: MigrationStep[];
    createdAt: Date;
    completedAt?: Date;
    status: "pending" | "in_progress" | "completed" | "failed";
}

function generateStepId(field: string, type: string): string {
    return `${type}::${field}`.replace(/[^a-zA-Z0-9::]/g, "-");
}

function analyzeDependencies(
    diff: ShapeDiffResult,
): Map<string, string[]> {
    const deps = new Map<string, string[]>();

    for (const change of diff.changes) {
        const stepId = generateStepId(change.field, change.kind);
        const stepDeps: string[] = [];

        if (change.kind === "type_changed") {
            const renameId = generateStepId(change.field, "request_renamed");
            if (diff.changes.some((c) => c.kind === "request_renamed" && c.field === change.field)) {
                stepDeps.push(renameId);
            }
        }

        if (change.kind === "field_removed") {
            const typeChanges = diff.changes.filter(
                (c) => c.kind === "type_changed" && c.field === change.field,
            );
            for (const tc of typeChanges) {
                stepDeps.push(generateStepId(tc.field, tc.kind));
            }
        }

        deps.set(stepId, stepDeps);
    }

    return deps;
}

function topologicalSort(steps: MigrationStep[], deps: Map<string, string[]>): MigrationStep[] {
    const sorted: MigrationStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(id: string) {
        if (visited.has(id)) return;
        if (visiting.has(id)) {
            throw new Error(`Circular dependency detected: ${id}`);
        }
        visiting.add(id);

        const stepDeps = deps.get(id) ?? [];
        for (const dep of stepDeps) {
            visit(dep);
        }

        visiting.delete(id);
        visited.add(id);

        const step = steps.find((s) => s.id === id);
        if (step) {
            sorted.push(step);
        }
    }

    for (const step of steps) {
        visit(step.id);
    }

    return sorted;
}

export function generateMigrationPlan(
    diff: ShapeDiffResult,
    endpointId: string,
    eventType: string,
): MigrationPlan {
    const steps: MigrationStep[] = [];
    const deps = analyzeDependencies(diff);

    let order = 1;

    for (const change of diff.changes) {
        const id = generateStepId(change.field, change.kind);
        let step: MigrationStep;

        switch (change.kind) {
            case "request_renamed":
                step = {
                    id,
                    order: order++,
                    description: `Rename '${change.from}' to '${change.to}'`,
                    type: "rename",
                    field: change.field,
                    from: change.from,
                    to: change.to,
                    dependencies: deps.get(id) ?? [],
                    status: "pending",
                };
                break;

            case "type_changed":
                step = {
                    id,
                    order: order++,
                    description: `Change '${change.field}' from ${change.oldType} to ${change.newType}`,
                    type: "type_change",
                    field: change.field,
                    oldType: change.oldType,
                    newType: change.newType,
                    dependencies: deps.get(id) ?? [],
                    status: "pending",
                };
                break;

            case "request_added":
                step = {
                    id,
                    order: order++,
                    description: `Add required field '${change.field}'`,
                    type: "add_field",
                    field: change.field,
                    dependencies: deps.get(id) ?? [],
                    status: "pending",
                };
                break;

            case "field_removed":
                step = {
                    id,
                    order: order++,
                    description: `Remove field '${change.field}'`,
                    type: "remove_field",
                    field: change.field,
                    dependencies: deps.get(id) ?? [],
                    status: "pending",
                };
                break;

            default:
                continue;
        }

        steps.push(step);
    }

    const sorted = topologicalSort(steps, deps);
    sorted.forEach((s, i) => {
        s.order = i + 1;
    });

    const plan: MigrationPlan = {
        id: `migration-${endpointId}-${eventType}-${Date.now()}`,
        endpointId,
        eventType,
        steps: sorted,
        createdAt: new Date(),
        status: "pending",
    };

    return plan;
}

export function getNextStep(plan: MigrationPlan): MigrationStep | null {
    for (const step of plan.steps) {
        if (step.status !== "pending") continue;

        const depsComplete = step.dependencies.every((depId) => {
            const dep = plan.steps.find((s) => s.id === depId);
            return dep?.status === "completed";
        });

        if (depsComplete) {
            return step;
        }
    }
    return null;
}

export function completeStep(
    plan: MigrationPlan,
    stepId: string,
    prNumber: number,
    prUrl: string,
): void {
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) {
        throw new Error(`Step ${stepId} not found`);
    }

    step.status = "completed";
    step.prNumber = prNumber;
    step.prUrl = prUrl;

    const allComplete = plan.steps.every((s) => s.status === "completed");
    if (allComplete) {
        plan.status = "completed";
        plan.completedAt = new Date();
    } else {
        plan.status = "in_progress";
    }
}

export function failStep(plan: MigrationPlan, stepId: string): void {
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) {
        throw new Error(`Step ${stepId} not found`);
    }

    step.status = "failed";
    plan.status = "failed";
}

export function getStepDiffForMigration(
    step: MigrationStep,
): Partial<ShapeDiffResult> {
    switch (step.type) {
        case "rename":
            return {
                addedFields: step.to ? [step.to] : [],
                removedFields: step.from ? [step.from] : [],
                typeChanges: [],
            };

        case "type_change":
            return {
                addedFields: [],
                removedFields: [],
                typeChanges: step.oldType && step.newType
                    ? [{ field: step.field, oldType: step.oldType, newType: step.newType }]
                    : [],
            };

        case "add_field":
            return {
                addedFields: [step.field],
                removedFields: [],
                typeChanges: [],
            };

        case "remove_field":
            return {
                addedFields: [],
                removedFields: [step.field],
                typeChanges: [],
            };

        default:
            return { addedFields: [], removedFields: [], typeChanges: [] };
    }
}
