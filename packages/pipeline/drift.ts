import type { CallSite, DiffSummary, DriftEvent, Fix } from "@driftlock/core";
import type { TrafficCapture } from "@driftlock/sandbox";
import {
    applyFixWork,
    diffShapes,
    fixWorksForDiff,
    inferShape,
    matchesCapture,
    type FixWork,
    type Shape,
    type ShapeDiffResult,
} from "@driftlock/diff";
import type { CapturedShapes } from "./snapshots";

export interface DriftResult {
    callSite: CallSite;
    previous: CapturedShapes;
    current: CapturedShapes;
    requestDiff: ShapeDiffResult;
    responseDiff: ShapeDiffResult;
    works: FixWork[];
}

export function extractShapesFromCaptures(
    captures: TrafficCapture[],
    callSites: CallSite[],
): Map<string, CapturedShapes> {
    const byId = new Map<
        string,
        { request?: Shape; response?: Shape }
    >();

    for (const callSite of callSites) {
        for (const capture of captures) {
            if (!matchesCapture(capture, callSite)) {
                continue;
            }
            const entry = byId.get(callSite.id) ?? {};
            if (!entry.request) {
                entry.request = shapeOf(capture.body) ?? undefined;
            }
            if (!entry.response) {
                entry.response =
                    shapeOf(capture.response?.body) ?? undefined;
            }
            byId.set(callSite.id, entry);
        }
    }

    const result = new Map<string, CapturedShapes>();
    for (const [id, entry] of byId) {
        if (entry.request && entry.response) {
            result.set(id, {
                request: entry.request,
                response: entry.response,
            });
        }
    }
    return result;
}

export function buildDriftResult(
    callSite: CallSite,
    previous: CapturedShapes,
    current: CapturedShapes,
): DriftResult {
    const requestDiff = diffShapes(previous.request, current.request, {
        direction: "request",
    });
    const responseDiff = diffShapes(previous.response, current.response);
    const works = [
        ...fixWorksForDiff(requestDiff),
        ...fixWorksForDiff(responseDiff),
    ];
    return {
        callSite,
        previous,
        current,
        requestDiff,
        responseDiff,
        works,
    };
}

export function driftSummary(drift: DriftResult): DiffSummary {
    return {
        addedFields: [
            ...drift.requestDiff.addedFields,
            ...drift.responseDiff.addedFields,
        ],
        removedFields: [
            ...drift.requestDiff.removedFields,
            ...drift.responseDiff.removedFields,
        ],
        typeChanges: [
            ...drift.requestDiff.typeChanges,
            ...drift.responseDiff.typeChanges,
        ],
        optionalityChanges: [
            ...drift.requestDiff.optionalityChanges,
            ...drift.responseDiff.optionalityChanges,
        ],
        breakingChanges: [
            ...drift.requestDiff.breakingChanges,
            ...drift.responseDiff.breakingChanges,
        ],
        nonBreakingChanges: [
            ...drift.requestDiff.nonBreakingChanges,
            ...drift.responseDiff.nonBreakingChanges,
        ],
    };
}

export function driftConfidence(
    drift: DriftResult,
): "high" | "medium" | "low" {
    const levels = ["high", "medium", "low"] as const;
    const a = levels.indexOf(drift.requestDiff.confidence);
    const b = levels.indexOf(drift.responseDiff.confidence);
    return levels[Math.max(a, b)];
}

export function applyDriftFix(
    drift: DriftResult,
    source: string,
): { fix: Fix; changes: string } | null {
    if (drift.works.length === 0) {
        return null;
    }
    const changes = drift.works.reduce<string>(
        (acc, work) => applyFixWork(work, acc) ?? acc,
        source,
    );
    if (changes === source) {
        return null;
    }
    const primary = drift.works[0];
    const fix: Fix = {
        id: `fix-${drift.callSite.id}`,
        driftEventId: `drift-${drift.callSite.id}`,
        type: primary.kind,
        description: primary.description,
        diff:
            primary.from && primary.to
                ? `- ${primary.from}\n+ ${primary.to}`
                : primary.template,
        confidence: driftConfidence(drift),
        files: [{ path: drift.callSite.filePath, changes }],
        generatedAt: new Date(),
    };
    return { fix, changes };
}

export interface DriftOverrides {
    id?: string;
    detectedAt?: Date;
    oldSnapshotId?: string;
    newSnapshotId?: string;
}

export function buildDriftEvent(
    drift: DriftResult,
    overrides: DriftOverrides = {},
): DriftEvent {
    return {
        id: overrides.id ?? `drift-${drift.callSite.id}`,
        callSiteId: drift.callSite.id,
        detectedAt: overrides.detectedAt ?? new Date(),
        oldSnapshotId:
            overrides.oldSnapshotId ??
            `snap-${drift.callSite.id}-previous`,
        newSnapshotId:
            overrides.newSnapshotId ??
            `snap-${drift.callSite.id}-current`,
        diffSummary: driftSummary(drift),
        suggestedFix: null,
        confidence: driftConfidence(drift),
        prNumber: null,
        status: "detected",
    };
}

function shapeOf(value: unknown): Shape | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const node = inferShape(value);
    if (node.kind !== "object" || !node.properties) {
        return null;
    }
    return node.properties;
}