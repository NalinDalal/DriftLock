import type { FlatSchema } from "./schemaFlattener";

export interface SchemaDiff {
    added: string[];
    removed: string[];
    typeChanged: Array<{ field: string; from: string; to: string }>;
}

export function diffSchemas(
    previous: FlatSchema,
    current: FlatSchema,
): SchemaDiff {
    const added: string[] = [];
    const removed: string[] = [];
    const typeChanged: Array<{ field: string; from: string; to: string }> = [];

    for (const key of Object.keys(current)) {
        if (!(key in previous)) {
            added.push(key);
        }
    }

    for (const key of Object.keys(previous)) {
        if (!(key in current)) {
            removed.push(key);
        }
    }

    for (const key of Object.keys(current)) {
        if (key in previous && previous[key] !== current[key]) {
            typeChanged.push({
                field: key,
                from: previous[key],
                to: current[key],
            });
        }
    }

    return { added, removed, typeChanged };
}

export function isSchemaDiffEmpty(diff: SchemaDiff): boolean {
    return (
        diff.added.length === 0 &&
        diff.removed.length === 0 &&
        diff.typeChanged.length === 0
    );
}

export type DriftSeverity = "breaking" | "warning" | "info";

/**
 * Severity of a webhook payload drift, response-side semantics: a removed
 * field breaks every reader of it, a changed type may break some, and a pure
 * addition breaks nothing. Drives fix routing, not alert text.
 */
export function severityForSchemaDiff(diff: SchemaDiff): DriftSeverity {
    if (diff.removed.length > 0) return "breaking";
    if (diff.typeChanged.length > 0) return "warning";
    return "info";
}
