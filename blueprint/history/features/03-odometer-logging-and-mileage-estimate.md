# Feature: Odometer logging and mileage estimate

**From build-plan:** feature 3
**Build attempt:** 1
**Branch:** feature/odometer-logging-and-mileage-estimate
**Status:** verified

## Goal

Let me log odometer readings for either vehicle, estimate each vehicle's current
mileage from its recent readings and driving rate, show that estimate on the home
cards and the vehicle detail screen, and use it to drive the Corolla's
mileage-based due status.

## In scope

- `odometer_logs` table (Drizzle schema plus a generated migration).
- Pure estimate logic in `shared/mileage.ts`.
- Pure request validation for a new reading in `worker/odometer.ts`, including a
  consistency check against the vehicle's existing readings.
- API: list readings, add a reading, delete a reading.
- `Vehicle` responses gain a `mileage` summary; Corolla item status uses the
  estimate as current mileage.
- Odometer screen at `/vehicles/:id/odometer` for both vehicles: form, reading
  list newest first, delete with an inline confirm step.
- Home cards show the estimate and a "Log odometer" action; the vehicle detail
  screen shows the estimate and links to the odometer screen.

## Out of scope

- Readings taken from service records (feature 5). The `odometer_logs.source`
  column is added now with only `manual` written; `service_record_id` is added by
  feature 5 together with `service_records`.
- Using Corolla baselines as readings. Only `odometer_logs` feed the estimate.
- Editing a reading in place (delete and re-add instead).
- Stale-odometer nudge (feature 9) and Minder logging (feature 4). The Odyssey
  card title stays non-clickable; only its "Log odometer" action is a link.
- Repairs for the open F-01 and F-03 findings from feature 2. The new form avoids
  the F-03 defect on its own date input.

## Build loop

`workflow.stepReview: feature`, `workflow.checkpointCommits: disabled`. Run under
Autopilot: no per-step pauses, no checkpoint commits. Tests are a gate for logic
steps (`npm test`). Independent review is required (`when-sensitive`: migration).
`/complete` creates the feature commit.

## Build steps

- [x] 1. **Estimate logic.** `shared/mileage.ts` with
  `estimateMileage(readings, today)` per the rules below;
  `shared/mileage.test.ts` covering no readings, one reading, anchor selection
  (oldest within 12 months that is at least 14 days older), fallback to the newest
  older-than-14-days reading beyond 12 months, span under 14 days (no rate),
  same-date ties, rounding, and today equal to the latest date.
  Done when: `npm test` passes with the new cases; build and lint pass.
- [x] 2. **Schema and validation.** `odometerLogs` in `worker/db/schema.ts`,
  migration generated with `npm run db:generate` and applied locally with
  `npm run db:migrate:local`. `worker/odometer.ts` with
  `parseOdometerInput(body, today)` and
  `findConflict(readings, input)`; `worker/odometer.test.ts`.
  Done when: tests pass for missing/invalid/future date, non-integer, negative,
  and over-max odometer, and for conflicts on both sides plus equal values and
  same-date readings; the migration applies locally; build and lint pass.
- [x] 3. **Odometer API.** `GET /api/vehicles/:id/odometer`,
  `POST /api/vehicles/:id/odometer`, `DELETE /api/odometer-logs/:id` per the
  contract. Route tests through `app.request` for invalid ids and invalid bodies.
  Done when: tests pass; `curl` on local D1 adds two readings, lists them newest
  first with a `mileage` estimate, rejects a conflicting reading with 400 and a
  field message, deletes one (204), and 404s an unknown vehicle or reading; build
  and lint pass.
- [x] 4. **Estimate in vehicle responses.** `GET /api/vehicles` and
  `GET /api/vehicles/:id` include `mileage`; Corolla item status and attention
  counts use `mileage.estimate` as current mileage (replacing the
  `CURRENT_MILES` placeholder).
  Done when: tests and build pass; `curl` shows `mileage` on both vehicles; a
  Corolla item with only a mileage baseline moves from `unknown` to a real
  status once a reading exists.
- [x] 5. **Odometer screen.** Route `/vehicles/:id/odometer`; screen with the
  vehicle name, current estimate, form (date defaulting to today, odometer),
  reading list newest first, inline two-tap delete; loading, error-with-retry,
  not-found, and empty states. Date and odometer inputs treat
  `validity.badInput` as invalid. Field errors from the API shown next to the
  field and announced.
  Done when: in the browser, adding a reading updates the list and estimate; a
  conflicting reading shows the field error; an incomplete date shows
  `Enter a valid date.` without a request; deleting asks for confirmation and
  then removes the row; `/vehicles/999/odometer` shows not found; no console
  errors; build, lint, test pass.
- [x] 6. **Home and detail display.** Home cards show the estimate (or
  "No mileage logged") and a "Log odometer" link for both vehicles without
  nesting links; vehicle detail shows the estimate with a link to the odometer
  screen.
  Done when: in the browser, both cards show mileage and open the odometer
  screen; the Corolla card still opens its detail page; the detail page shows
  the estimate; build, lint, test pass.

## Files / areas

- `shared/mileage.ts` (+ test), `shared/api.ts`
- `worker/db/schema.ts`, `migrations/0002_*.sql` and `migrations/meta/`
- `worker/odometer.ts` (+ test), `worker/index.ts`, `worker/index.test.ts`
- `src/route.ts` (+ test), `src/App.tsx`, `src/OdometerPage.tsx`,
  `src/OdometerForm.tsx`, `src/MileageText.tsx`, `src/styles.ts` (form classes
  shared with `BaselineForm`), `src/HomePage.tsx`, `src/VehiclePage.tsx`,
  `src/api.ts` (204 handling), `src/format.ts` (+ test, `describeMileage`)

## Data / contracts

### Table `odometer_logs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer pk autoincrement | |
| `vehicle_id` | integer not null | fk -> `vehicles.id` |
| `date` | text not null | `YYYY-MM-DD` |
| `odometer` | integer not null | whole miles, 0 to 999,999 |
| `source` | text not null default `manual` | enum `manual` \| `record` |

Index on `(vehicle_id, date)`. Additive migration; no existing data changes.

### Estimate rules (`estimateMileage`)

Readings are ordered by `date`, then `odometer`, ascending. `today` is the
Eastern date from `todayInEastern`.

- No readings: `null`.
- **Latest** = last reading in that order.
- **Candidates** = readings dated at least 14 days before the latest.
- **Anchor** = the oldest candidate dated within 12 calendar months of the latest; if none,
  the newest candidate; if there are no candidates, no anchor.
- **Rate** (`milesPerDay`) = `(latest.odometer - anchor.odometer) / days`, floored
  at 0. `null` without an anchor.
- **Estimate** = `latest.odometer + round(rate * max(0, days from latest to
  today)))`; equals `latest.odometer` when rate is `null`.

### Validation (`parseOdometerInput`, `findConflict`)

- `date` required, valid `YYYY-MM-DD`, not after today (Eastern).
  Messages: `Enter a valid date.`, `Date can't be in the future.`
- `odometer` required integer 0 to 999,999.
  Message: `Enter whole miles from 0 to 999,999.`
- Conflict (field `odometer`): a reading on an earlier date with a higher
  odometer -> `Lower than <n> mi logged on <Mon D, YYYY>.`; a reading on a later date
  with a lower odometer -> `Higher than <n> mi logged on <Mon D, YYYY>.` Same-date
  readings never conflict. Equal values never conflict.

### API

All errors use the existing `ErrorResponse` shape. Invalid or unknown ids return
404 (`Vehicle not found` / `Reading not found`).

- `GET /api/vehicles/:id/odometer` -> `OdometerResponse`
- `POST /api/vehicles/:id/odometer` body `{ date, odometer }` -> 201
  `OdometerResponse`; 400 `{ error: { message: 'Invalid reading', fields } }`
- `DELETE /api/odometer-logs/:id` -> 204

### Types (`shared/api.ts`)

```ts
interface OdometerReading {
  id: number
  date: string          // YYYY-MM-DD
  odometer: number
  source: 'manual' | 'record'
}

interface MileageSummary {
  estimate: number
  latest: { date: string; odometer: number }
  milesPerDay: number | null
}

interface Vehicle {
  // existing fields
  mileage: MileageSummary | null
}

interface OdometerResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  readings: OdometerReading[]  // newest first
}
```

### UI copy

- Estimate: `~62,340 mi` with secondary text `Estimated from 61,000 mi on Oct 1,
  2026` (or `Logged Oct 1, 2026` when there is no rate). No readings:
  `No mileage logged`.
- Delete confirm: `Delete` then `Confirm delete` / `Cancel` inline.

## Testing

- `shared/mileage.test.ts` - estimate rules (step 1).
- `worker/odometer.test.ts` - validation and conflicts (step 2).
- `worker/index.test.ts` - invalid id and invalid body paths for the new routes
  (step 3).
- `src/route.test.ts` - the new odometer route (step 5).
- Happy paths through D1 and the UI are verified with `curl` and the browser,
  not unit tests.

## Notes for the AI

- Keep estimate math pure and free of D1 so it is unit-testable.
- Mirror `BaselineForm` patterns (field errors, `role="alert"`, `badInput`).
- A card cannot contain a link inside a link; restructure the card so the title
  link and the "Log odometer" link are siblings.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":9302,"specSha256":"4a90d3a6e75261a6d39ebbd0a3a84868b1d72d58b8c59413951e3446cf76c7b4","branch":"refs/heads/feature/odometer-logging-and-mileage-estimate","head":"a88cbbe5908a2a8be9f0dfd9bd9496d2c5d33d4a","baseRef":"refs/heads/main","baseCommit":"020d61a06a9a30799a27e829ae81d7ce442f20b0","sourceTree":"0f53af3239dbd81b815e93b2d073480decf5f642","landing":"local-merge","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** a88cbbe5908a2a8be9f0dfd9bd9496d2c5d33d4a
**Base commit:** 020d61a06a9a30799a27e829ae81d7ce442f20b0
**Base ref:** main
**Spec hash:** 4a90d3a6e75261a6d39ebbd0a3a84868b1d72d58b8c59413951e3446cf76c7b4
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-07T20:24:34Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-07T20:26:07Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm test`: pass (7 files, 94 tests)
- `npm run lint`: pass
- `npm run build`: pass (tsc -b typecheck plus client and Worker bundles)

### Evidence

- Freshness: HEAD equals Target commit; `git merge-base main a88cbbe` equals Base commit; sha256 of `blueprint/context/current-feature.md` equals Spec hash; only `blueprint/context/review.md` was dirty before review.
- Reviewed the full `020d61a..a88cbbe` delta (26 files): `shared/mileage.ts` (+ test), `shared/api.ts`, `shared/schedule.ts`, `worker/odometer.ts` (+ test), `worker/index.ts` (+ test), `worker/db/schema.ts`, `migrations/0002_odometer_logs.sql` and meta, and the client files under `src/`.
- `estimateMileage` matches the spec rules: ascending sort by date then odometer, 14-day candidate filter, oldest candidate within 12 months else newest candidate, rate floored at 0, no division by zero (anchor span is at least 14 days), rounding and non-negative elapsed days.
- `parseOdometerInput` and `findConflict` match the spec messages, bounds, same-date exemption, and equal-value exemption; tests cover each.
- New routes parse ids with the existing strict `parseId`, return 404 for invalid or unknown ids, validate before touching D1, and use parameterized Drizzle queries. No in-app auth is by design (Cloudflare Access).
- Migration is additive (new table, FK to `vehicles`, index on `(vehicle_id, date)`); snapshot `prevId` chain 0000 -> 0001 -> 0002 is intact.
- Client form checks `validity.badInput` on both date and odometer inputs, shows field errors with `role="alert"` and `aria-describedby`; home card uses sibling links (title overlay plus a `z-10` Log odometer link), so no nested links.
- `describeMileage` shows `Logged <date>` when the rate is 0 or the estimate equals the latest reading, not only when the rate is null. Treated as a reasonable copy choice, not a defect.

### Findings

- F-04 [P3] open: Worker copies the client date and miles formatters (worker/odometer.ts:8)
- Pre-existing F-01 [P3] and F-03 [P2] remain open and out of this feature's scope per the spec.

### Remaining risk

- Happy paths through D1 (add, list, conflict, delete, Corolla status change) and the browser flows were not exercised by this review; they rely on the builder's curl and browser evidence. No browser test command is declared.
- Check was not run (not required).
- Performance of `GET /api/vehicles` loads every reading for all vehicles per request; fine at personal scale, unverified at large reading counts.

## Try it now

1. `npm run dev` (or your running dev server), then open http://localhost:5173
2. Tap **Log odometer** on the Corolla card.
3. Log `58000` dated about 30 days ago, then `60000` dated a few days ago: the heading shows `~60,xxx mi` with "Estimated from 60,000 mi on ...".
4. Try `50000` dated today: the field error "Lower than 60,000 mi logged on ..." appears and nothing is saved.
5. Delete a reading: tap **Delete**, then **Confirm delete**; it disappears and the estimate updates.
6. Go home: both cards show mileage (or "No mileage logged").
