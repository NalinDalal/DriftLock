/**
 * Agent guard — inspired by CodeRifts coderifts_decorator.py (vendored from coderifts/agent-guard, not PyPI).
 * Zero-dep stdlib-only, framework-agnostic (LangGraph, AutoGen, plain fn), cached per spec pair.
 * Optic never did this: stops a bad API change *inside* the agent loop, not just flagging for humans.
 *
 * TS usage:
 *   import { driftlockGuard, DriftlockBlocked } from "@driftlock/agentGuard";
 *   const guarded = driftlockGuard(oldSpec, newSpec)(async (payload) => callDownstream(payload));
 *
 * Python mirror available as `agent-guard/driftlock_guard.py` for vendoring.
 */

import { diffSpecs, type EndpointSpec } from "@driftlock/diff/spec";
import { createVerdictReceipt } from "@driftlock/diff/receipts";
import { decideVerdict } from "@driftlock/githubApp/report";

export class DriftlockBlocked extends Error {
  receipt: any;
  constructor(msg: string, receipt: any) {
    super(msg);
    this.name = "DriftlockBlocked";
    this.receipt = receipt;
  }
}

const cache = new Map<string, { verdict: string; receipt: any }>();
function cacheKey(a: EndpointSpec, b: EndpointSpec) {
  return `${a.endpoint}|${b.endpoint}|${a.capturedAt}|${b.capturedAt}`;
}

export function driftlockGuard(oldSpec: EndpointSpec, newSpec: EndpointSpec) {
  return function <T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const key = cacheKey(oldSpec, newSpec);
      let hit = cache.get(key);
      if (!hit) {
        const summary = diffSpecs(oldSpec, newSpec);
        const verdict = decideVerdict(summary, []);
        const receipt = createVerdictReceipt(verdict as any, summary.changes, summary.riskScore);
        hit = { verdict, receipt };
        cache.set(key, hit);
      }
      if (hit.verdict === "BLOCK") {
        throw new DriftlockBlocked(`DriftLock BLOCK — ${hit.receipt.verdictFingerprint.slice(0, 12)}…`, hit.receipt);
      }
      return fn(...args);
    };
    return wrapped as T;
  };
}

// LangGraph guard node helper — model gate as graph edge
export function driftlockGuardNode(oldSpec: EndpointSpec, newSpec: EndpointSpec) {
  return async (state: any) => {
    const guard = driftlockGuard(oldSpec, newSpec);
    const noop = guard(async (s: any) => s);
    try {
      await (noop as any)(state);
      return { proceed: true };
    } catch (e) {
      if (e instanceof DriftlockBlocked) return { proceed: false, blockReceipt: (e as DriftlockBlocked).receipt };
      throw e;
    }
  };
}
