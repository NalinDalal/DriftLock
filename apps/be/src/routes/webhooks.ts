import { getStore } from "../store";
import { json, notFound } from "../utils";

export async function handleWebhookEndpoints(url: URL): Promise<Response> {
    if (url.pathname !== "/api/webhooks/endpoints") {
        return notFound();
    }
    const store = getStore();
    const endpoints = await store.listWebhookEndpoints();
    return json({ endpoints });
}

export async function handleWebhookSchemas(url: URL): Promise<Response> {
    const match = url.pathname.match(
        /^\/api\/webhooks\/endpoints\/([^/]+)\/schemas$/,
    );
    if (!match) {
        return notFound();
    }
    const endpointId = decodeURIComponent(match[1]);
    const store = getStore();
    const endpoint = await store.getWebhookEndpoint(endpointId);
    if (!endpoint) {
        return notFound("Endpoint not found");
    }
    const schemas = await store.listWebhookSchemas(endpointId);
    return json({ schemas });
}

export async function handleWebhookDrifts(url: URL): Promise<Response> {
    if (url.pathname !== "/api/webhooks/drifts") {
        return notFound();
    }
    const store = getStore();
    const endpointId = url.searchParams.get("endpointId") ?? undefined;
    const drifts = await store.listWebhookDrifts(endpointId);
    return json({ drifts });
}
