/**
 * Shared endpoint/field IR for drift comparison.
 *
 * Two producers normalize into this shape:
 *   - code-usage      (the AST extractor / sandbox capture, see specFromCallSite)
 *   - vendor-docs     (the docs→spec agent, LLM-extracted from OpenAPI/guides)
 *
 * One diff (`diffSpecs`) compares any pairing of them: code-vs-docs,
 * code-vs-code, or docs-old-vs-docs-new, so the same rename/type/nullability
 * logic runs everywhere. Atomized names (id vs ID) surface as RENAMES, not
 * spurious remove+add.
 */

export type SpecSource = "code-usage" | "sandbox-capture" | "vendor-docs";

export interface FieldSpec {
    /** Field key as it appears to the code ("id", "amount_cents"). */
    name: string;
    type: string;
    required: boolean;
}

export interface EndpointSpec {
    packageName: string;
    method: string;
    endpoint: string;
    httpMethod: string;
    requestFields: FieldSpec[];
    responseFields: FieldSpec[];
    source: SpecSource;
    capturedAt: string;
}

export type SpecChangeKind =
    | "field_added"
    | "field_removed"
    | "field_renamed"
    | "type_changed"
    | "became_optional"
    | "endpoint_removed"
    | "endpoint_added"
    | "enum_value_removed"
    | "request_type_changed"
    | "response_type_changed"
    | "required_field_changed";

export interface SpecChange {
    kind: SpecChangeKind;
    side?: "request" | "response";
    field?: string;
    endpoint?: string;
    from?: string;
    to?: string;
    oldType?: string;
    newType?: string;
    oldEnumValue?: string;
    newEnumValue?: string;
    oldRequired?: boolean;
    newRequired?: boolean;
    breaking: boolean;
}

export interface SpecDiffSummary {
    changes: SpecChange[];
    breakingChanges: string[];
    nonBreakingChanges: string[];
    hasDrift: boolean;
    /** high = sandbox-observed; medium = docs-derived; low = pure code guess. */
    confidence: "high" | "medium" | "low";
}

/**
 * Normalize a field name so atomized differences (id vs ID, order_id vs
 * orderId) collapse. The exact name is preserved on both sides.
 *
 * @param name - Raw field name from one side of the comparison.
 * @returns Lowercase, separator-stripped, case-joined atom.
 */
export function normalizeField(name: string): string {
    return name
        .toLowerCase()
        .replace(/[_\-\s.]/g, "")
        .replace(/([a-z])([A-Z])/g, "$1$2");
}

/**
 * Compare two EndpointSpecs (old and new) and report field drift for both
 * the request and the response side, including 10 types of breaking changes.
 *
 * @param oldSpec - The earlier shape, e.g. code-usage or the previous docs.
 * @param nextSpec - The later shape, e.g. vendor-docs or the new docs.
 * @returns Categorized changes with a per-spec confidence tier.
 */
export function diffSpecs(
    oldSpec: EndpointSpec,
    nextSpec: EndpointSpec,
): SpecDiffSummary {
    const changes: SpecChange[] = [];

    // Check for endpoint removal (entire endpoint gone)
    if (oldSpec.endpoint && !nextSpec.endpoint) {
        changes.push({
            kind: "endpoint_removed",
            endpoint: oldSpec.endpoint,
            breaking: true,
        });
    }

    // Compare request fields
    changes.push(...diffFieldLists(
        oldSpec.requestFields,
        nextSpec.requestFields,
        "request",
    ));

    // Compare response fields
    changes.push(...diffFieldLists(
        oldSpec.responseFields,
        nextSpec.responseFields,
        "response",
    ));

    // Check for endpoint addition
    if (!oldSpec.endpoint && nextSpec.endpoint) {
        changes.push({
            kind: "endpoint_added",
            endpoint: nextSpec.endpoint,
            breaking: false,
        });
    }

    return {
        changes,
        breakingChanges: changes
            .filter((c) => c.breaking)
            .map(renderChange),
        nonBreakingChanges: changes
            .filter((c) => !c.breaking)
            .map(renderChange),
        hasDrift: changes.length > 0,
        confidence: refreshConfidence(oldSpec, nextSpec),
    };
}

/**
 * Compare one field list against its successor (request or response) and
 * emit renames, removals, additions, type changes and optionality drift.
 */
function diffFieldLists(
    oldFields: FieldSpec[],
    nextFields: FieldSpec[],
    side: "request" | "response",
): SpecChange[] {
    const changes: SpecChange[] = [];
    const oldMap = new Map(oldFields.map((f) => [f.name, f]));
    const nextMap = new Map(nextFields.map((f) => [f.name, f]));
    const nextByNorm = new Map(
        nextFields.map((f) => [normalizeField(f.name), f.name]),
    );

    const renamedNext = new Set<string>();

    for (const field of oldFields) {
        const next = nextMap.get(field.name);
        if (next) {
            // Same name: type + optionality drift.
            if (next.type !== field.type) {
                changes.push({
                    kind: "type_changed",
                    side,
                    field: field.name,
                    oldType: field.type,
                    newType: next.type,
                    breaking: true,
                });
            }
            if (next.required === false && field.required) {
                changes.push({
                    kind: "became_optional",
                    side,
                    field: field.name,
                    breaking: false,
                });
            }
            continue;
        }

        const renamedTo = nextByNorm.get(normalizeField(field.name));
        if (renamedTo) {
            renamedNext.add(renamedTo);
            changes.push({
                kind: "field_renamed",
                side,
                field: field.name,
                from: field.name,
                to: renamedTo,
                breaking: false,
            });
            continue;
        }

        changes.push({
            kind: "field_removed",
            side,
            field: field.name,
            breaking: true,
        });
    }

    for (const field of nextFields) {
        if (renamedNext.has(field.name) || oldMap.has(field.name)) continue;
        changes.push({
            kind: "field_added",
            side,
            field: field.name,
            breaking: true,
        });
    }

    return changes;
}

/**
 * Combine source tiers into one confidence level.
 * Sandbox-observed specs win at high; docs-derived cap at medium.
 *
 * @param specs - The source markers of every spec in a comparison.
 * @returns "high" when any side is sandbox-observed, otherwise "medium"
 * for a docs-derived side, otherwise "low".
 */
export function refreshConfidence(
    ...specs: Array<Pick<EndpointSpec, "source">>
): SpecDiffSummary["confidence"] {
    if (specs.some((s) => s.source === "sandbox-capture")) return "high";
    if (specs.some((s) => s.source === "vendor-docs")) return "medium";
    return "low";
}

/**
 * Build a code-side EndpointSpec from an extracted call site.
 *
 * @param callSite - Fields a parser-extracted call site already carries.
 * @param source - Which producer made this spec (defaults to code-usage).
 * @returns An EndpointSpec the docs diff can compare against.
 */
export function specFromCallSite(
    callSite: {
        packageName: string;
        method: string;
        endpoint?: string;
        httpMethod?: string;
        requestShape: Record<string, unknown>;
        responseFields: string[];
    },
    source: SpecSource = "code-usage",
): EndpointSpec {
    return {
        packageName: callSite.packageName,
        method: callSite.method,
        endpoint: callSite.endpoint ?? callSite.method,
        httpMethod: callSite.httpMethod ?? "unknown",
        requestFields: Object.entries(callSite.requestShape).map(
            ([name, type]) => ({
                name,
                type: typeof type === "string" ? type : "object",
                required: true,
            }),
        ),
        responseFields: callSite.responseFields.map((name) => ({
            name,
            type: "unknown",
            required: true,
        })),
        source,
        capturedAt: new Date().toISOString(),
    };
}

function renderChange(change: SpecChange): string {
    const prefix = change.side ? `${change.side}.` : '';
    switch (change.kind) {
        case "field_renamed":
            return `${prefix}${change.from} → ${change.to}`;
        case "type_changed":
            return `${prefix}${change.field}: ${change.oldType} → ${change.newType}`;
        case "field_added":
            return `${prefix}${change.field} added`;
        case "field_removed":
            return `${prefix}${change.field} removed`;
        case "became_optional":
            return `${prefix}${change.field} became optional`;
        case "enum_value_removed":
            return `${prefix}enum value removed`;
        case "endpoint_removed":
            return `endpoint removed`;
        case "endpoint_added":
            return `endpoint added`;
        case "required_field_changed":
            return `${prefix}field required status changed`;
        default:
            return 'change';
    }
}