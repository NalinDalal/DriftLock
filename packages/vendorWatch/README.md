# @driftlock/vendorWatch

Proactive vendor-change detection. Everything else in DriftLock detects drift
from traffic you captured or tests you ran. This package watches the vendor
instead: it polls the vendor's published spec on a schedule, diffs it against
the last surface it saw, and triggers the migration agent when members
disappear.

## The loop

```
poll spec → diff vs baseline → removed members? → packet → agent → PR
```

1. `checkVendor` fetches the current contract (spec-first: free,
   deterministic, no credentials) and diffs it against the stored baseline.
2. Pure additions move the baseline forward and trigger nothing — there is
   nothing to migrate to.
3. Removals return a `VendorChange`. `runVendorTriggeredMigration` turns it
   into an `ObservedDrift` packet and runs `runMigrationAgent` with the fresh
   contract, so the gate checks edits against the spec that proved the change.
4. A repository that never reads the removed members ends as `no_action`.
   The trigger is cheap to be wrong about and expensive to miss.

## Baselines

`FileVendorBaselineStore` keeps one contract per provider under
`.driftlock/vendor-baselines/`. The store must survive restarts: a watcher
that forgets what it saw reports every member as new on every poll. First
poll records the baseline and triggers nothing by design — there is no
"before" to compare against yet.

## What this does not do

- Vendors with no published `docs.specUrl` (Twilio today) cannot be watched
  this way. The poll refuses with a message saying so instead of treating an
  empty contract as signal. Live probing with credentials is the alternative
  and is not wired here yet.
- Scheduling is the caller's job: `driftlock watch stripe` exits 1 on a
  breaking change and is meant for cron. There is no daemon and no queue;
  one poll is one process.
- Type-only changes are not diffed yet. The spec diff reports member
  presence, which is what breaks call sites.
