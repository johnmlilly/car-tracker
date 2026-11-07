# Fix: Clear open audit findings

**Type:** Fix
**Status:** verified
**Branch:** fix/clear-open-audit-findings
**Fixes:** F-03, F-04, F-01

## The problem

Three findings from features 2 and 3 are still open in
`blueprint/context/findings.md`:

- **F-03 [P2]** - `src/BaselineForm.tsx` drops a partly entered date. A
  `type="date"` input with a missing segment reports `value === ""` and
  `validity.badInput === true`. `handleSubmit` sends `baselineDate: null`, so the
  baseline saves without the date the user meant to enter. If the odometer is also
  blank, the existing baseline is cleared. No error is shown.
- **F-04 [P3]** - `worker/odometer.ts` lines 8-15 copy `formatMiles` and
  `formatDate` from `src/format.ts` for its conflict messages, so server messages
  and UI copy can drift apart.
- **F-01 [P3]** - `blueprint/context/coding-standards.md` still says the backend
  is not installed. It keeps TODOs for the Worker layout, the client file layout,
  and Data and API Boundaries. It also tells readers to remove `src/App.css`,
  which no longer exists. Later features read stale guidance.

## The fix

- **F-03:** add a ref to the date input. In `handleSubmit`, when
  `validity.badInput` is true, show the `baselineDate` field error
  `Enter a valid date.` and do not send a request. This is the same pattern as
  the odometer check above it and as `src/OdometerForm.tsx`. A truly empty date
  still means "no date". Clearing a baseline with **Clear** is unchanged.
- **F-04:** move `formatDate` and `formatMiles` (with the `DATE_FORMAT` constant)
  into `shared/format.ts`. `src/format.ts` re-exports them so client imports stay
  unchanged. `worker/odometer.ts` imports them and its local copies are deleted.
  The output strings do not change (`61,000 mi`, `Oct 1, 2026`), so existing
  tests stay green.
- **F-01:** documentation only. Replace the stale backend notes and TODOs with
  the conventions already in the code:
  - Worker: Hono app in `worker/index.ts` under `/api`; request validation as
    pure functions in `worker/*.ts` with tests; errors use the `ErrorResponse`
    shape (400 with `fields`, 404, generic 500).
  - Data: Drizzle schema in `worker/db/schema.ts`; `npm run db:generate` for
    migrations; seed data in custom migrations; apply remote migrations before
    deploying dependent code.
  - Shared: response types in `shared/api.ts`; pure logic and formatters used by
    both sides in `shared/`.
  - Client: flat `src/` with one component per file, `src/api.ts` for
    `apiRequest` and `useApi`, `src/route.ts` for routing, `src/styles.ts` for
    shared form classes.
  - Remove the `src/App.css` leftover note. The Worker stack has landed, but
    Workers AI is not installed, so do not describe it as installed.

Must not break: existing baseline save, clear, and odometer validation; the
odometer conflict messages; any test.

No new dependencies or abstractions.

## Build steps

- [x] 1. **F-03: reject a partly entered baseline date.** Add `dateRef` and the
  `badInput` check in `src/BaselineForm.tsx`.
  Done when: in the browser, deleting the day segment of the Corolla baseline
  date and saving shows `Enter a valid date.` and sends no PUT; the existing
  baseline is unchanged; a full date still saves; build, lint, and test pass.
- [x] 2. **F-04: one copy of the formatters.** Create `shared/format.ts`.
  Re-export from `src/format.ts` and import it in `worker/odometer.ts`. Move the
  `formatDate` and `formatMiles` tests to `shared/format.test.ts`.
  Done when: `grep` finds no `Intl.DateTimeFormat` in `worker/`; the
  `findConflict` message tests still pass unchanged; build, lint, and test pass.
- [x] 3. **F-01: bring coding standards up to date.** Edit
  `blueprint/context/coding-standards.md` as described above.
  Done when: the file has no "not installed yet" or "no backend exists yet"
  text, no Worker or client-layout TODO, and no `src/App.css` note; every path
  it names exists.

## Verify

- `npm test`, `npm run lint`, `npm run build` all pass.
- Browser: Corolla detail, then **Set last done** on any item. Pick a full date,
  then clear only the day segment and press Save. You should see
  `Enter a valid date.`, and the network tab should show no PUT.
- Odometer screen: a reading lower than an earlier one still shows
  `Lower than <n> mi logged on <Mon D, YYYY>.`


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4354,"specSha256":"1bef54e665d23124bbd57f4ac4b4039cc056ae68c26683b59ca70ea8046c8587","branch":"refs/heads/fix/clear-open-audit-findings","head":"8a5531f73c9345cd5fc31f033dd2889732405297","baseRef":"refs/heads/main","baseCommit":"8a5531f73c9345cd5fc31f033dd2889732405297","sourceTree":"d6e0173576e120ad5275bb75472440bac93a663c","landing":"local-merge","absentOptional":[]} -->

## Findings

### clear-open-audit-findings/F-01 [P3] closed - Coding standards still describe the backend as absent

**File:** blueprint/context/coding-standards.md:5
**Found:** 2026-11-07 by /audit (scope: current; lens: quality)
**Why it matters:** This feature lands the Hono Worker, D1, Drizzle migrations, `shared/api.ts`, and removes the template CSS, but the standards file still says the backend "is not installed yet" (line 5), keeps the Worker layout and API-client layout as TODOs (lines 40, 43), keeps the "no backend exists yet" Data and API Boundaries TODO (line 66), and still tells readers to remove `src/App.css` leftovers that are already gone. The standards file itself says to add backend conventions "when the first feature that uses it lands". Later features (2-9) will read stale guidance on where API types, migrations, and request validation live.
**Suggested fix:** Replace the TODOs with the conventions this feature established: `worker/index.ts` Hono app under `/api`, `worker/db/schema.ts` plus `npm run db:generate` and custom migrations for seed data, `shared/api.ts` for response types shared by client and Worker, the error shape, and drop the template-leftover note. Documentation only; no behavior is lost.
**Resolution:** Fixed in fix/clear-open-audit-findings step 3: `coding-standards.md` header and Stack now list the installed backend; File Organization documents the client, Worker, and `shared/` layout; Data and API Boundaries documents `apiRequest`/`useApi`, pure `parse*Input` validation, the `ErrorResponse` shape, and the migration workflow; the `src/App.css` note is gone. `grep` finds no TODO, "not installed yet", or `App.css` text, and every named path exists. Awaiting re-review to close.
Closed 2026-11-07 by /audit (scope: current; all lenses; base 8a5531f, uncommitted fix delta): `coding-standards.md` no longer contains TODO, "not installed yet", "no backend exists yet", or `App.css` text. Every file path it names exists. The documented conventions (`parse*Input(body, today)` returning `{ ok, value }` or `{ ok: false, fields }`, `parseId` 404s, the `app.onError` generic 500, the migration commands, and `todayInEastern`) match `worker/index.ts`, `worker/baseline.ts`, `worker/odometer.ts`, and `package.json`. No new defect.

### clear-open-audit-findings/F-03 [P2] closed - Baseline form silently drops an incomplete date entry

**File:** src/BaselineForm.tsx:58
**Found:** 2026-11-07 by /audit (scope: current; lenses: quality, security, performance, tests; independent review)
**Why it matters:** This is the same failure as F-02, but on the date field. The date input is `type="date"` inside a `noValidate` form. When a date is only partly entered (for example month and year filled but no day, or the user deletes one segment of an existing date), browsers report `value === ""` with `validity.badInput === true`. `onChange` stores `''`, and `handleSubmit` sends `baselineDate: date || null` without checking the date input's validity. The baseline then saves odometer-only and drops the date the user meant to enter, with no field error. If the odometer is also blank, the submit sends both nulls and clears the existing baseline. Server validation cannot catch this because it receives a well-formed `null`. Evidence comes from the code path and standard browser behavior for date inputs; this pass did not reproduce it in a browser.
**Suggested fix:** Treat the date input the same way the F-02 repair treats the odometer: add a ref and, in `handleSubmit`, show a `baselineDate` field error such as `Enter a valid date.` without saving when `validity.badInput` is true. No current requirement is lost.
**Resolution:** Fixed in fix/clear-open-audit-findings step 1: `src/BaselineForm.tsx` adds `dateRef`, and `handleSubmit` shows `Enter a valid date.` without saving when `validity.badInput` is true. Browser check: deleting the day segment of an existing Tire rotation baseline and pressing Save showed the error, made no PUT, and left the baseline unchanged; a full date then saved (PUT 200). Awaiting re-review to close.
Closed 2026-11-07 by /audit (scope: current; all lenses; base 8a5531f, uncommitted fix delta): re-examined `src/BaselineForm.tsx:46-63` and the date input at line 79. `dateRef` is attached, `handleSubmit` returns early with `Enter a valid date.` when `validity.badInput` is true, a truly blank date still sends `null`, odometer validation is unchanged, and both field errors can now show together. The existing `baselineDate` error element renders it with `role="alert"`. No new defect; tests, lint, and build pass.

### clear-open-audit-findings/F-04 [P3] closed - Worker copies the client date and miles formatters

**File:** worker/odometer.ts:8
**Found:** 2026-11-07 by /audit (scope: current; lenses: quality, security, performance, tests; independent review)
**Why it matters:** `worker/odometer.ts` lines 8-15 define `miles`, `DATE_FORMAT`, and `day`, which are byte-for-byte copies of `formatMiles`, `DATE_FORMAT`, and `formatDate` in `src/format.ts`. The conflict messages and the UI copy must render miles and dates identically (`61,000 mi`, `Oct 1, 2026`), so two copies can drift apart silently. `shared/` already exists for code used by both the Worker and the client.
**Suggested fix:** Move `formatDate` and `formatMiles` into a module under `shared/` (or have the Worker import them from one shared place) and delete the copies in `worker/odometer.ts`. Re-export from `src/format.ts` if that keeps client imports unchanged. No current requirement is lost.
**Resolution:** Fixed in fix/clear-open-audit-findings step 2: `formatDate` and `formatMiles` moved to `shared/format.ts` (tests in `shared/format.test.ts`); `src/format.ts` re-exports them and `worker/odometer.ts` imports them. No `Intl.DateTimeFormat` remains in `worker/`; the `findConflict` message tests pass unchanged. Awaiting re-review to close.
Closed 2026-11-07 by /audit (scope: current; all lenses; base 8a5531f, uncommitted fix delta): `shared/format.ts` is now the only `formatDate`/`formatMiles` implementation. `worker/odometer.ts` imports it, `src/format.ts` re-exports it so `OdometerPage.tsx` imports are unchanged, and `shared/` is in both the app and Worker tsconfig includes. `worker/` has no `Intl.DateTimeFormat`. The formatter tests moved to `shared/format.test.ts` and the `findConflict` message assertions pass unchanged. No new defect.

## Try it now

1. Open the Corolla detail page and tap **Set last done** on any service.
2. Pick a full date, delete just the day segment, and press **Save**: "Enter a valid date." appears and nothing saves.
3. Re-enter the day and save: it saves as before.
4. On the odometer screen, a reading lower than an earlier one still says "Lower than <n> mi logged on <Mon D, YYYY>."
