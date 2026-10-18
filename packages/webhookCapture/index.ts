export { flattenPayload, type FlatSchema } from "./schemaFlattener";
export {
    diffSchemas,
    isSchemaDiffEmpty,
    severityForSchemaDiff,
    type SchemaDiff,
    type DriftSeverity,
} from "./schemaDiff";
export {
    InMemorySchemaStore,
    type SchemaStore,
    type SchemaSnapshot,
} from "./schemaStore";
export {
    DriftDetector,
    type DriftAlert,
    type DriftHandler,
    type RollbackAlert,
    type RollbackHandler,
} from "./driftDetector";
export {
    createCaptureMiddleware,
    type CaptureConfig,
} from "./captureMiddleware";
export { DbSchemaStore } from "./dbStore";
export {
    parseCaptureSecrets,
    verifyCaptureSignature,
    signStripePayload,
    type CaptureSignatureCheck,
} from "./verifySignature";
export {
    createWebhookFixPR,
    type WebhookPRInput,
    type WebhookPRResult,
} from "./prCreator";
export { isValidAIFix } from "@driftlock/aiFix";
export { harToConsumerContract, type HarCaptureOptions, type HarEntry } from "./harCapture";
export {
    createAgentFixPR,
    type AgentFixInput,
    type AgentFixResult,
} from "./agentFix";
export {
    createOutboundAgentFixPR,
    type OutboundAgentFixInput,
    type OutboundAgentFixResult,
    type OutboundDrift,
} from "./outboundAgent";
// Agent-layer modules, re-exported so existing callers keep working.
// New code should import these from "@driftlock/agent" directly.
export {
    resolveHybridContract,
    clearSpecCache,
    vendorForPackage,
    runDriftMigration,
    type HybridContractInput,
    type DriftMigrationInput,
    type DriftMigrationResult,
} from "@driftlock/agent";
export {
    buildAgentClient,
    resolveAgentFixDeps,
    routeBySeverity,
    vendorForEndpoint,
    type AgentAIConfig,
    type AgentClient,
    type FixRoute,
} from "./agentRoute";
