# Feature: Manual service entry

**From build-plan:** feature 5
**Build attempt:** 1
**Branch:** feature/manual-service-entry
**Status:** verified

## Goal

Record a completed service by hand for either vehicle: date, optional odometer,
shop and total, and one or more line items. Line items matched to a service
update that service's "last done" (so its interval status resets) and close the
Odyssey's open Minder due items for that service. Uncovered Minder items stay
overdue. Mistyped records can be deleted, which reverses those effects.

## In scope

- New tables `service_records` and `service_items`; nullable
  `due_items.closed_by_service_item_id` and `odometer_logs.service_record_id`.
- "Last done" per schedule item = newer of the baseline and confirmed service
  items for that vehicle and service (rule in Data / contracts).
- Open Minder due items exclude closed ones everywhere (vehicle status, home
  counts, Minder page).
- Creating a record with an odometer also writes an `odometer_logs` row
  (`source: 'record'`) so it feeds the mileage estimate.
- API: list, create, and delete service records per vehicle.
- UI: a Service history page per vehicle with an Add service form and the
  record list; links from the home card and vehicle page.
- Record-sourced odometer readings can't be deleted on the odometer page; the
  record owns them.
- Tech debt approved 2026-11-07 for this feature. Each item would otherwise
  get a fourth copy, or break once records close items. No behavior change:
  - Shared mile validation: `parseMiles` + `MAX_ODOMETER` in `worker/validate.ts`
    (now copied in `baseline.ts`, `odometer.ts`, `minder.ts`).
  - Split `worker/index.ts` (408 lines) into per-feature Hono route modules
    mounted with `app.route()`.
  - Client helpers: `ConfirmDelete` (from the near-identical `ReadingRow` /
    `LogRow` delete UI), `PageShell` (back link + loading/error/not-found),
    `submitJson` (POST/PUT + `ApiError.fields` mapping). `BaselineForm` uses
    `errorTextClass`.
  - `due_items.closedByServiceItemId` with the open/unfiltered query split
    (steps 4-5).

## Out of scope

- Editing a record (delete and re-enter instead).
- Receipts, `receiptId`, `minderCode` on records, the Minder mismatch flag
  (features 6-7). Those columns are added by the feature that uses them.
- `source` values other than `manual` being written (enum allows them).
- Bulk import (feature 8), reminders (feature 9).
- Cost reports or totals across records (non-goal).
- Creating services or schedule items from the UI.
- Deferred tech debt, not in this feature: D1-backed route tests with
  vitest-pool-workers (before feature 6), README rewrite, and feature 4 audit
  findings 04/F-01 (tire-rotation wording in the plan docs) and 04/F-02
  (`attention` counts have no unit test).

## Build loop

`workflow.stepReview` is `feature`: implement all steps, then review the whole
feature once. `workflow.checkpointCommits` is `disabled`: no per-step commits;
`/complete` makes the single feature commit. Run `npm test` and `npm run build`
after each step; both must be green before moving on.

## Build steps

- [x] **1. Shared mile validation.** New `worker/validate.ts` with
  `MAX_ODOMETER` (moved from `baseline.ts`) and
  `parseMiles(value: unknown): number | null | undefined`. It returns the
  integer for valid input, `null` for null/absent, and `undefined` for invalid.
  Each caller decides whether null is allowed. One message constant: `Enter
  whole miles from 0 to 999,999.` `baseline.ts`, `odometer.ts`, and `minder.ts`
  use it.
  *Done when:* existing baseline/odometer/minder tests pass unchanged (same
  field messages); `worker/validate.test.ts` covers 0, max, max+1, negative,
  non-integer, string, null, undefined; build passes.

- [x] **2. Split worker routes.** Move routes out of `worker/index.ts` into
  `worker/routes/vehicles.ts` (vehicles, schedule-item baseline),
  `worker/routes/odometer.ts`, and `worker/routes/minder.ts`, each a
  `new Hono<{ Bindings: Env }>()` mounted in `index.ts` with `app.route('/',
  ...)` under the existing `/api` base path. Shared helpers (`parseId`,
  `notFound`, `Db`, `findVehicle`, `statusByVehicle`, `mileageByVehicle`,
  `dueItemsByVehicle`) go in `worker/http.ts` and `worker/status.ts`.
  `index.ts` keeps `/health`, `notFound`, and `onError`. Pure move, no URL or
  response change.
  *Done when:* `worker/index.test.ts` passes unchanged (still importing
  `./index`); build passes; `npm run dev` home, vehicle, odometer, and Minder
  pages load and save as before.

- [x] **3. Client helpers.** In `src/api.ts` add
  `submitJson<T>(url, method, body)` that sends JSON and returns `{ ok: true,
  data } | { ok: false, fields } | { ok: false, error }` (400 with fields vs any
  other failure, error logged). New `src/ConfirmDelete.tsx` (Delete -> Confirm
  delete / Cancel, deleting state, error text, `label` prop for aria-labels)
  replaces the delete UI in `OdometerPage` `ReadingRow` and `MinderPage`
  `LogRow`. New `src/PageShell.tsx` (back link + loading / error-with-retry /
  not-found states around a `useApi` result, render prop for ready data) is
  used by `VehiclePage`, `OdometerPage`, and `MinderPage`. `OdometerForm`,
  `MinderForm`, and `BaselineForm` use `submitJson`. `BaselineForm` uses
  `errorTextClass` for its three inline red-text classes.
  *Done when:* the pages look and behave the same in the dev server (labels,
  focus, messages, delete confirm), lint and build pass. These are UI
  components, so there are no unit tests (coding standards). Add a `src/api.test.ts` case for
  `submitJson` result mapping with a stubbed `fetch`.

- [x] **4. Schema and migration.** Add `serviceRecords` and `serviceItems` to
  `worker/db/schema.ts`, plus `dueItems.closedByServiceItemId` and
  `odometerLogs.serviceRecordId` (both nullable FKs). Run `npm run db:generate`
  and read the generated SQL: existing `due_items` and `odometer_logs` rows must
  survive (plain `ALTER TABLE ... ADD COLUMN`, or a table rebuild that copies
  every column). Apply with `npm run db:migrate:local`.
  *Done when:* migration applies to local D1 with existing logs and due items
  intact, and `npm test` + `npm run build` pass.

- [x] **5. Closed items drop out of open lists.** `selectOpenItems` (moved
  in step 2) filters `closedByServiceItemId IS NULL`. `minderView`'s
  per-log `services` keeps listing every service the code opened (query
  `due_items` for the log without the closed filter) so history doesn't shrink
  after service.
  *Done when:* vehicle page, home counts, and Minder page behave exactly as
  before with no closed rows; build and tests pass.

- [x] **6. Last done from service records.** Add pure
  `resolveLastDone(baseline, records)` in `shared/schedule.ts`; `computeDue`
  takes the resolved last-done date/odometer. `statusByVehicle` (`worker/status.ts`) loads, per
  vehicle and service, the max record date and max record odometer from
  `service_items` joined to `service_records` (`service_id` not null) in one
  query. `ScheduleItemView` gains `lastDoneDate` and `lastDoneOdometer`; the
  vehicle page's "last done" text and the `StatusBadge` "has baseline" input use
  them (baseline form still edits the baseline only). Unit tests for
  `resolveLastDone`.
  *Done when:* with no records, every item's status and dates match today's
  output; tests cover baseline only, records only, record newer, baseline newer,
  and mixed dimensions; build passes.

- [x] **7. Input parsing and close selection.** New `worker/serviceRecord.ts`:
  `parseServiceRecordInput(body, today)` (contract below) and
  `selectDueItemsToClose(openRows, serviceIds, recordDate)` returning due item
  ids. Shared `parseDollarsToCents(text)` in `shared/money.ts` for the client
  form. Unit tests for all three, including malformed, missing, boundary, and
  future-date cases.
  *Done when:* `npm test` covers each validation message and close rule.

- [x] **8. API routes.** New `worker/routes/serviceRecords.ts`, mounted like the others:
  `GET /api/vehicles/:id/service-records`, `POST /api/vehicles/:id/service-records`,
  `DELETE /api/service-records/:id`; `DELETE /api/odometer-logs/:id` (in `worker/routes/odometer.ts`) returns 409
  for a `record` reading. Writes are one `db.batch` each (see Data /
  contracts). Route tests via `app.request` for invalid ids (404), invalid body
  (400 with fields), as in `worker/index.test.ts`.
  *Done when:* route tests pass; against local D1 (`npm run dev`) a POST with a
  Tire rotation line closes an open Odyssey Tire rotation due item and resets the
  item's status, and DELETE reopens it.

- [x] **9. Service history page.** Route `/vehicles/:id/services` in
  `src/route.ts` (+ test) and `src/App.tsx`; `src/ServicesPage.tsx` (loading,
  error with retry, not found, empty "No services recorded yet.", list) and
  `src/ServiceForm.tsx`. Links: "Add service" on the home card and vehicle page,
  with vehicle-specific `aria-label` on the home card like existing actions.
  Odometer page hides Delete for `record` readings and labels them "From service
  record".
  *Done when:* in the dev server, adding a multi-line service updates the list,
  the vehicle page's last done and status, the Minder page's open items, and the
  odometer list; delete-with-confirm reverses it; screenshot at phone width in
  light and dark.

## Files / areas

- new `worker/validate.ts`, `worker/validate.test.ts`; `worker/baseline.ts`, `worker/odometer.ts`, `worker/minder.ts`
- new `worker/http.ts`, `worker/status.ts`, `worker/routes/{vehicles,odometer,minder,serviceRecords}.ts`
- `src/api.ts`, new `src/api.test.ts`, new `src/ConfirmDelete.tsx`, new `src/PageShell.tsx`, `src/MinderPage.tsx`, `src/OdometerForm.tsx`, `src/MinderForm.tsx`, `src/BaselineForm.tsx`
- `worker/db/schema.ts`, new `migrations/0005_*.sql` (generated) + `migrations/meta`
- `worker/index.ts`, `worker/index.test.ts`
- new `worker/serviceRecord.ts`, `worker/serviceRecord.test.ts`
- `shared/schedule.ts`, `shared/schedule.test.ts`, `shared/api.ts`
- new `shared/money.ts`, `shared/money.test.ts`
- `src/route.ts`, `src/route.test.ts`, `src/App.tsx`, `src/HomePage.tsx`,
  `src/VehiclePage.tsx`, `src/OdometerPage.tsx`
- new `src/ServicesPage.tsx`, `src/ServiceForm.tsx`

## Data / contracts

**Tables** (Drizzle, integer autoincrement pks):

- `service_records`: `id`, `vehicle_id` (fk, not null), `date` (text
  `YYYY-MM-DD`, not null), `odometer` (int, null), `shop` (text, null),
  `total_cents` (int, null), `source` (enum `manual|receipt|import`, not null,
  default `manual`). Index `(vehicle_id, date)`.
- `service_items`: `id`, `service_record_id` (fk, not null), `description`
  (text, not null), `service_id` (fk services, null), `amount_cents` (int, null).
  Index `(service_record_id)`.
- `due_items.closed_by_service_item_id` (fk service_items, null). Null = open.
- `odometer_logs.service_record_id` (fk service_records, null); set only when
  `source = 'record'`.

**Last done rule** (`resolveLastDone`): computed per dimension independently.
`lastDoneDate` = latest of `baselineDate` and record dates for that vehicle and
service; `lastDoneOdometer` = highest of `baselineOdometer` and non-null record
odometers. A record without an odometer advances only the date. Order of entry
doesn't matter.

**Closing Minder items** (`selectDueItemsToClose`): for the record's vehicle,
close every open due item whose service is among the record's matched
`serviceId`s **and** whose log's Eastern date (`todayInEastern(new Date(loggedAt))`)
is on or before the record date. A backdated record never closes a code logged
after the service. Each closed item points at the first (lowest id) line item in
the record with that service. Unmatched lines (`serviceId: null`) close nothing.

**Request body** `POST /api/vehicles/:id/service-records` (`ServiceRecordInput`
in `shared/api.ts`):

```ts
{
  date: string            // YYYY-MM-DD, valid, not after today (Eastern)
  odometer: number | null // integer 0..MAX_ODOMETER (999,999)
  shop: string | null     // trimmed; empty -> null; max 100 chars
  totalCents: number | null // integer 0..9_999_999
  items: Array<{
    description: string   // trimmed, 1..200 chars
    serviceId: number | null // must exist in services
    amountCents: number | null // integer 0..9_999_999
  }>                      // 1..30 items
}
```

`parseServiceRecordInput` returns `{ ok, value }` or `{ ok: false, fields }`.
Field keys: `body`, `date`, `odometer`, `shop`, `totalCents`, `items` (list
level: missing, empty, or > 30), `items.<index>.description`,
`items.<index>.serviceId`, `items.<index>.amountCents`. Unknown `serviceId`
(checked in the route against `services`) -> `items.<index>.serviceId: "Pick a
service from the list."`. Odometer conflict with the vehicle's readings (reuse
`findConflict`) -> `odometer` field. 400 message: `Invalid service record`.

**Responses:** GET and POST (201) return `ServiceRecordsResponse`:

```ts
{
  vehicle: { id: number; name: string }
  today: string
  services: { id: number; name: string }[]   // all services, by name
  records: ServiceRecordView[]               // date desc, id desc
}
ServiceRecordView = {
  id, date, odometer, shop, totalCents, source,
  items: { id, description, serviceId, serviceName: string | null, amountCents }[] // by id
}
```

DELETE `/api/service-records/:id` -> 204; unknown/invalid id -> 404 `Service
record not found`. Unknown vehicle -> 404 `Vehicle not found`. DELETE of a
`record` odometer reading -> 409 `{ error: { message: "This reading comes from a
service record. Delete the record instead." } }`.

**Atomic writes** (one `db.batch` = one transaction, existing pattern):

- Create: insert record; insert items with `service_record_id = (SELECT
  max(id) FROM service_records)`; if odometer, insert `odometer_logs` (`source:
  'record'`, same subquery); if due items to close, `UPDATE due_items SET
  closed_by_service_item_id = (SELECT min(id) FROM service_items WHERE
  service_record_id = (SELECT max(id) FROM service_records) AND service_id =
  due_items.service_id) WHERE id IN (...) AND closed_by_service_item_id IS NULL`.
  Due item ids are selected before the batch from open rows; the `IS NULL`
  guard keeps a concurrent close from being overwritten.
- Delete: null `closed_by_service_item_id` for this record's items, then hand
  each released Minder item to another record that still covers it
  (`reassignClosures`: same vehicle and service, dated on or after the code's
  Eastern date, lowest-id matching line); delete its `odometer_logs`, delete
  items, delete record (FK-safe order). Items no other record covers reopen as
  overdue. (Audit F-03.)
- History GET loads line items by joining on the vehicle, never an id list, so
  it stays under D1's bound-parameter cap. (Audit F-04.)

**Money in the UI:** amounts entered as dollars (`12`, `12.5`, `12.34`,
optional `$` and commas); `parseDollarsToCents` returns integer cents or null
for invalid (more than two decimals, negative, non-numeric). Displayed with
`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.

## Testing

`npm test` (Vitest) gates steps 1, 3, and 6-9 logic:

- `worker/validate.test.ts`: `parseMiles` boundaries; existing baseline, odometer, and minder tests unchanged.
- `src/api.test.ts`: `submitJson` maps 2xx, 400 with fields, other 4xx/5xx, and network failure.
- `shared/schedule.test.ts`: `resolveLastDone` cases; `computeDue` unchanged
  results from baseline-only input.
- `worker/serviceRecord.test.ts`: every field rule and boundary (0, max, max+1,
  non-integer, wrong type, blank shop, 0/31 items, 201-char description, future
  and impossible dates); `selectDueItemsToClose` by service match, date cutoff
  (same day included, next day excluded), and null `serviceId`.
- `shared/money.test.ts`: valid and invalid dollar strings.
- `worker/index.test.ts`: 404 for bad ids on all three routes, 400 shape for an
  invalid body.
- `src/route.test.ts`: `/vehicles/2/services` and trailing slash.

No browser test command exists; UI and the D1-backed flow are verified by hand
in the dev server with screenshots (steps 2, 3, and 9). Don't claim live D1 behavior from
unit tests.

## Notes for the AI

- Build `ServicesPage` on `PageShell`, record delete on `ConfirmDelete`, and the form submit on `submitJson`. Service-record odometer uses `parseMiles`.
- Follow `MinderForm` / `OdometerForm` patterns: `useId` labels, `noValidate`,
  client checks for fast feedback, server `fields` mapped to inputs,
  `aria-invalid` + `aria-describedby` error text with `role="alert"`, errors
  cleared on change, "Saving..." disabled submit, generic "Couldn't save. Try
  again." on other failures.
- Form defaults: date = today from the response, one empty line. Each line: a
  service `<select>` (first option "Other (not tracked)" = null), description,
  amount. Picking a service fills an empty description with its name; submit
  blocks a line with neither. "Add line" focuses the new line's select;
  "Remove" (hidden when one line) moves focus to the previous line's select.
  Each line's controls get labels that include the line number for screen
  readers.
- After a successful save: reset the form, refresh the list, and show a polite
  `role="status"` "Service saved." that clears on the next edit.
- Render all user text (shop, description) as React text; never
  `dangerouslySetInnerHTML`.
- Status still uses color plus text (`StatusBadge`). Mobile-first; the line
  editor stacks on phone width.
- Any vehicle (interval or minder) can have records; closing logic simply finds
  no due items on the Corolla.
- Put `MAX_CENTS` and
  `MAX_LINE_ITEMS` in `worker/serviceRecord.ts`.
- If Drizzle generates a table rebuild for the new FK columns, confirm the copy
  statement includes every existing column before applying.
- Remote migration must run before deploying this code (`npm run
  db:migrate:remote`); `/complete` does not deploy.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":18002,"specSha256":"47dca809e95839e09aabf291550402c255306d27d07c37de789c5f627dcd5d64","branch":"refs/heads/feature/manual-service-entry","head":"9b0b94a4ab476e3975d56a3d260842c5ae97ed6b","baseRef":"refs/heads/main","baseCommit":"d63042238d6ddf483a4423d06e47cb992c127f57","sourceTree":"74f3aaad639fc3ef283f582d2efa4d92b444118f","landing":"local-merge","absentOptional":[]} -->

## Findings

### 05/F-03 [P2] closed - Deleting a record reopens Minder items that another record still covers

**File:** worker/routes/serviceRecords.ts:189
**Found:** 2026-11-08 by /audit independent (scope: current; lens: quality)
**Why it matters:** Create only closes items that are still open
(`closed_by_service_item_id IS NULL`), and delete nulls every item this record
closed without re-running the close rule. If the user enters a corrected record
first and then deletes the mistyped one (both covering, say, Tire rotation and
dated on or after the code), the due item reopens and shows overdue even though
the remaining record satisfies `selectDueItemsToClose`. This follows the spec's
literal delete contract, but breaks the Goal's invariant that a covered Minder
item is closed. Recoverable by deleting and re-entering the surviving record.
**Suggested fix:** In the delete batch, after nulling, re-point each reopened
item at the lowest-id matching line of another record for the same vehicle and
service whose date is on or after the log's Eastern date, or document the
re-enter workaround in the spec as accepted behavior (user decision). No current
requirement is lost.
**Resolution:** Fixed 2026-11-08 by /autopilot repair. Delete now reads the Minder items the record closed and, in the same batch after releasing them, re-points each at the lowest-id matching line of another record for the same vehicle and service dated on or after the code's Eastern date (pure `reassignClosures` in `worker/serviceRecord.ts`, 4 unit tests). Verified on local D1: corrected record then delete of the mistyped one keeps Tire rotation closed; deleting the last covering record reopens it. Closed 2026-11-08 by /audit independent (scope: current; all lenses; reviewer claude-opus-5-5, fresh subagent): re-examined `worker/routes/serviceRecords.ts:179-242` and `worker/serviceRecord.ts:142-153`. The delete batch nulls this record's closures, then re-points only the items this record had closed (read before the batch) behind an `IS NULL` guard, before deleting odometer logs, items, and the record in FK-safe order. Coverage uses the same Eastern-date rule as create, excludes the deleted record and unmatched lines, and picks the lowest-id line. Original defect gone; no new defect found. `reassignClosures` has 4 passing unit tests.

### 05/F-04 [P2] closed - Service history GET binds one parameter per record and fails past D1's limit

**File:** worker/routes/serviceRecords.ts:55
**Found:** 2026-11-08 by /audit independent (scope: current; lens: performance)
**Why it matters:** `serviceRecordsView` loads items with
`inArray(serviceItems.serviceRecordId, records.map((r) => r.id))`, one bound
parameter per record. D1 caps a query at 100 bound parameters, so once a vehicle
has more than about 100 records the history page returns a 500 and the user can
no longer view or delete records there. Not reachable with today's data, but
years of history or feature 8's bulk import will get there.
**Suggested fix:** Select items with `innerJoin(serviceRecords, ...)` and
`where(eq(serviceRecords.vehicleId, vehicle.id))` instead of the id list. No
current requirement is lost.
**Resolution:** Fixed 2026-11-08 by /autopilot repair. Items now load with `innerJoin(serviceRecords)` filtered by `serviceRecords.vehicleId`, so the query binds one parameter regardless of record count. Verified on local D1: history GET returns 200 with 106 records. Closed 2026-11-08 by /audit independent (scope: current; all lenses; reviewer claude-opus-5-5, fresh subagent): `worker/routes/serviceRecords.ts:47-63` now joins `service_records` and filters on `vehicle_id`, binding one parameter regardless of record count. Original defect gone; no new defect found. The largest create insert (30 lines) binds 90 parameters (checked with Drizzle `toSQL()`), under D1's 100 cap.

## Independent review

**Status:** passed
**Target commit:** 9b0b94a4ab476e3975d56a3d260842c5ae97ed6b
**Base commit:** d63042238d6ddf483a4423d06e47cb992c127f57
**Base ref:** main
**Spec hash:** 47dca809e95839e09aabf291550402c255306d27d07c37de789c5f627dcd5d64
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-08T02:33:21Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-08T02:37:50Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `d63042238d6ddf483a4423d06e47cb992c127f57..9b0b94a4ab476e3975d56a3d260842c5ae97ed6b` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `npm test`: pass (13 files, 246 tests)
- `npm run lint`: pass
- `npm run build`: pass (`tsc -b` typecheck, client and Worker bundles)
- Drizzle `toSQL()` on the 30-line `service_items` insert and the create-closure `UPDATE` (scratch script, no DB): 90 bound parameters, SQL matches the spec's subquery contract
- `GET` on `localhost:5173` `/api/vehicles`, `/api/vehicles/{1,2}`, `/api/vehicles/{1,2}/service-records`: 200 (read-only; no writes)

## Evidence

- Preflight: `HEAD` = target on `feature/manual-service-entry`, `git merge-base main HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` dirty before review.
- Reviewed the full `base..target` diff (44 files): `worker/routes/{serviceRecords,vehicles,odometer,minder}.ts`, `worker/{status,http,validate,serviceRecord,baseline,odometer,minder,index}.ts`, `worker/db/schema.ts`, `migrations/0005_service_records.sql` (plain `CREATE TABLE` + `ALTER TABLE ADD`, no rebuild), `shared/{schedule,money,api}.ts`, `src/{ServiceForm,ServicesPage,PageShell,ConfirmDelete,api,OdometerPage,VehiclePage,HomePage,BaselineForm,route,App}.tsx/ts`, and the new tests.
- Security: every new route parses ids with strict `parseId`, validates the body in pure `parseServiceRecordInput`, checks `serviceId` existence and odometer conflicts server-side; Drizzle parameterizes all user values; user text renders as React text (no `dangerouslySetInnerHTML`). Access model unchanged (Cloudflare Access, single user).
- Data integrity: create and delete are single `db.batch` transactions; delete order is FK-safe; record-sourced odometer readings return 409 on direct delete.
- F-03 and F-04 re-examined against the repaired code and closed (see ledger).
- No focused, skipped, or placeholder tests found.

## Findings

- None new. F-03 [P2] closed, F-04 [P2] closed. F-01 [P3] and F-02 [P3] remain open (deferred, out of this pass's scope to change).

## Remaining risk

- D1-backed route behavior (create closures, delete hand-off, 409 on record readings) has no automated test; it relies on the builder's manual local-D1 evidence. D1 route tests are deferred to before feature 6 per the spec.
- Create's `inArray(dueItems.id, toClose)` binds one parameter per closable open item; it would exceed D1's 100-parameter cap only with roughly 100 open matching Minder items on one vehicle, which current usage does not reach.
- Browser/UI flow (form focus, line editor, phone-width layout) was not exercised by this review; no `Browser tests` command is declared.
- The dev-server GETs show the running app responds but do not prove which commit it serves.

## Try it now

Run or do:

With `npm run dev` running, open http://localhost:5173/vehicles/1/minder and log code `B1`. Then open http://localhost:5173/vehicles/1/services, add a service dated today with one line (Service: **Tire rotation**; Description fills in) and Odometer `11050`, and click **Save service**.

Expected:

"Service saved." appears and the record is listed under Service history. On the vehicle page (**View schedule**), Tire rotation shows **OK** with "Last done Nov 7, 2026 at 11,050 mi", while Multi-point inspection and Oil and filter change still show **Overdue** from B1. Deleting the record (**Delete**, then **Confirm delete**) returns Tire rotation to **Overdue**.

This proves:

A service record closes only the Minder items it covers and updates last done, and deleting it reverses both.
