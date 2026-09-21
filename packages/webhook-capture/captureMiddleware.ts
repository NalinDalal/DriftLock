import type { SchemaStore } from "./schemaStore";
import { DriftDetector, type DriftAlert, type RollbackAlert } from "./driftDetector";

export interface CaptureConfig {
    /** Extract event type from request. Defaults to x-github-event header. */
    extractEventType?: (req: Request) => string;
    /** Extract endpoint ID from request. Defaults to URL path segment. */
    extractEndpointId?: (req: Request) => string;
    /** Called when drift is detected. */
    onDrift?: (alert: DriftAlert) => void | Promise<void>;
    /** Called when rollback is detected. */
    onRollback?: (alert: RollbackAlert) => void | Promise<void>;
}

const DEFAULT_EVENT_TYPE_HEADER = "x-github-event";

export function createCaptureMiddleware(
    store: SchemaStore,
    config: CaptureConfig = {},
) {
    const detector = new DriftDetector(store);

    if (config.onDrift) {
        detector.onDrift(config.onDrift);
    }

    if (config.onRollback) {
        detector.onRollback(config.onRollback);
    }

    const extractEventType =
        config.extractEventType ??
        ((req: Request) =>
            req.headers.get(DEFAULT_EVENT_TYPE_HEADER) ?? "__default__");

    const extractEndpointId =
        config.extractEndpointId ??
        ((req: Request) => {
            const url = new URL(req.url);
            const segments = url.pathname.split("/").filter(Boolean);
            return segments[segments.length - 1] ?? "default";
        });

    async function capture(
        req: Request,
        body: Record<string, unknown>,
    ): Promise<DriftAlert | RollbackAlert | null> {
        const endpointId = extractEndpointId(req);
        const eventType = extractEventType(req);
        return detector.processPayload(endpointId, eventType, body);
    }

    return { capture, detector };
}
