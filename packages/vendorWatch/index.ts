export {
    MemoryVendorBaselineStore,
    FileVendorBaselineStore,
    type VendorBaselineStore,
} from "./baselineStore";
export { checkVendor, type CheckOptions, type VendorChange } from "./watcher";
export { replacementHints, type ReplacementHint } from "./hints";
export {
    observedDriftFromChange,
    runVendorTriggeredMigration,
    type TriggerOptions,
} from "./trigger";
