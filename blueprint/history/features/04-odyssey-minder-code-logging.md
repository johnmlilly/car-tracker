# Feature: Odyssey Minder code logging

**From build-plan:** feature 4
**Build attempt:** 1
**Branch:** feature/odyssey-minder-code-logging
**Status:** verified

## Goal

Let me log the Maintenance Minder code the Odyssey shows (for example `B12`),
open the services that code maps to as overdue due items, and track the Odyssey
on the same interval schedule as the Corolla, so each Odyssey service shows the
worse of its interval status and any open Minder item.

## In scope

- `minder_logs` and `due_items` tables (Drizzle schema plus a generated migration).
- Pure code parsing in `worker/minder.ts`: normalize and validate a code, then
  resolve it to service ids from the `minder_codes` lookup.
- API: list a Minder vehicle's logs, log a code (atomically opening its due
  items), delete a log (with its due items) to fix a typo.
- Odyssey due status: open due items are `overdue` immediately; home attention
  counts and the vehicle detail response include them.
- Minder screen at `/vehicles/:id/minder`: code form (optional odometer), log
  history newest first with mapped services, inline two-tap delete.
- Odyssey card title links to its detail page; card and detail page get a
  "Log Minder code" link. Detail page lists open due items.
- Odyssey interval schedule: a seed migration copies the Corolla's
  `schedule_items` services and intervals to the Odyssey (tire rotation is
  already 5,000 mi / 6 months), with no baselines.
- Combined Odyssey status: a schedule item with an open Minder item for the same
  service is `overdue` and shows which code opened it; Minder items without an
  interval item list separately. Odyssey "last done" baselines use the existing
  form.

## Out of scope

- Closing due items (feature 5). `due_items.closed_by_service_item_id` is added
  by feature 5 together with `service_items` (nullable `ADD COLUMN ... REFERENCES`
  is valid in SQLite). Until then every due item is open. Feature 5 must also
  block deleting a log that has closed items.
- Receipt Minder code cross-check (feature 7) and historical codes from bulk
  import (feature 8).
- Forecasting the next code. Odyssey "soon" comes only from interval items.
- An interval for transmission fluid or other services not on the Corolla list
  (they are Minder-only).
- Writing the optional odometer into `odometer_logs`. Readings come only from
  manual odometer logs and confirmed service records.
- Editing a log in place (delete and re-log instead). Choosing a past
  `loggedAt` (it is the server time of logging).
- Correcting the seeded Minder lookup meanings.

## Build loop

`workflow.stepReview: feature`, `workflow.checkpointCommits: disabled`. No
per-step pauses or checkpoint commits. Tests are a gate for logic steps
(`npm test`). Independent review is required (`when-sensitive`: migration and a
destructive delete). `/complete` creates the feature commit.

## Build steps

- [x] 1. **Code parsing.** `worker/minder.ts` with `parseMinderInput(body)` and
  `resolveServices(code, lookup)` per the rules below; `worker/minder.test.ts`.
  Done when: tests cover lowercase and spaced input, `B21` normalizing to `B12`,
  missing main letter, unknown letter, repeated digit, non-digit sub-item,
  sub-item absent from the lookup (`6`), odometer null/omitted/invalid/over-max,
  and service ids deduped across main and sub rows; `npm test`, build, lint pass.
- [x] 2. **Schema.** `minderLogs` and `dueItems` in `worker/db/schema.ts`;
  migration from `npm run db:generate`, applied with `npm run db:migrate:local`.
  Done when: the migration is additive only, applies locally, and build passes.
- [x] 3. **Minder API.** `GET` and `POST /api/vehicles/:id/minder`,
  `DELETE /api/minder-logs/:id` per the contract. The log row and its due items
  are written in one `db.batch` (D1 batches are transactional); delete removes
  due items and the log in one `db.batch`. Route tests through `app.request` for
  invalid ids and invalid bodies.
  Done when: tests pass; `curl` on local D1 logs `b12` (stored `B12`, opens Oil
  and filter change, Multi-point inspection, Tire rotation, Engine air filter,
  Cabin air filter, Drive belt inspection), lists it newest first, rejects
  `B6` with a field error, 404s the Corolla and unknown vehicles/logs, and a
  delete returns 204 and removes its `due_items` rows; build and lint pass.
- [x] 4. **Due items in vehicle responses.** `GET /api/vehicles` gives the
  Odyssey `attention: { soon: 0, overdue: <open services> }`;
  `GET /api/vehicles/:id` returns `dueItems` (empty for interval vehicles).
  Done when: tests and build pass; `curl` with two logs sharing a service shows
  that service once in `dueItems` (with the earlier log as `since`) and counts it
  once in `attention.overdue`; with no logs the Odyssey shows `overdue: 0`.
- [x] 5. **Minder screen.** Route `/vehicles/:id/minder`; screen with vehicle
  name, current estimate, code form, log history, inline delete; loading,
  error-with-retry, not-found (unknown or interval vehicle), and empty states.
  Field errors from the API shown next to their field and announced.
  Done when: in the browser, logging `B12` adds it to the history with its
  services; `B6` shows the code field error; a blank code shows `Enter a code
  like A or B12.` without a request; delete asks for confirmation then removes
  the row; `/vehicles/2/minder` (Corolla) and `/vehicles/999/minder` show not
  found; no console errors; build, lint, test pass.
- [x] 6. **Home and detail display.** Odyssey card title links to
  `/vehicles/:id` (same stretched-link pattern as the Corolla) and shows the
  overdue count; both Minder links avoid nesting. Odyssey detail shows mileage,
  "Log odometer" and "Log Minder code" links, and open due items with an
  `Overdue` badge, or the empty copy. Corolla detail is unchanged.
  Done when: in the browser, after logging a code the home card shows
  `N overdue` and opens a detail page listing those items; after deleting the
  log both show nothing due; build, lint, test pass.

- [x] 7. **Odyssey intervals seed.** Custom migration
  (`npm run db:generate -- --custom --name odyssey_intervals`) inserting one
  Odyssey `schedule_items` row per Corolla row (same service, miles, months; null
  baselines); applied locally.
  Done when: local D1 has 7 Odyssey schedule items matching the Corolla's
  intervals; re-running `db:migrate:local` applies nothing; build passes.
- [x] 8. **Combined status in the API.** Pure `mergeMinderStatus(items, due)` in
  `worker/minder.ts` (+ tests): items whose service has an open due item become
  `overdue` with `minderSince`; returns the due items left without an interval
  item. `GET /api/vehicles` and `/api/vehicles/:id` use it for Minder vehicles
  (attention = interval soon/overdue counts after merge + leftover due items);
  `PUT /api/schedule-items/:id/baseline` returns the merged item. Interval
  vehicles get `minderSince: null`.
  Done when: tests cover merge, no due items, and leftovers; `curl` shows 7
  Odyssey items with no logs; after logging `A1` tire rotation and oil are
  `overdue` with `minderSince`, `dueItems` is empty, and attention counts each
  service once; build, lint, test pass.
- [x] 9. **Combined Odyssey detail.** Detail page for the Odyssey lists Minder-only
  overdue items first (heading `From Minder codes`), then the interval items
  (heading `Schedule`) using the existing row with baseline editing; an item with
  `minderSince` shows `Minder <code> on <date>` under its interval. Corolla page
  unchanged.
  Done when: in the browser, the Odyssey shows its 7 schedule items with `Set
  last done`; setting a tire rotation baseline gives a real status; logging `B12`
  marks covered items `Overdue` with the Minder line and lists inspection and
  drive belt under `From Minder codes`; the home card count matches; deleting the
  log restores interval statuses; no console errors; build, lint, test pass.

## Files / areas

- `shared/api.ts`
- `worker/db/schema.ts`, `migrations/0003_*.sql`, `migrations/0004_odyssey_intervals.sql`
  and `migrations/meta/`
- `worker/minder.ts` (+ test), `worker/index.ts`, `worker/index.test.ts`
- `src/route.ts` (+ test), `src/App.tsx`, `src/MinderPage.tsx`,
  `src/MinderForm.tsx`, `src/HomePage.tsx`, `src/VehiclePage.tsx`; reuse
  `src/styles.ts`, `src/Feedback.tsx`, `src/StatusBadge.tsx`, `src/format.ts`

## Data / contracts

### Table `minder_logs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer pk autoincrement | |
| `vehicle_id` | integer not null | fk -> `vehicles.id` |
| `code` | text not null | normalized, e.g. `B12` |
| `logged_at` | text not null | ISO timestamp (`new Date().toISOString()`), server-set |
| `odometer` | integer null | whole miles 0 to 999,999 |

Index on `(vehicle_id, logged_at)`.

### Table `due_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer pk autoincrement | |
| `minder_log_id` | integer not null | fk -> `minder_logs.id` |
| `service_id` | integer not null | fk -> `services.id` |

Unique `(minder_log_id, service_id)`. Each log owns its own rows, so deleting a
log never touches another log's items. Additive migration; no existing data
changes.

### Code rules (`parseMinderInput`, `resolveServices`)

- Body is a JSON object `{ code, odometer? }`; otherwise field `body`:
  `Expected a JSON object.`
- `code`: string; remove all whitespace, uppercase. Must match `^[AB][0-9]*$`
  with no repeated digit; sub-item digits are stored sorted ascending. Else field
  `code`: `Enter a code like A or B12.`
- Every sub-item digit must have `kind = 'sub'` rows in `minder_codes`; else
  field `code`: `Sub-item <d> isn't in this car's Minder list.` (checked in the
  route after parsing, against the lookup rows).
- Services = distinct `serviceId`s from the main letter's `main` rows plus each
  sub-item's `sub` rows.
- `odometer`: omitted or `null` -> null; otherwise integer 0 to 999,999
  (`MAX_ODOMETER`), else field `odometer`:
  `Enter whole miles from 0 to 999,999.`

### Due status

Every open `due_items` row is `overdue`. For a Minder vehicle, a schedule item
whose service has an open due item takes status `overdue` and
`minderSince = since`; `dueItems` then holds only services with no schedule
item. Attention for a Minder vehicle = merged schedule item soon/overdue counts
plus `dueItems.length`. Detail and attention group by service:
one entry per distinct service across all of the vehicle's logs, `since` = the
earliest log that opened it (ties by lower log id). Order by service name.

### API

Errors use `ErrorResponse`. Invalid or unknown ids return 404 (`Vehicle not
found` / `Minder log not found`). A `POST`/`GET` on an interval vehicle returns
404 `Vehicle not found`.

- `GET /api/vehicles/:id/minder` -> `MinderResponse`
- `POST /api/vehicles/:id/minder` body `{ code, odometer? }` -> 201
  `MinderResponse`; 400 `{ error: { message: 'Invalid code', fields } }`
- `DELETE /api/minder-logs/:id` -> 204

### Types (`shared/api.ts`)

```ts
interface MinderLogView {
  id: number
  code: string
  loggedAt: string      // ISO timestamp
  date: string          // YYYY-MM-DD, Eastern date of loggedAt
  odometer: number | null
  services: string[]    // service names, sorted
}

interface MinderResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  logs: MinderLogView[] // newest first (logged_at desc, id desc)
}

interface DueItemView {
  serviceName: string
  status: 'overdue'
  since: { code: string; date: string }
}

interface ScheduleItemView {
  // existing fields
  minderSince: { code: string; date: string } | null // null for interval vehicles
}

interface VehicleDetailResponse {
  // existing fields
  dueItems: DueItemView[] // Minder items with no schedule item; [] for interval vehicles
}
```

### UI copy

- Form: label `Minder code`, help text `As shown on the dash, e.g. B12`;
  `Odometer (optional)`; button `Log code` / `Saving...`.
- History row: code, date, odometer if present, services as a comma list.
- Delete: `Delete` then `Confirm delete` / `Cancel` inline;
  failure `Couldn't delete. Try again.`
- Detail due item: service name, `Overdue` badge, `From B12 on Nov 7, 2026`.
- Detail empty (no schedule items and no Minder items): `Nothing due. Log a code when the car shows one.`
- Detail item with Minder: `Minder B12 on Nov 7, 2026`.

## Testing

- `worker/minder.test.ts` - parsing, normalization, lookup resolution (step 1).
- `worker/index.test.ts` - invalid id and invalid body paths for the new routes
  (step 3).
- `src/route.test.ts` - the `minder` route (step 5).
- Grouping of due items into `DueItemView` lives in a pure helper in
  `worker/minder.ts` and is unit tested (step 4).
- Browser checks in steps 5-6 via the dev server; no browser test command exists.

## Notes for the AI

- Mirror the odometer feature: `parseId`, `findVehicle`, `notFound`,
  `OdometerForm` validation and error-announcement patterns, `ReadingRow` delete.
- Code and service names are plain text rendered by React; no HTML injection.
- Inserting the log and its due items must be one `db.batch`. A pattern that
  works: insert the log, then `INSERT INTO due_items ... SELECT` using
  `(SELECT max(id) FROM minder_logs)` for the log id, inside the same batch.
  Confirm with a local `curl` that items land on the right log.
- Do not add `closed_by_service_item_id` or any closing behavior.
- Interval-vehicle behavior stays unchanged apart from `minderSince: null`.
- Plan change (2026-11-07): the Odyssey uses the Corolla's intervals plus Minder
  codes; worse status wins. Steps 7-9 added after steps 1-6 were verified.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":13651,"specSha256":"6e1c9d81538bc0f3c8f953660ade98a1b4950d464d86080e297bf17d7108b0d7","branch":"refs/heads/feature/odyssey-minder-code-logging","head":"42da6f405ab2bb9c987ffaa8ccaaeb273302ccaf","baseRef":"refs/heads/main","baseCommit":"35d0bb1f36927a4b2db5f3f2da043ec6864b5439","sourceTree":"a79d4a16aae65ae16758e99ac273910b83c5da8d","landing":"local-merge","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 42da6f405ab2bb9c987ffaa8ccaaeb273302ccaf
**Base commit:** 35d0bb1f36927a4b2db5f3f2da043ec6864b5439
**Base ref:** main
**Spec hash:** 6e1c9d81538bc0f3c8f953660ade98a1b4950d464d86080e297bf17d7108b0d7
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-08T01:47:38Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-08T01:49:25Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run build`: pass (tsc -b plus client and Worker build)
- `npm run lint`: pass (no issues)
- `npm test`: pass (9 files, 143 tests)

### Evidence

- Preconditions: HEAD = target, `git merge-base main HEAD` = base, spec SHA-256 matches (spec tracked, no snapshot), only `blueprint/context/review.md` dirty before review.
- Reviewed full delta (22 files): `worker/minder.ts` (+ test), `worker/index.ts` (+ test), `worker/db/schema.ts`, `shared/api.ts`, migrations 0003/0004 and meta, `src/MinderPage.tsx`, `src/MinderForm.tsx`, `src/VehiclePage.tsx`, `src/HomePage.tsx`, `src/App.tsx`, `src/route.ts` (+ test), and blueprint plan/overview/spec docs.
- Migration 0003 is additive (two new tables, indexes); 0004 inserts Odyssey schedule rows by seeded vehicle names, matching `0001_seed.sql`.
- POST inserts the log and its due items in one `db.batch` (transactional); `resolveServices` guarantees at least one service id, so the due-items insert is never empty. DELETE removes due items then the log in one batch and 404s when nothing was deleted.
- No skipped, focused, or todo tests found in `src/`, `worker/`, or `shared/`.

### Findings

- F-01 [P3] open - plan docs describe a nonexistent tire-rotation exception
- F-02 [P3] open - merged attention counts computed inline without a unit test

### Remaining risk

- No browser test command is declared; UI steps 5, 6, and 9 were reviewed by reading code only, not run in a browser.
- D1-backed route behavior (batch insert landing on the right log, 404 for unknown vehicles/logs, delete cascade) has no automated test; reviewed by code reading only. The local D1 was not touched.
- Remote migration 0004 depends on the seeded vehicle names; not verified against the remote database.
- Check was not required and was not run.

## Try it now

1. `npm run dev` (or your running dev server), then open the Odyssey from the home page: it lists 7 **Schedule** items with **Set last done**.
2. Set tire rotation last done to a date: it gets a real status and next-due date.
3. Tap **Log Minder code**, enter `b 12`: the log shows **B12** with 6 services. `B6` shows "Sub-item 6 isn't in this car's Minder list." and saves nothing.
4. Back on the Odyssey: drive belt and multi-point inspection appear under **From Minder codes**; oil, tire rotation, and both air filters show **Overdue** with "Minder ... on ..."; the home card overdue count matches.
5. Delete the log (**Delete**, then **Confirm delete**): items return to their interval status and the count drops.
6. The Corolla card and detail page are unchanged.
