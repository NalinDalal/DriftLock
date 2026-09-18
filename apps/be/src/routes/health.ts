import { json } from "../utils";

export function handleHealth(): Response {
    return json({ status: "ok", service: "driftlock-webhook", uptimeSec: Math.round(process.uptime()) });
}