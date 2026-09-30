import { eq, and, desc } from "drizzle-orm";
import { getDb, webhookSchemas, webhookDrifts, webhookEndpoints } from "@driftlock/db";
import type { FlatSchema } from "./schemaFlattener";
import type { SchemaStore, SchemaSnapshot } from "./schemaStore";

export class DbSchemaStore implements SchemaStore {
    async load(endpointId: string, eventType: string): Promise<FlatSchema | null> {
        const db = getDb();
        const rows = await db
            .select()
            .from(webhookSchemas)
            .where(
                and(
                    eq(webhookSchemas.endpointId, endpointId),
                    eq(webhookSchemas.eventType, eventType),
                ),
            )
            .limit(1);

        if (rows.length === 0) return null;
        return rows[0].flattenedSchema as FlatSchema;
    }

    async save(
        endpointId: string,
        eventType: string,
        schema: FlatSchema,
    ): Promise<void> {
        const db = getDb();
        const existing = await db
            .select({ id: webhookSchemas.id })
            .from(webhookSchemas)
            .where(
                and(
                    eq(webhookSchemas.endpointId, endpointId),
                    eq(webhookSchemas.eventType, eventType),
                ),
            )
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(webhookSchemas)
                .set({
                    flattenedSchema: schema,
                    capturedAt: new Date(),
                })
                .where(eq(webhookSchemas.id, existing[0].id));
        } else {
            await db.insert(webhookSchemas).values({
                endpointId,
                eventType,
                flattenedSchema: schema,
            });
        }
    }

    async listEventTypes(endpointId: string): Promise<string[]> {
        const db = getDb();
        const rows = await db
            .select({ eventType: webhookSchemas.eventType })
            .from(webhookSchemas)
            .where(eq(webhookSchemas.endpointId, endpointId));
        return rows.map((r: { eventType: string }) => r.eventType);
    }

    async recordDrift(params: {
        endpointId: string;
        eventType: string;
        diff: unknown;
        previousSchema: FlatSchema;
        currentSchema: FlatSchema;
        status?: string;
    }): Promise<string> {
        const db = getDb();
        const rows = await db
            .insert(webhookDrifts)
            .values({
                endpointId: params.endpointId,
                eventType: params.eventType,
                diff: params.diff,
                previousSchema: params.previousSchema,
                newSchema: params.currentSchema,
                status: params.status ?? "detected",
            })
            .returning({ id: webhookDrifts.id });
        console.log(
            `[EVENT] type=drift_detected ${JSON.stringify({ endpointId: params.endpointId, eventType: params.eventType, driftId: rows[0].id })}`,
        );
        return rows[0].id;
    }

    async updateDriftStatus(id: string, status: string): Promise<void> {
        const db = getDb();
        await db
            .update(webhookDrifts)
            .set({ status })
            .where(eq(webhookDrifts.id, id));
    }

    async ensureEndpoint(
        name: string,
        url: string,
        repositoryId?: string,
    ): Promise<string> {
        const db = getDb();
        const existing = await db
            .select({ id: webhookEndpoints.id })
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.url, url))
            .limit(1);

        if (existing.length > 0) return existing[0].id;

        const rows = await db
            .insert(webhookEndpoints)
            .values({ name, url, repositoryId })
            .returning({ id: webhookEndpoints.id });
        return rows[0].id;
    }

    async getHistory(
        endpointId: string,
        eventType: string,
        limit = 10,
    ): Promise<SchemaSnapshot[]> {
        const db = getDb();
        const rows = await db
            .select()
            .from(webhookSchemas)
            .where(
                and(
                    eq(webhookSchemas.endpointId, endpointId),
                    eq(webhookSchemas.eventType, eventType),
                ),
            )
            .orderBy(desc(webhookSchemas.capturedAt))
            .limit(limit);

        return rows.map((row) => ({
            endpointId: row.endpointId,
            eventType: row.eventType,
            schema: row.flattenedSchema as FlatSchema,
            capturedAt: row.capturedAt,
        }));
    }
}
