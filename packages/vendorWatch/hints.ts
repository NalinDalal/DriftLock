/**
 * Replacement hints: vendor-declared renames derived from a spec diff.
 *
 * When a vendor removes `source` and adds `payment_method` under the same
 * parent path, that pair is ground truth no model can disagree with — the
 * vendor published it. The traffic loop consumes these via
 * `applyVendorHints` in `@driftlock/diff`, which upgrades a `custom`
 * removal work into a `field_rename` the deterministic fixer can apply.
 */

export interface ReplacementHint {
    /** Dotted member path the vendor removed, e.g. `payment_intents.source`. */
    from: string;
    /** Dotted member path that supersedes it, same parent. */
    to: string;
}

function parentOf(member: string): string {
    const idx = member.lastIndexOf(".");
    return idx < 0 ? "" : member.slice(0, idx);
}

/**
 * Pair removed members with added members under the same parent path.
 *
 * Only unambiguous 1-removed/1-added parents pair. Anything else keeps
 * the removal as a plain removal (model fix or comment-out), because a
 * wrong rename ships a confident lie while no rename ships an honest diff.
 */
export function replacementHints(
    removed: string[],
    added: string[],
): ReplacementHint[] {
    const buckets = new Map<string, { removed: string[]; added: string[] }>();
    const bucket = (parent: string) => {
        let entry = buckets.get(parent);
        if (!entry) {
            entry = { removed: [], added: [] };
            buckets.set(parent, entry);
        }
        return entry;
    };
    for (const member of removed) bucket(parentOf(member)).removed.push(member);
    for (const member of added) bucket(parentOf(member)).added.push(member);
    const hints: ReplacementHint[] = [];
    for (const { removed: gone, added: fresh } of buckets.values()) {
        if (gone.length === 1 && fresh.length === 1) {
            hints.push({ from: gone[0], to: fresh[0] });
        }
    }
    return hints;
}
