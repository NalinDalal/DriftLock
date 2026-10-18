// TEMP live test on /tmp/stripe-live. No publisher. Delete after the run.
import OpenAI from "openai";
import { runMigrationAgent } from "./migrationAgent";

const root = "/tmp/stripe-live";
const apiKey = process.env.GEMINI_API_KEY ?? "";
const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";
if (!apiKey) {
    console.error("GEMINI_API_KEY missing in env");
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

console.log(`root:  ${root}`);
console.log(`model: ${model}`);

const started = Date.now();
const result = await runMigrationAgent({
    root,
    packet: {
        provider: "stripe",
        fromVersion: "2022-08-01",
        toVersion: "2022-11-15",
        summary:
            "The legacy `source` field on the PaymentIntent object has been removed. It was a legacy Sources API field and is superseded by `payment_method`. Replace every read of `paymentIntent.source` with `paymentIntent.payment_method`.",
        migrationDocs: [
            "https://docs.stripe.com/upgrades#2022-11-15",
            "https://docs.stripe.com/payments/payment-methods",
        ],
    },
    client,
    model,
    allowHostExecution: true,
});

console.log("=".repeat(70));
console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`outcome: ${result.outcome}`);
console.log(`iterations: ${result.state.iteration} / ${result.state.maxIterations}`);
console.log(`files changed: ${result.filesChanged.join(", ") || "(none)"}`);
console.log(`commands run: ${result.state.commandsRun}`);
console.log(`verification passed: ${result.state.lastTestResult?.passed ?? "never ran"}`);
for (const entry of result.state.transcript) {
    if (entry.role === "assistant" && entry.content) {
        console.log(`\nASSISTANT: ${String(entry.content).slice(0, 800)}`);
    }
    for (const call of entry.toolCalls ?? []) {
        console.log(`\n>>> ${call.name} ${JSON.stringify(call.args).slice(0, 300)}`);
    }
}
