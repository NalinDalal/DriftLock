export type ShapeKind =
    | "object"
    | "array"
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "unknown";

export interface ShapeNode {
    kind: ShapeKind;
    nullable?: boolean;
    properties?: Record<string, ShapeNode>;
    items?: ShapeNode;
    sampleCount?: number;
}

export type Shape = Record<string, ShapeNode>;

export interface TypeChange {
    field: string;
    oldType: string;
    newType: string;
}

export interface OptionalityChange {
    field: string;
    wasRequired: boolean;
    nowRequired: boolean;
}

export interface SemanticChange {
    kind:
        | "field_removed"
        | "field_added"
        | "type_changed"
        | "became_nullable"
        | "became_non_null"
        | "request_removed"
        | "request_added"
        | "request_renamed";
    field: string;
    from?: string;
    to?: string;
    oldType?: string;
    newType?: string;
    breaking: boolean;
}

export interface ShapeDiffOptions {
    direction?: "request" | "response";
    ignore?: string[];
}

export interface ShapeDiffResult {
    addedFields: string[];
    removedFields: string[];
    typeChanges: TypeChange[];
    optionalityChanges: OptionalityChange[];
    breakingChanges: string[];
    nonBreakingChanges: string[];
    confidence: "high" | "medium" | "low";
    changes: SemanticChange[];
}

export type FixWorkKind =
    | "field_rename"
    | "type_coercion"
    | "null_check"
    | "default_value"
    | "custom";

export interface FixWork {
    kind: FixWorkKind;
    field: string;
    from?: string;
    to?: string;
    oldType?: string;
    newType?: string;
    description: string;
    template: string;
    confidence: "high" | "medium" | "low";
}

interface ShapeField {
    path: string;
    node: ShapeNode;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenRegex(token: string): RegExp {
    return new RegExp(
        `(?<![\\w])${escapeRegExp(token)}(?![\\w])`,
        "g",
    );
}

function memberRegex(field: string): RegExp {
    const escaped = escapeRegExp(field);
    return new RegExp(
        `(?<![\\w.])${escaped}(?![\\w])|` +
            `(?<![\\w.])[\\w$]+(?:\\.[\\w$]+)*\\.${escaped}(?![\\w])`,
        "g",
    );
}

function collectUncertainty(node: ShapeNode): number {
    if (node.kind === "unknown") {
        return 1;
    }
    if (node.kind === "array") {
        let count = 0;
        if (node.sampleCount === 0) {
            count += 1;
        }
        if (node.items?.kind === "array") {
            count += collectUncertainty(node.items);
        } else if (node.items?.kind === "object" && node.items.properties) {
            count += collectUncertainty(node.items);
        } else if (
            node.items?.kind === "unknown" &&
            (node.sampleCount ?? 0) > 0
        ) {
            count += 1;
        }
        return count;
    }
    if (node.kind === "object" && node.properties) {
        let count = 0;
        for (const child of Object.values(node.properties)) {
            count += collectUncertainty(child);
        }
        return count;
    }
    return 0;
}

export function inferShape(value: unknown): ShapeNode {
    if (value === null) {
        return { kind: "null" };
    }
    if (Array.isArray(value)) {
        const merged = value.reduce<ShapeNode | null>(
            (acc, element) => {
                const node = inferShape(element);
                return acc === null ? node : mergeNodes(acc, node);
            },
            null,
        );
        return {
            kind: "array",
            items: merged ?? { kind: "unknown" },
            sampleCount: value.length,
        };
    }
    switch (typeof value) {
        case "string":
            return { kind: "string" };
        case "number":
            return { kind: "number" };
        case "boolean":
            return { kind: "boolean" };
        case "object": {
            const properties: Record<string, ShapeNode> = {};
            for (const [key, element] of Object.entries(
                value as Record<string, unknown>,
            )) {
                properties[key] = inferShape(element);
            }
            return { kind: "object", properties };
        }
        default:
            return { kind: "unknown" };
    }
}

export function mergeNodes(a: ShapeNode, b: ShapeNode): ShapeNode {
    if (a.kind === "null" && b.kind === "null") {
        return { kind: "null" };
    }
    if (a.kind === "null" && b.kind !== "null") {
        return { ...b, nullable: true };
    }
    if (b.kind === "null" && a.kind !== "null") {
        return { ...a, nullable: true };
    }
    if (a.kind === "unknown" && b.kind !== "unknown") {
        return b;
    }
    if (b.kind === "unknown" && a.kind !== "unknown") {
        return a;
    }
    if (a.kind === "unknown" && b.kind === "unknown") {
        return { kind: "unknown" };
    }
    if (a.kind !== b.kind) {
        return { ...a, nullable: true };
    }
    if (a.kind === "object" && b.kind === "object") {
        const properties: Record<string, ShapeNode> = { ...a.properties };
        for (const [key, node] of Object.entries(b.properties ?? {})) {
            properties[key] = properties[key]
                ? mergeNodes(properties[key], node)
                : node;
        }
        return {
            kind: "object",
            properties,
            nullable: a.nullable || b.nullable,
        };
    }
    if (a.kind === "array" && b.kind === "array") {
        return {
            kind: "array",
            items: a.items && b.items ? mergeNodes(a.items, b.items) : a.items ?? b.items,
            sampleCount: Math.max(a.sampleCount ?? 0, b.sampleCount ?? 0),
            nullable: a.nullable || b.nullable,
        };
    }
    return { ...a, nullable: a.nullable || b.nullable };
}

export function flattenShape(shape: Shape, prefix = ""): ShapeField[] {
    const fields: ShapeField[] = [];
    for (const [key, node] of Object.entries(shape)) {
        const path = prefix ? `${prefix}.${key}` : key;
        fields.push({ path, node });
        fields.push(...flattenNodeChildren(node, path));
    }
    return fields;
}

function flattenNodeChildren(node: ShapeNode, path: string): ShapeField[] {
    if (node.kind === "object" && node.properties) {
        return flattenShape(node.properties, path);
    }
    if (node.kind === "array" && node.items) {
        const itemsPath = `${path}[]`;
        if (node.items.kind === "unknown") {
            return [];
        }
        const fields: ShapeField[] = [{ path: itemsPath, node: node.items }];
        if (node.items.kind === "object" && node.items.properties) {
            fields.push(...flattenShape(node.items.properties, itemsPath));
        } else if (node.items.kind === "array") {
            fields.push(...flattenNodeChildren(node.items, itemsPath));
        }
        return fields;
    }
    return [];
}

function matchPath(path: string, pattern: string): boolean {
    const escaped = escapeRegExp(pattern).replace(/\\\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(path);
}

export function diffShapes(
    oldShape: Shape,
    newShape: Shape,
    options: ShapeDiffOptions = {},
): ShapeDiffResult {
    const direction = options.direction ?? "response";
    const ignore = options.ignore ?? [];

    const oldFields = flattenShape(oldShape);
    const newFields = flattenShape(newShape);
    const oldByPath = new Map(oldFields.map((f) => [f.path, f.node]));
    const newByPath = new Map(newFields.map((f) => [f.path, f.node]));

    const allPaths = [...new Set([...oldByPath.keys(), ...newByPath.keys()])];
    const ignored = new Set(allPaths.filter((p) => ignore.some((pat) => matchPath(p, pat))));

    const addedFields: string[] = [];
    const removedFields: string[] = [];
    const typeChanges: TypeChange[] = [];
    const optionalityChanges: OptionalityChange[] = [];
    const breakingChanges: string[] = [];
    const nonBreakingChanges: string[] = [];
    const changes: SemanticChange[] = [];
    let uncertainty = 0;

    const removedPaths: string[] = [];
    const addedPaths: string[] = [];

    for (const path of allPaths) {
        if (ignored.has(path)) {
            continue;
        }
        const oldNode = oldByPath.get(path);
        const newNode = newByPath.get(path);
        uncertainty += (oldNode ? collectUncertainty(oldNode) : 0);
        uncertainty += (newNode ? collectUncertainty(newNode) : 0);

        if (!oldNode) {
            addedPaths.push(path);
            continue;
        }
        if (!newNode) {
            removedPaths.push(path);
            continue;
        }

        if (oldNode.kind === newNode.kind) {
            if (oldNode.nullable && !newNode.nullable) {
                changes.push({ kind: "became_non_null", field: path, breaking: false });
                nonBreakingChanges.push(`Field '${path}' is no longer nullable`);
                optionalityChanges.push({
                    field: path,
                    wasRequired: false,
                    nowRequired: true,
                });
            } else if (!oldNode.nullable && newNode.nullable) {
                changes.push({
                    kind: "became_nullable",
                    field: path,
                    oldType: oldNode.kind,
                    breaking: true,
                });
                breakingChanges.push(`Field '${path}' is now nullable`);
                optionalityChanges.push({
                    field: path,
                    wasRequired: true,
                    nowRequired: false,
                });
            }
            continue;
        }

        if (oldNode.kind === "null" || newNode.kind === "null") {
            if (oldNode.kind === "null" && newNode.kind === "null") {
                continue;
            }
            if (oldNode.kind === "null") {
                changes.push({ kind: "became_non_null", field: path, breaking: false });
                nonBreakingChanges.push(`Field '${path}' is no longer null`);
                optionalityChanges.push({
                    field: path,
                    wasRequired: false,
                    nowRequired: true,
                });
                continue;
            }
            if (!oldNode.nullable && !newNode.nullable) {
                changes.push({
                    kind: "became_nullable",
                    field: path,
                    oldType: oldNode.kind,
                    breaking: true,
                });
                breakingChanges.push(`Field '${path}' is now null`);
                optionalityChanges.push({
                    field: path,
                    wasRequired: true,
                    nowRequired: false,
                });
            }
            continue;
        }

        const oldKind = oldNode.kind === "unknown" ? "unknown" : oldNode.kind;
        const newKind = newNode.kind === "unknown" ? "unknown" : newNode.kind;

        if (oldKind === "unknown" || newKind === "unknown") {
            uncertainty += 1;
            continue;
        }

        changes.push({
            kind: "type_changed",
            field: path,
            oldType: oldKind,
            newType: newKind,
            breaking: true,
        });
        typeChanges.push({ field: path, oldType: oldKind, newType: newKind });
        breakingChanges.push(
            `Changed type of '${path}' from ${oldKind} to ${newKind}`,
        );
    }

    let topLevelRemoved: string[] = [];
    let topLevelAdded: string[] = [];

    if (direction === "request" && removedPaths.length === 1 && addedPaths.length === 1) {
        const removedPath = removedPaths[0];
        const addedPath = addedPaths[0];
        const isTopLevel = (p: string) =>
            !p.includes(".") && !p.includes("[");
        const removedNode = oldByPath.get(removedPath);
        const addedNode = newByPath.get(addedPath);
        if (
            isTopLevel(removedPath) &&
            isTopLevel(addedPath) &&
            removedNode &&
            addedNode &&
            removedNode.kind === addedNode.kind &&
            removedNode.kind !== "null" &&
            removedNode.kind !== "unknown"
        ) {
            changes.push({
                kind: "request_renamed",
                field: removedPath,
                from: removedPath,
                to: addedPath,
                breaking: true,
            });
            breakingChanges.push(
                `Renamed request parameter '${removedPath}' to '${addedPath}'`,
            );
        } else {
            topLevelRemoved = removedPaths;
            topLevelAdded = addedPaths;
        }
    } else {
        topLevelRemoved = removedPaths;
        topLevelAdded = addedPaths;
    }

    for (const path of topLevelRemoved) {
        if (direction === "request") {
            changes.push({ kind: "request_removed", field: path, breaking: false });
            nonBreakingChanges.push(
                `Request parameter '${path}' is no longer required`,
            );
            optionalityChanges.push({
                field: path,
                wasRequired: true,
                nowRequired: false,
            });
        } else {
            changes.push({ kind: "field_removed", field: path, breaking: true });
            removedFields.push(path);
            breakingChanges.push(`Removed field '${path}'`);
        }
    }

    for (const path of topLevelAdded) {
        if (direction === "request") {
            changes.push({ kind: "request_added", field: path, breaking: true });
            addedFields.push(path);
            breakingChanges.push(`New required request parameter '${path}'`);
            optionalityChanges.push({
                field: path,
                wasRequired: false,
                nowRequired: true,
            });
        } else {
            changes.push({ kind: "field_added", field: path, breaking: false });
            addedFields.push(path);
            nonBreakingChanges.push(`Added field '${path}'`);
        }
    }

    const confidence: "high" | "medium" | "low" =
        uncertainty === 0 ? "high" : uncertainty <= 1 ? "medium" : "low";

    return {
        addedFields,
        removedFields,
        typeChanges,
        optionalityChanges,
        breakingChanges,
        nonBreakingChanges,
        confidence,
        changes,
    };
}

function defaultForType(type: string | undefined): string {
    if (type?.includes("string")) return '""';
    if (type?.includes("number")) return "0";
    if (type?.includes("boolean")) return "false";
    return "null";
}

function coercerForType(type: string): string | null {
    if (type.includes("number")) return "Number";
    if (type.includes("string")) return "String";
    if (type.includes("boolean")) return "Boolean";
    return null;
}

export function fixWorksForDiff(result: ShapeDiffResult): FixWork[] {
    const works: FixWork[] = [];
    for (const change of result.changes) {
        switch (change.kind) {
            case "became_nullable": {
                if (change.field.includes("[") || change.field.includes("]")) {
                    break;
                }
                const fallback = defaultForType(change.oldType);
                works.push({
                    kind: "null_check",
                    field: change.field,
                    oldType: change.oldType,
                    description: `Add a null check for '${change.field}'`,
                    template: `replace '${change.field}' with '${change.field} ?? ${fallback}'`,
                    confidence: result.confidence,
                });
                break;
            }
            case "type_changed": {
                if (
                    change.field.includes("[") ||
                    change.field.includes("]") ||
                    change.oldType === "unknown" ||
                    change.newType === "unknown"
                ) {
                    break;
                }
                works.push({
                    kind: "type_coercion",
                    field: change.field,
                    oldType: change.oldType,
                    newType: change.newType,
                    description: `Convert '${change.field}' from ${change.oldType} to ${change.newType}`,
                    template: `wrap '${change.field}' in a ${change.newType} coercion`,
                    confidence: result.confidence,
                });
                break;
            }
            case "request_renamed": {
                works.push({
                    kind: "field_rename",
                    field: change.field,
                    from: change.from,
                    to: change.to,
                    description: `Rename request parameter '${change.from}' to '${change.to}'`,
                    template: `rename '${change.from}' to '${change.to}'`,
                    confidence: result.confidence,
                });
                break;
            }
            case "request_added": {
                if (change.field.includes("[") || change.field.includes("]")) {
                    break;
                }
                works.push({
                    kind: "default_value",
                    field: change.field,
                    description: `Request parameter '${change.field}' is now required`,
                    template: `provide a default value for '${change.field}'`,
                    confidence: result.confidence,
                });
                break;
            }
            case "field_removed": {
                works.push({
                    kind: "custom",
                    field: change.field,
                    description: `Handle removed response field '${change.field}'`,
                    template: `remove access to '${change.field}'`,
                    confidence: result.confidence,
                });
                break;
            }
            default:
                break;
        }
    }
    return works;
}

export function applyFixWork(work: FixWork, source: string): string | null {
    switch (work.kind) {
        case "field_rename": {
            if (!work.from || !work.to) {
                return null;
            }
            if (!tokenRegex(work.from).test(source)) {
                return null;
            }
            return source.replace(tokenRegex(work.from), work.to);
        }
        case "null_check": {
            if (!memberRegex(work.field).test(source)) {
                return null;
            }
            const fallback = defaultForType(work.oldType);
            return source.replace(memberRegex(work.field), `$& ?? ${fallback}`);
        }
        case "type_coercion": {
            const coercer = coercerForType(work.newType ?? "");
            if (!coercer || !memberRegex(work.field).test(source)) {
                return null;
            }
            return source.replace(
                memberRegex(work.field),
                `${coercer}($&)`,
            );
        }
        default:
            return null;
    }
}
export { diffSpecs, specFromCallSite, normalizeField, refreshConfidence } from "./spec";
export type { EndpointSpec, FieldSpec, SpecSource, SpecChange, SpecChangeKind, SpecDiffSummary } from "./spec";
