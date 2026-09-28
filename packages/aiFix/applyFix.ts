import { applyFixWork, type FixWork, type ShapeDiffResult } from "@driftlock/diff";
import { generateAIFix, type AIFixConfig } from "./index";
import { isValidAIFix } from "./validate";

/** Minimum AI confidence to accept a model fix; below this we go deterministic. */
export const AI_FIX_CONFIDENCE_THRESHOLD = 60;

export interface ResolveFixInput {
    works: FixWork[];
    source: string;
    filePath: string;
    eventType?: string;
    /** Prompt context for the model. Optional; the deterministic fallback ignores it. */
    diff?: ShapeDiffResult;
    /** When absent, the fix is purely deterministic. */
    ai?: AIFixConfig;
}

export interface ResolveFixResult {
    /** Fixed source, or null when no fix applies. */
    fixed: string | null;
    /** True when the accepted fix came from the model. */
    aiUsed: boolean;
}

function applyDeterministic(source: string, works: FixWork[]): string | null {
    let changed = source;
    for (const work of works) {
        const result = applyFixWork(work, changed);
        if (result) {
            changed = result;
        }
    }
    return changed === source ? null : changed;
}

function emptyDiff(): ShapeDiffResult {
    return {
        addedFields: [],
        removedFields: [],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        confidence: "low",
        changes: [],
    };
}

/**
 * The single fix path: deterministic works from `diff.fixWorksForDiff`,
 * upgraded to a model fix when one is configured, confident (>= 60), and
 * passes semantic validation — otherwise deterministic.
 */
export async function resolveFixedSource(
    input: ResolveFixInput,
): Promise<ResolveFixResult> {
    if (input.ai) {
        try {
            const aiResult = await generateAIFix(
                {
                    diff: input.diff ?? emptyDiff(),
                    works: input.works,
                    sourceCode: input.source,
                    filePath: input.filePath,
                    eventType: input.eventType,
                },
                input.ai,
            );

            if (aiResult.confidence >= AI_FIX_CONFIDENCE_THRESHOLD) {
                if (
                    !isValidAIFix(
                        aiResult.fixedCode,
                        input.works,
                        input.source,
                        input.filePath,
                    )
                ) {
                    console.log(
                        `  [AI] ${input.filePath}: AI fix failed validation (semantic check), falling back to deterministic`,
                    );
                } else {
                    console.log(
                        `  [AI] ${input.filePath}: confidence=${aiResult.confidence} - ${aiResult.explanation.slice(0, 100)}`,
                    );
                    return { fixed: aiResult.fixedCode, aiUsed: true };
                }
            } else {
                console.log(
                    `  [AI] ${input.filePath}: confidence=${aiResult.confidence} too low, falling back to deterministic`,
                );
            }
        } catch (err) {
            console.error(
                `  [AI] ${input.filePath}: AI fix failed, falling back to deterministic:`,
                err,
            );
        }
    }

    return { fixed: applyDeterministic(input.source, input.works), aiUsed: false };
}
