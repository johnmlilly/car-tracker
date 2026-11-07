# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] open - Coding standards still describe the backend as absent

**File:** blueprint/context/coding-standards.md:5
**Found:** 2026-11-07 by /audit (scope: current; lens: quality)
**Why it matters:** This feature lands the Hono Worker, D1, Drizzle migrations, `shared/api.ts`, and removes the template CSS, but the standards file still says the backend "is not installed yet" (line 5), keeps the Worker layout and API-client layout as TODOs (lines 40, 43), keeps the "no backend exists yet" Data and API Boundaries TODO (line 66), and still tells readers to remove `src/App.css` leftovers that are already gone. The standards file itself says to add backend conventions "when the first feature that uses it lands". Later features (2-9) will read stale guidance on where API types, migrations, and request validation live.
**Suggested fix:** Replace the TODOs with the conventions this feature established: `worker/index.ts` Hono app under `/api`, `worker/db/schema.ts` plus `npm run db:generate` and custom migrations for seed data, `shared/api.ts` for response types shared by client and Worker, the error shape, and drop the template-leftover note. Documentation only; no behavior is lost.
**Resolution:**

### F-03 [P2] open - Baseline form silently drops an incomplete date entry

**File:** src/BaselineForm.tsx:58
**Found:** 2026-11-07 by /audit (scope: current; lenses: quality, security, performance, tests; independent review)
**Why it matters:** This is the same failure as F-02, but on the date field. The date input is `type="date"` inside a `noValidate` form. When a date is only partly entered (for example month and year filled but no day, or the user deletes one segment of an existing date), browsers report `value === ""` with `validity.badInput === true`. `onChange` stores `''`, and `handleSubmit` sends `baselineDate: date || null` without checking the date input's validity. The baseline then saves odometer-only and drops the date the user meant to enter, with no field error. If the odometer is also blank, the submit sends both nulls and clears the existing baseline. Server validation cannot catch this because it receives a well-formed `null`. Evidence comes from the code path and standard browser behavior for date inputs; this pass did not reproduce it in a browser.
**Suggested fix:** Treat the date input the same way the F-02 repair treats the odometer: add a ref and, in `handleSubmit`, show a `baselineDate` field error such as `Enter a valid date.` without saving when `validity.badInput` is true. No current requirement is lost.
**Resolution:**

### F-04 [P3] open - Worker copies the client date and miles formatters

**File:** worker/odometer.ts:8
**Found:** 2026-11-07 by /audit (scope: current; lenses: quality, security, performance, tests; independent review)
**Why it matters:** `worker/odometer.ts` lines 8-15 define `miles`, `DATE_FORMAT`, and `day`, which are byte-for-byte copies of `formatMiles`, `DATE_FORMAT`, and `formatDate` in `src/format.ts`. The conflict messages and the UI copy must render miles and dates identically (`61,000 mi`, `Oct 1, 2026`), so two copies can drift apart silently. `shared/` already exists for code used by both the Worker and the client.
**Suggested fix:** Move `formatDate` and `formatMiles` into a module under `shared/` (or have the Worker import them from one shared place) and delete the copies in `worker/odometer.ts`. Re-export from `src/format.ts` if that keeps client imports unchanged. No current requirement is lost.
**Resolution:**
