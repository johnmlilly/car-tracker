# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] open - Plan docs describe a tire-rotation exception that does not exist

**File:** blueprint/context/project-overview.md:39
**Found:** 2026-11-08 by /audit independent (scope: current; lens: quality)
**Why it matters:** `project-overview.md:39-40` and `project-plan.md:46` say the
Odyssey starts with the Corolla's intervals "except tire rotation every 5,000
miles". The Corolla seed (`migrations/0001_seed.sql`) already has tire rotation
at 5,000 mi / 6 months, and `migrations/0004_odyssey_intervals.sql` copies every
row unchanged, which is what the spec intends ("tire rotation is already 5,000 mi
/ 6 months"). A later feature reading the overview could assume the two vehicles
differ and add a bogus correction migration.
**Suggested fix:** Reword both passages to say the Odyssey copies the Corolla's
services and intervals as-is (tire rotation 5,000 mi / 6 months on both). No
current requirement is lost.
**Resolution:**

### F-02 [P3] open - Merged attention counts are computed inline without a unit test

**File:** worker/index.ts:135
**Found:** 2026-11-08 by /audit independent (scope: current; lens: tests)
**Why it matters:** The Minder vehicle attention rule (soon/overdue counts after
`mergeMinderStatus` plus leftover `dueItems.length`) lives inline in
`statusByVehicle`, which needs D1, so no test pins it. `coding-standards.md` asks
to keep status math in pure functions so it can be tested without D1. The merge
itself is tested; only the count derivation is not. Evidence for it today is the
spec's manual `curl` done-when.
**Suggested fix:** Move the count into a small pure helper (for example
`attentionFor(merged)` in `worker/minder.ts`) with one test covering merged
overdue, soon, and leftover items. Optional; no behavior change.
**Resolution:**
