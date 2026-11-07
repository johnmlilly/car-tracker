# Feature: Corolla baselines and status

**From build-plan:** feature 2
**Build attempt:** 1
**Branch:** feature/corolla-baselines-and-status
**Status:** verified

## Goal

For the Corolla (interval schedule), let me enter a one-time "last done" baseline
per service (date and/or mileage), then show each service's next due point and its
status (OK, soon, overdue) on a vehicle detail screen, with a soon/overdue count on
the Corolla's home card.

## In scope

- Pure scheduling logic in `shared/schedule.ts`: next due date and miles from a
  baseline plus interval, and status from today's date (Eastern) and an optional
  current mileage.
- `GET /api/vehicles/:id` returning the vehicle and, for interval vehicles, its
  schedule items with computed due points and status.
- `PUT /api/schedule-items/:id/baseline` to set or clear a baseline, with
  server-side validation.
- `GET /api/vehicles` gains a soon/overdue count per interval vehicle.
- Vehicle detail screen at `/vehicles/:id`: item list with status, last done, next
  due, and an inline baseline form per item.
- Minimal client-side routing between `/` and `/vehicles/:id` without a new
  dependency.

## Out of scope

- Odometer logging and the current-mileage estimate (feature 3). Until then the
  current mileage is unknown, so mileage never drives status (see Data /
  contracts).
- Odyssey Minder logging and an Odyssey detail screen (feature 4). The Odyssey
  card stays non-clickable.
- Service records closing items (feature 5); "last done" is the baseline only.
- Editing intervals, adding or removing schedule items.

## Build loop

`workflow.stepReview: feature`, `workflow.checkpointCommits: disabled`. Run under
Autopilot: no per-step pauses, no checkpoint commits. Tests are a gate for logic
steps (`npm test`). `/complete` creates the feature commit.

## Build steps

- [x] 1. **Scheduling logic.** `shared/schedule.ts` with `todayInEastern(now)`,
  `addMonths(isoDate, months)` (clamps to month end), `computeDue(item)`, and
  `computeStatus(due, today, currentMiles)`; `shared/schedule.test.ts` covering
  month-end clamping, leap years, miles-only / months-only / both, missing
  baseline, the 30-day and 1,000-mile soon windows, exact due day, and the
  worse-of-two rule.
  Done when: `npm test` passes with the new cases; build and lint pass.
- [x] 2. **Vehicle detail API.** `GET /api/vehicles/:id` per the contract;
  invalid or unknown id -> 404 error shape. `GET /api/vehicles` adds
  `attention` counts. Route tests through `app.request` with a stub D1 for the
  invalid-id path; happy path verified with `curl` on local D1.
  Done when: tests, build, lint pass; `curl /api/vehicles/2` returns 7 items with
  `status: "unknown"` before any baseline; `/api/vehicles/999` returns 404.
- [x] 3. **Baseline update API.** `PUT /api/schedule-items/:id/baseline` with
  validation; returns the recomputed item. Validation in a pure
  `parseBaselineInput(body, today)` with unit tests.
  Done when: tests pass; `curl` sets a baseline and the item's next due and status
  change accordingly; invalid input returns 400 with field messages; build, lint
  pass.
- [x] 4. **Routing and detail screen.** Small `usePathname` hook (history API,
  `popstate`, link interception) in `src/`; split `App.tsx` into `HomePage` and
  `VehiclePage`. Corolla card links to `/vehicles/:id` and shows soon/overdue
  counts. Detail screen lists items with status label, last done, next due;
  loading, error-with-retry, and not-found states.
  Done when: in the browser, the Corolla card opens its detail page, back/forward
  work, a direct load of `/vehicles/2` works, `/vehicles/999` shows not found; no
  console errors; build, lint pass.
- [x] 5. **Baseline form.** Per-item edit form (date input, odometer input) with
  save, cancel, and clear; field errors from the API shown next to the field and
  announced; list and home counts reflect the change after save.
  Done when: in the browser, setting a baseline updates next due and status;
  a future date shows the field error; clearing returns the item to "Not set";
  build, lint, test pass.
- [x] 6. **Repair F-02: unparseable odometer input.** On submit, treat a number
  input whose `validity.badInput` is true as invalid and show "Enter whole miles."
  instead of sending `null`.
  Done when: in the browser, typing `-` into the odometer and saving shows the
  field error and makes no request; the existing baseline is unchanged; build,
  lint, test pass.

## Files / areas

- `shared/schedule.ts`, `shared/schedule.test.ts`, `shared/api.ts`
- `worker/index.ts`, `worker/index.test.ts`, `worker/baseline.ts` (+ test)
- `src/App.tsx`, `src/route.ts` (+ test, `usePathname` and `navigate`),
  `src/Link.tsx`, `src/HomePage.tsx`, `src/VehiclePage.tsx`,
  `src/BaselineForm.tsx`, `src/StatusBadge.tsx`, `src/Feedback.tsx`,
  `src/api.ts` (fetch helpers and `useApi`), `src/format.ts` (+ test)
- No schema change: `schedule_items.baseline_date` and `baseline_odometer` exist.

## Data / contracts

### Scheduling rules

- **Today** is the current date in `America/New_York`, as `YYYY-MM-DD`, computed
  on the server.
- **Next due date** = `baselineDate + intervalMonths` (calendar months, clamped to
  the last day of the target month: 2026-01-31 + 1 = 2026-02-28). Null when
  either is null.
- **Next due miles** = `baselineOdometer + intervalMiles`. Null when either is
  null.
- **Status per dimension:**
  - date: `overdue` when today is after the due date; `soon` when the due date is
    within 30 days (inclusive, so the due day itself is `soon`); else `ok`.
  - miles: only when current mileage is known: `overdue` when current miles
    exceed due miles; `soon` within 1,000 miles (inclusive); else `ok`.
- **Item status** = the worse of the computable dimensions
  (`overdue` > `soon` > `ok`). `unknown` when no dimension is computable (no
  baseline; a baseline whose units don't match the interval; or a mileage-only
  due point while current mileage is unknown).
- **Current mileage** is `null` in this feature; feature 3 supplies it.

### Types (`shared/api.ts`)

```ts
type ItemStatus = 'ok' | 'soon' | 'overdue' | 'unknown'

interface ScheduleItemView {
  id: number
  serviceName: string
  intervalMiles: number | null
  intervalMonths: number | null
  baselineDate: string | null      // YYYY-MM-DD
  baselineOdometer: number | null
  nextDueDate: string | null
  nextDueMiles: number | null
  status: ItemStatus
}

interface Vehicle {
  id: number
  name: string
  scheduleModel: ScheduleModel
  attention: { soon: number; overdue: number } | null
}
interface VehicleDetailResponse { vehicle: Vehicle; today: string; items: ScheduleItemView[] }
interface ScheduleItemResponse { item: ScheduleItemView }
interface ErrorResponse { error: { message: string; fields?: Record<string, string> } }
```

`attention` is `null` for `minder` vehicles. Items are ordered by service name.

### Endpoints

- `GET /api/vehicles/:id` -> 200 `VehicleDetailResponse`. Non-integer or unknown
  id -> 404 `{ error: { message: "Vehicle not found" } }`. Minder vehicles return
  `items: []`.
- `PUT /api/schedule-items/:id/baseline`, JSON body
  `{ "baselineDate": "YYYY-MM-DD" | null, "baselineOdometer": number | null }`.
  Both keys required; both null clears the baseline.
  - 200 `ScheduleItemResponse` with recomputed due points and status.
  - 400 `{ error: { message: "Invalid baseline", fields } }` for: body not JSON or
    not an object; a missing key; `baselineDate` not a real calendar date in
    `YYYY-MM-DD`, or after today (Eastern); `baselineOdometer` not an integer from
    0 to 999,999.
  - 404 for a non-integer or unknown schedule item id.
- Unexpected errors keep the existing generic 500 shape.

## Testing

Gate: `npm test` (Vitest). Unit tests for `shared/schedule.ts` and
`parseBaselineInput`; route tests through `app.request` with stub env for 404 and
400 paths. D1 happy paths are verified with `curl` against the dev server and local
D1 (no Worker-runtime test pool is installed; don't add one). UI verified in the
browser.

## Notes for the AI

- Status labels are text plus color: `OK`, `Due soon`, `Overdue`, `Not set`.
  `unknown` with a baseline present reads `Needs mileage`.
- Show dates in a short readable form (`Mar 4, 2027`) formatted in UTC from the
  `YYYY-MM-DD` string so there's no timezone off-by-one. Miles with thousands
  separators.
- Form inputs: `<input type="date" max={today}>` and
  `<input type="number" inputmode="numeric" min=0>`, each with a visible label;
  field errors linked by `aria-describedby` and announced with `role="alert"`;
  errors clear on edit.
- Don't trust client validation; the server re-validates everything.
- Keep the routing hook tiny: two routes, no nested routing, no new dependency.
- Baseline dates in the future are rejected; today is allowed.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":8854,"specSha256":"233cc760565387774154e4bff6f18d069853ef4ff1a94f6ac9a8d5e4951e52cc","branch":"refs/heads/feature/corolla-baselines-and-status","head":"3c7e00ab51ae7452fcf6741b56cd6c76ffd35df5","baseRef":"refs/heads/main","baseCommit":"ab1765a1a5fd0224fc1efe40283b362f5705fe6e","sourceTree":"fba3f6cde023333109be210f9a15816f799556ff","landing":"local-merge","absentOptional":[]} -->

## Findings

### 02/F-02 [P2] closed - Baseline form silently drops unparseable odometer input

**File:** src/BaselineForm.tsx:49
**Found:** 2026-11-07 by /audit (scope: current; lens: quality; independent review)
**Why it matters:** The odometer field is `type="number"` and the form sets `noValidate`. Per the HTML value-sanitization rule, a number input whose text is not a valid number (for example `61,000` typed in desktop Firefox, or a lone `-` or `e` in Chrome) reports `value === ""`. `handleSubmit` treats an empty string as "no odometer" and sends `baselineOdometer: null`, so the user's typed mileage is discarded with no field error. With a date filled in, the baseline saves date-only; with no date, the submit sends both nulls, which clears an existing baseline. The client regex check on line 50 never sees the bad text.
**Suggested fix:** In `handleSubmit`, read the odometer input's `validity.badInput` (via a ref or the form element) and show the existing `Enter whole miles.` field error instead of saving. No current requirement is lost.
**Resolution:** Fixed in spec step 6: `handleSubmit` now checks the odometer input's `validity.badInput` via a ref and shows `Enter whole miles.` without sending a request. Browser check: typing `-` with the date empty showed the field error, made no PUT, and left the existing baseline unchanged. Awaiting re-review to close.
Closed 2026-11-07 by independent /audit (scope: current; all lenses; target 3c7e00a): re-examined `src/BaselineForm.tsx:48-59` at the target. `handleSubmit` reads `odometerRef.current.validity.badInput` (ref attached at line 98) before trusting an empty value, returns early with the `Enter whole miles.` field error and no `save` call, and the regex still rejects signs, decimals, and exponents in parseable text. The repair (commit 3c7e00a, 9 lines in this file) adds no new defect; `npm test`, `npm run lint`, and `npm run build` pass. The matching gap on the date field predates the repair and is tracked separately as F-03.

## Independent review

**Status:** passed
**Target commit:** 3c7e00ab51ae7452fcf6741b56cd6c76ffd35df5
**Base commit:** ab1765a1a5fd0224fc1efe40283b362f5705fe6e
**Base ref:** main
**Spec hash:** 233cc760565387774154e4bff6f18d069853ef4ff1a94f6ac9a8d5e4951e52cc
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-07T20:09:03Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-07T20:10:29Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `<base>..<target>` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `npm test`: pass (5 files, 48 tests)
- `npm run lint`: pass
- `npm run build`: pass (includes `tsc -b` typecheck)
- `npx wrangler d1 execute DB --local` (SELECT schedule item counts per vehicle): pass

### Evidence

- Freshness confirmed: HEAD = 3c7e00ab51ae7452fcf6741b56cd6c76ffd35df5, `git merge-base main HEAD` = ab1765a1a5fd0224fc1efe40283b362f5705fe6e, `current-feature.md` SHA-256 matches the spec hash, and the only dirty paths are `blueprint/context/review.md` and `blueprint/context/findings.md`.
- Reviewed the full `ab1765a..3c7e00a` delta (2 commits, 20 files): `shared/schedule.ts`, `shared/api.ts`, `worker/index.ts`, `worker/baseline.ts`, `src/App.tsx`, `src/route.ts`, `src/Link.tsx`, `src/HomePage.tsx`, `src/VehiclePage.tsx`, `src/BaselineForm.tsx`, `src/StatusBadge.tsx`, `src/Feedback.tsx`, `src/api.ts`, `src/format.ts`, every test file in the delta, and the active spec. Context: `worker/db/schema.ts`, `migrations/0001_seed.sql`, `wrangler.jsonc`.
- Security: the server re-validates every baseline field (`worker/baseline.ts`). Ids are parsed with a strict regex, and Drizzle parameterizes queries. Unexpected errors return the generic 500. Cross-site PUT needs a CORS preflight, and the Worker sends no CORS headers. Access control is the documented Cloudflare Access deployment. Local D1 has schedule items only for the interval vehicle.
- Performance: each endpoint makes at most two or three bounded queries over a seven-row reference set, with no N+1 pattern. `useApi` aborts superseded requests.
- Tests: no focused, skipped, or todo tests. The scheduling rules, baseline parser, route matcher, and formatters have edge-case coverage. The 404 and 400 route paths go through `app.request`. Per coding standards, the UI components are covered by browser evidence, not unit tests.
- Ledger: F-02 re-examined at `src/BaselineForm.tsx:48-59` and closed. F-03 is new (P2, open). F-01 is still accurate (`coding-standards.md:5` still says the backend is not installed) and stays open.

### Findings

- F-02 [P2] closed - Baseline form silently drops unparseable odometer input
- F-03 [P2] open - Baseline form silently drops an incomplete date entry
- F-01 [P3] open (pre-existing, unchanged) - Coding standards still describe the backend as absent

### Remaining risk

- This review ran no browser. The F-03 date-input behavior and the F-02 repair were checked from code and documented browser behavior, not reproduced in a browser.
- Feature D1 happy paths (`curl` against a local dev server) were not re-run, because the reviewer may not start long-running servers. Only route unit tests and a local D1 SELECT were run.
- No browser test command or security scanner is declared, so no dependency vulnerability scan was performed.

## Try it now

1. `npm run dev`, then open http://localhost:5173
2. Click the Corolla card: all 7 services show "Not set".
3. On "Tire rotation", click "Set last done", enter a date about 5.5 months ago, and save: it becomes "Due soon".
4. Try a future date: an inline error appears and nothing is saved.
5. Go back home: the Corolla card shows "1 due soon".
