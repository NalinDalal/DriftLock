import { Hono } from "hono";
import { webhookHandler } from "./webhooks";
import { getDb } from "@driftlock/db";

const app = new Hono();

app.route("/webhooks", webhookHandler);

app.get("/", (c) => {
    return c.json({
        name: "DriftLock",
        version: "0.1.0",
        description: "Self-maintaining APIs — GitHub App webhook handler",
        endpoints: {
            webhooks: "/webhooks/github",
            health: "/health",
        },
    });
});

app.get("/health", async (c) => {
    try {
        const db = getDb();
        // Simple query to verify database connection
        await db.execute("SELECT 1");
        return c.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
    } catch (error) {
        return c.json({ status: "degraded", database: "disconnected", timestamp: new Date().toISOString() }, 503);
    }
});

const port = parseInt(process.env.PORT || "3000", 10);

// Verify database connection on startup
try {
    const db = getDb();
    console.log("Database connection established");
} catch (error) {
    console.warn("Database connection failed — webhooks will log but not persist:", error);
}

console.log(`DriftLock webhook server starting on port ${port}`);

export default {
    port,
    fetch: app.fetch,
};
