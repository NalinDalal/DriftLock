import { webhookHandler } from "./webhooks";
import { getDb } from "@driftlock/db";

const port = parseInt(process.env.PORT || "3001", 10);

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

// Verify database connection on startup
try {
    getDb();
    console.log("Database connection established");
} catch (error) {
    console.warn(
        "Database connection failed — webhooks will log but not persist:",
        error,
    );
}

console.log(`DriftLock webhook server starting on port ${port}`);

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/webhooks/github") {
            return await webhookHandler(req);
        }

        if (url.pathname === "/health") {
            try {
                const db = getDb();
                await db.execute("SELECT 1");
                return json({
                    status: "ok",
                    database: "connected",
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                return json(
                    {
                        status: "degraded",
                        database: "disconnected",
                        timestamp: new Date().toISOString(),
                    },
                    503,
                );
            }
        }

        if (url.pathname === "/") {
            return json({
                name: "DriftLock",
                version: "0.1.0",
                description:
                    "Self-maintaining APIs — GitHub App webhook handler",
                endpoints: {
                    webhooks: "/webhooks/github",
                    health: "/health",
                },
            });
        }

        return json({ error: "Not found" }, 404);
    },
});
