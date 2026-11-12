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

### F-03 [P3] open - Receipt delete reports failure after the row is already gone when R2 delete fails

**File:** worker/routes/receipts.ts:131
**Found:** 2026-11-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** The delete route removes the D1 row first (correct order),
then awaits `RECEIPTS.delete` without a catch. If R2 throws, `app.onError`
returns 500 even though the receipt is deleted. `ConfirmDelete` shows "Couldn't
delete. Try again.", and the retry gets 404, which shows the same error, so the
row stays on screen until a reload. The spec itself calls the leftover object
harmless, so the object delete should not decide the response.
**Suggested fix:** Make the object delete best-effort, as upload cleanup already
does: `await c.env.RECEIPTS.delete(deleted.r2Key).catch((err: unknown) => console.error(err))`,
then return 204.
**Resolution:**

### F-04 [P3] open - "Receipt uploaded." status rides on the history entry and is already populated at mount

**File:** src/ReceiptsPage.tsx:46
**Found:** 2026-11-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** `navigate('/receipts', { uploaded: true })` stores the flag
in `history.state`, and `ReceiptsContent` reads it on every mount. Reloading
`/receipts`, or going Home and pressing Back, shows "Receipt uploaded." again for
an old upload. The `role="status"` paragraph also first renders after
`PageShell` loads, with the text already inside it; screen readers (notably
VoiceOver) often skip text that is present when a live region is inserted, so the
polite announcement the spec asks for may not be spoken. That part is unverified
without assistive-technology evidence.
**Suggested fix:** After reading the flag, clear it with
`history.replaceState(null, '')`. Render the status region empty and set the
message in an effect after mount, so the region already exists when the text arrives.
**Resolution:**

### F-05 [P3] open - Upload rollback path and cache header have no test

**File:** worker/routes/receipts.ts:87
**Found:** 2026-11-10 by /audit independent (scope: tests)
**Why it matters:** The spec's data-integrity rule for upload is "if the insert
throws, best-effort `RECEIPTS.delete(key)` and rethrow (generic 500)". That
catch branch is never exercised, so a regression that leaves orphaned objects or
swallows the error would pass. `receipts.d1.test.ts` also does not assert the
specified `Cache-Control: private, max-age=3600` header, or the served
`Content-Type` for a JPEG.
**Suggested fix:** In `receipts.d1.test.ts`, force the insert to fail (for
example drop or rename the `receipts` table, or wrap `env.DB` so `prepare`
throws for `INSERT INTO receipts`), POST a valid JPEG, and assert 500 plus an
empty `RECEIPTS.list()`. Add the `Cache-Control` assertion to the existing file test.
**Resolution:**

### F-06 [P3] open - Coding standards still list R2 as planned and omit the D1 test harness

**File:** blueprint/context/coding-standards.md:5
**Found:** 2026-11-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** The header says R2 is "planned but not added" and to "add
their conventions when the first feature that uses them lands"; this feature is
that feature. The Testing stack binding still says routes are tested "with a stub
`env`" and does not mention `worker/test/platform.ts`, the `*.d1.test.ts` naming,
or the `tsconfig.d1test.json` split that keeps wrangler/Node types out of the
Worker program. A later feature could add D1 tests that the Worker tsconfig
compiles, or skip the shared harness.
**Suggested fix:** Move R2 to installed. Add one or two lines: untrusted uploads
are sniffed and served with `nosniff` + `sandbox` CSP; R2/D1 write order is
object then row on create, row then object on delete; D1/R2 route tests use
`startPlatform()` in `*.d1.test.ts` files, covered by `tsconfig.d1test.json`.
**Resolution:**

### F-07 [P3] open - Read retry shows a permanent error when the receipt was already read

**File:** src/ReceiptsPage.tsx:36
**Found:** 2026-11-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `ReadButton` treats every failure the same, including the
route's 409 "This receipt has already been read." That 409 is reachable: the
upload page's read can fail on the client (for example Safari backgrounded on
the iPhone) while the Worker still finishes it, or a second tab reads first.
The row then stays "Waiting to be read" with "Couldn't read this receipt. Try
again.", and every retry returns 409 again, so the list never updates until a
manual reload.
**Suggested fix:** In the catch, when `err instanceof ApiError && err.status === 409`,
call `onRead()` to refresh the list instead of showing the error. No current
requirement is lost.
**Resolution:**

### F-08 [P3] open - The concurrent-read 409 guard has no route test

**File:** worker/routes/receipts.ts:168
**Found:** 2026-11-12 by /audit independent (scope: current; lens: tests)
**Why it matters:** The spec's data-integrity rule is that the final
`UPDATE ... WHERE status = 'pending'` returns 409 when a concurrent read already
moved the receipt, so the winner's extraction is kept. The existing "read twice"
test hits the earlier status check (line 143), not this branch. A regression
that drops the `status = 'pending'` condition would overwrite a stored
extraction and still pass every test.
**Suggested fix:** In `receipts.d1.test.ts`, make the `extract` mock set the row
to `review` with a known extraction before resolving (simulating the winning
read), then assert 409 and that the stored extraction is unchanged.
**Resolution:**
