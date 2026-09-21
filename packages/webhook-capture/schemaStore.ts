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
}

export class InMemorySchemaStore implements SchemaStore {
    private store = new Map<string, FlatSchema>();

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
}
