import type { FlatSchema } from "./schemaFlattener";
import { flattenPayload } from "./schemaFlattener";
import { diffSchemas, isSchemaDiffEmpty, type SchemaDiff } from "./schemaDiff";
import type { SchemaStore } from "./schemaStore";

export interface DriftAlert {
    endpointId: string;
    eventType: string;
    diff: SchemaDiff;
    previous: FlatSchema;
    current: FlatSchema;
    detectedAt: Date;
    confidence: number;
}

export interface RollbackAlert {
    endpointId: string;
    eventType: string;
    revertedTo: FlatSchema;
    revertedFrom: FlatSchema;
    detectedAt: Date;
    driftedAt: Date;
}

export type DriftHandler = (alert: DriftAlert) => void | Promise<void>;
export type RollbackHandler = (alert: RollbackAlert) => void | Promise<void>;

function calculateConfidence(diff: SchemaDiff): number {
    let score = 50;

    const totalChanges =
        diff.added.length + diff.removed.length + diff.typeChanged.length;

    if (totalChanges === 0) return 0;
    if (totalChanges === 1) score += 20;
    if (totalChanges <= 3) score += 10;

    if (diff.removed.length > 0) score += 15;
    if (diff.added.length > 0) score += 10;
    if (diff.typeChanged.length > 0) score += 5;

    const hasUncertain = diff.typeChanged.some(
        (c) => c.from === "unknown" || c.to === "unknown",
    );
    if (hasUncertain) score -= 20;

    return Math.max(0, Math.min(100, score));
}

function schemasEqual(a: FlatSchema, b: FlatSchema): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
}

export class DriftDetector {
    private handlers: DriftHandler[] = [];
    private rollbackHandlers: RollbackHandler[] = [];
    private confidenceThreshold: number;

    constructor(store: SchemaStore, confidenceThreshold = 0) {
        this.store = store;
        this.confidenceThreshold = confidenceThreshold;
    }

    private store: SchemaStore;

    onDrift(handler: DriftHandler): void {
        this.handlers.push(handler);
    }

    onRollback(handler: RollbackHandler): void {
        this.rollbackHandlers.push(handler);
    }

    async processPayload(
        endpointId: string,
        eventType: string,
        payload: Record<string, unknown>,
    ): Promise<DriftAlert | RollbackAlert | null> {
        const current = flattenPayload(payload);
        const previous = await this.store.load(endpointId, eventType);

        if (!previous) {
            await this.store.save(endpointId, eventType, current);
            return null;
        }

        if (schemasEqual(previous, current)) {
            return null;
        }

        const history = await this.store.getHistory(endpointId, eventType, 20);

        for (const snapshot of history) {
            if (
                snapshot.schema &&
                schemasEqual(snapshot.schema, current) &&
                !schemasEqual(snapshot.schema, previous)
            ) {
                const rollback: RollbackAlert = {
                    endpointId,
                    eventType,
                    revertedTo: current,
                    revertedFrom: previous,
                    detectedAt: new Date(),
                    driftedAt: snapshot.capturedAt,
                };

                await this.store.save(endpointId, eventType, current);

                for (const handler of this.rollbackHandlers) {
                    await handler(rollback);
                }

                return rollback;
            }
        }

        const diff = diffSchemas(previous, current);

        if (isSchemaDiffEmpty(diff)) {
            return null;
        }

        const confidence = calculateConfidence(diff);

        const alert: DriftAlert = {
            endpointId,
            eventType,
            diff,
            previous,
            current,
            detectedAt: new Date(),
            confidence,
        };

        await this.store.save(endpointId, eventType, current);

        if (confidence < this.confidenceThreshold) {
            return null;
        }

        for (const handler of this.handlers) {
            await handler(alert);
        }

        return alert;
    }
}
