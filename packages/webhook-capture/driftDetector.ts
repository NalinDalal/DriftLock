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
}

export type DriftHandler = (alert: DriftAlert) => void | Promise<void>;

export class DriftDetector {
    private handlers: DriftHandler[] = [];

    constructor(private store: SchemaStore) {}

    onDrift(handler: DriftHandler): void {
        this.handlers.push(handler);
    }

    async processPayload(
        endpointId: string,
        eventType: string,
        payload: Record<string, unknown>,
    ): Promise<DriftAlert | null> {
        const current = flattenPayload(payload);
        const previous = await this.store.load(endpointId, eventType);

        if (!previous) {
            await this.store.save(endpointId, eventType, current);
            return null;
        }

        const diff = diffSchemas(previous, current);

        if (isSchemaDiffEmpty(diff)) {
            return null;
        }

        const alert: DriftAlert = {
            endpointId,
            eventType,
            diff,
            previous,
            current,
            detectedAt: new Date(),
        };

        await this.store.save(endpointId, eventType, current);

        for (const handler of this.handlers) {
            await handler(alert);
        }

        return alert;
    }
}
