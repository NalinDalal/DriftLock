"""Vendored from github.com/nerdev-co/DriftLock/packages/agent-guard — not on PyPI, copy the file in.
Zero-dep stdlib-only, framework-agnostic (LangGraph, AutoGen, plain fn), cached per spec pair.
Mirrors CodeRifts coderifts_decorator.py pattern for DriftLock.
"""
from functools import wraps
import hashlib, json, datetime

_cache = {}

class DriftlockBlocked(Exception):
    def __init__(self, msg, receipt):
        super().__init__(msg)
        self.receipt = receipt

def _fp(decision, kinds, risk):
    canon = json.dumps({"decision": decision, "kinds": sorted(kinds), "risk": risk}, sort_keys=True)
    return hashlib.sha256(canon.encode()).hexdigest()

def driftlock_guard(old_spec, new_spec):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = (str(old_spec), str(new_spec))
            if key not in _cache:
                # placeholder: in real impl, diff specs and score risk here
                kinds = []
                risk = 0
                decision = "BLOCK" if "endpoint_removed" in kinds or risk >= 70 else "ALLOW"
                receipt = {"verdictFingerprint": _fp(decision, kinds, risk), "receiptKey": datetime.datetime.utcnow().strftime("%Y-%m-k1"), "decision": decision}
                _cache[key] = (decision, receipt)
            decision, receipt = _cache[key]
            if decision == "BLOCK":
                raise DriftlockBlocked(f"DriftLock BLOCK — {receipt['verdictFingerprint'][:12]}…", receipt)
            return fn(*args, **kwargs)
        return wrapper
    return decorator
