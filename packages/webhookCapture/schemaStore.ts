import type { FlatSchema } from "./schemaFlattener";

export interface SchemaSnapshot {
    endpointId: string;
    eventType: string;
    schema: FlatSchema;
    capturedAt: Date;
}

export interface SchemaStore {
    load(endpointId: string, eventType: string): Promise<FlatSchema | null>;
    save(
        endpointId: string,
        eventType: string,
        schema: FlatSchema,
    ): Promise<void>;
    listEventTypes(endpointId: string): Promise<string[]>;
    getHistory(
        endpointId: string,
        eventType: string,
        limit?: number,
    ): Promise<SchemaSnapshot[]>;
}

export class InMemorySchemaStore implements SchemaStore {
    private store = new Map<string, FlatSchema>();
    private history = new Map<string, SchemaSnapshot[]>();

    private key(endpointId: string, eventType: string): string {
        return `${endpointId}::${eventType}`;
    }

    async load(
        endpointId: string,
        eventType: string,
    ): Promise<FlatSchema | null> {
        return this.store.get(this.key(endpointId, eventType)) ?? null;
    }

    async save(
        endpointId: string,
        eventType: string,
        schema: FlatSchema,
    ): Promise<void> {
        this.store.set(this.key(endpointId, eventType), schema);

        const historyKey = this.key(endpointId, eventType);
        const existing = this.history.get(historyKey) ?? [];
        existing.unshift({
            endpointId,
            eventType,
            schema,
            capturedAt: new Date(),
        });
        if (existing.length > 50) {
            existing.pop();
        }
        this.history.set(historyKey, existing);
    }

    async listEventTypes(endpointId: string): Promise<string[]> {
        const prefix = `${endpointId}::`;
        const types: string[] = [];
        for (const k of this.store.keys()) {
            if (k.startsWith(prefix)) {
                types.push(k.slice(prefix.length));
            }
        }
        return types;
    }

    async getHistory(
        endpointId: string,
        eventType: string,
        limit = 10,
    ): Promise<SchemaSnapshot[]> {
        const historyKey = this.key(endpointId, eventType);
        return (this.history.get(historyKey) ?? []).slice(0, limit);
    }
}
