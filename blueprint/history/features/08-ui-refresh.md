# Feature: UI refresh

**From build-plan:** feature 8
**Build attempt:** 1
**Branch:** feature/ui-refresh
**Status:** verified

## Goal

Restyle the whole app to the muted slate design in `prototypes/`, on shadcn/ui
components. Inputs move into a right-side drawer (bottom sheet on phone), the
vehicle page becomes a 2-column grid of service cards (most urgent first), home
cards gain photos, ODO, chips, and the next due item, and each vehicle gets a
full service history page.

## Design reference

`prototypes/` (open `home.html`, `vehicle.html`, `history.html`, and `phone.html`):

- `theme.css` - all color, radius, and shadow tokens, light default plus
  `[data-theme="dark"]`. Port these exactly into `src/index.css`.
- `ui.css` - chips, pill buttons, cards, progress bar, inputs.
- `vehicle.html` - header, service card anatomy, drawers (add service, last done,
  log odometer with recent readings).
- `history.html` - summary stats, filters, year groups, row layout and phone
  stacking, expanded line items, receipt viewer.

The prototype is a reference, not code to copy: rebuild with Tailwind utilities
and shadcn components.

## In scope

- **shadcn/ui foundation**: `components.json`, the `@/` import alias (Vite and
  `tsconfig.app.json`), `src/lib/utils.ts` (`cn`), and these components copied in
  with the shadcn CLI under `src/components/ui/`: Button, Badge, Input, Label,
  Select, Checkbox, Sheet, Drawer, Dialog, Table, DropdownMenu. Runtime deps the
  CLI adds (Radix, vaul, class-variance-authority, clsx, tailwind-merge,
  tw-animate-css) plus `lucide-react`.
- **Theme**: slate tokens from `theme.css` in `src/index.css`, mapped to the
  shadcn token names; system font; tabular numbers; 14px card radius; pill
  buttons. Light by default whatever the OS says. Dark applies only via
  `data-theme="dark"` on `<html>` (Tailwind `dark:` variant bound to it).
- **Settings menu** in a top bar (brand, Receipts link, settings button) with a
  Light/Dark choice saved in `localStorage` per device and applied before first
  paint (inline script in `index.html`) so there is no flash. Storage failures
  fall back to light silently (storage is a convenience, not data).
- **Drawers**: one responsive drawer component: shadcn Sheet on the right at
  640px and wider, shadcn Drawer (bottom sheet) below 640px. Last done, add
  service, log odometer, and log Minder code open in it. Save closes it and
  refreshes the page data; Cancel, Escape, and the scrim close it without saving.
  Focus moves into the drawer and returns to the trigger.
- **Vehicle page**: header with photo, ODO (estimate plus source line), schedule
  label, link to service history, pill actions (Add service, Log odometer, and
  for Minder vehicles Log Minder code). Service cards in a 2-column grid (1 on
  phone), most urgent first. Each card: icon, name, interval, status chip (color
  plus text label), countdown, interval progress bar with start/end labels, last
  done / next due, and an edit (or Set) button that opens the last-done drawer.
  Minder due items without a schedule item sit in the same grid with a code chip;
  schedule items with an open Minder item show the code chip too.
- **Odometer and Minder pages fold into drawers**: the odometer drawer shows the
  estimate and recent readings with delete for manual readings; the Minder drawer
  shows recent codes with delete. `/vehicles/:id/odometer` and
  `/vehicles/:id/minder` route to the vehicle page; the old page components are
  removed.
- **Home**: vehicle cards with bundled photo, name, schedule label, ODO, overdue
  and soon chips, and the next due item (service, status, and countdown). Card
  links to the vehicle page. Prominent floating **Add receipt** button in thumb
  reach; Receipts link in the top bar. Summary line ("N items overdue, M due soon
  across 2 vehicles").
- **Vehicle photos**: images in `src/assets/vehicles/<slug>.{jpg,jpeg,png,webp}`
  (slug = lowercase kebab-case vehicle name) are bundled with
  `import.meta.glob`; a vehicle without a file shows the prototype's car-icon
  placeholder. No photo files are added by this feature (see Notes).
- **API, next due**: `Vehicle` gains `nextDue` (the most urgent tracked item, or
  null) so home needs no extra requests.
- **API, receipt link**: `ServiceRecordView` gains `receipt: { id, contentType }
  | null` from `service_records.receipt_id`.
- **Service history page** at `/vehicles/:id/services` (linked from the vehicle
  header): title and vehicle, summary stats (services, total spent, last service,
  receipts "N of M"), search (shop, line-item descriptions, service names),
  service-group filter chips (All, Oil, Tires, Filters, Fluids, Inspections,
  Other), a "Has receipt" toggle, records newest first grouped by year with a
  yearly count and total. Row: date, service tags plus line-item descriptions,
  shop and source, miles, cost, receipt thumbnail (or "No receipt"). A row
  expands to its line items with amounts and a total, plus Delete (two-step
  confirm, existing endpoint). Image receipts open in a Dialog viewer (bottom of
  screen on phone) with an "Open original" link; PDFs open in a new tab. Rows
  stack on phone. Add service opens the drawer. Empty states: no records yet;
  no records match (with Clear filters).
- **Restyle the rest**: receipts list, receipt upload, receipt review, not-found,
  loading and error panels, and the delete confirm, on the new tokens and shadcn
  components. Behavior unchanged.
- Remove `src/styles.ts` and all `zinc`/OS-`dark:` classes once nothing uses
  them. Update `coding-standards.md` (shadcn installed, `src/components/ui/`,
  `src/lib/`, theme rules) and the overview's design-reference note.

## Out of scope

- Editing a service record (the overview's history row lists Edit, but there is
  no update endpoint and the build-plan line does not include it). Delete only.
  Record as a follow-up.
- Bulk import (feature 9), reminders (feature 10).
- Any change to status math, intervals, or what closes an item.
- A "system" theme option (the plan says Light/Dark, light default).
- Browser test harness; new runtime behavior on the server beyond the two
  read-only response fields above.

## Build loop

`workflow.stepReview` is `feature`: continue through passing steps and present
one review at the end. `workflow.checkpointCommits` is `disabled`: no step
commits; `/complete` makes the feature commit. Run focused checks per step and
the full build, test, and lint once at the end.

## Build steps

- [x] 1. **shadcn foundation and theme tokens** - add the `@/` alias,
  `components.json`, `src/lib/utils.ts`, the listed shadcn components and deps,
  and `lucide-react`. Port `theme.css` tokens into `src/index.css` (`:root` light,
  `[data-theme="dark"]` dark) and map shadcn's token names to them. Bind Tailwind's
  `dark:` variant to `[data-theme="dark"]`. Body uses the system font and
  tabular numbers.
  **Done when:** `npm run build` and `npm run lint` pass; existing pages still
  render (unstyled pages may look plain); `src/components/ui/*` exist.
- [x] 2. **Theme preference and app shell** - `src/theme.ts` (read, apply, save
  `light|dark`, try/catch around storage) with tests; inline pre-paint script in
  `index.html`; `TopBar` (brand link home, Receipts link, settings DropdownMenu
  with a Light/Dark radio group). Restyle `PageShell` back link, `Feedback`
  loading and error panels, and the not-found page.
  **Done when:** theme tests pass; choosing Dark sets `data-theme="dark"` and
  survives reload; with storage blocked the app loads light.
- [x] 3. **Responsive drawer and form restyle** - `useMediaQuery` hook and
  `ResponsiveDrawer` (Sheet right / Drawer bottom at 640px). Restyle
  `BaselineForm`, `OdometerForm`, `MinderForm`, `ServiceForm`, and
  `ConfirmDelete` with shadcn parts, keeping every validation rule, field
  message, `aria-invalid`/`aria-describedby` link, and `role="alert"` as is. Forms
  get an `onCancel` where the drawer footer needs one.
  **Done when:** build and lint pass; existing form tests (if any) and all unit
  tests pass.
- [x] 4. **Schedule view logic** - pure `shared/scheduleView.ts`: `countdown(item,
  estimate, today)` (dimension with the larger used fraction of interval; miles
  left/over or days/months left/over; bar fraction clamped 0..1; start and end
  labels), `urgencyRank` sort (overdue, soon, ok, unknown; then used fraction
  descending; then name), and `pickNextDue(items, dueItems, estimate, today)`.
  `Vehicle.nextDue` added in `shared/api.ts` and filled in `statusByVehicle`.
  **Done when:** unit tests cover miles-only, months-only, both (larger fraction
  wins), overdue, no baseline, needs mileage, Minder due item, sort order, and
  next due with nothing tracked; `GET /api/vehicles` returns `nextDue`.
- [x] 5. **Vehicle page** - header, photo (with `src/vehiclePhoto.ts` glob
  lookup and placeholder), pill actions, service card grid with countdown and
  progress bar, Minder chips, last-done drawer, add-service drawer, odometer drawer
  (estimate, form, recent readings with delete), Minder drawer (form, recent codes
  with delete). Drawer lists load on open with loading and error-with-retry
  states. Route `/odometer` and `/minder` paths to the vehicle page; delete
  `OdometerPage.tsx` and `MinderPage.tsx`.
  **Done when:** route tests updated and passing; in the running app each drawer
  opens, saves, refreshes the grid, and closes; cards sort most urgent first;
  phone width shows 1 column and a bottom sheet.
- [x] 6. **Home** - vehicle cards (photo, chips, ODO, next due), summary line,
  floating Add receipt, empty and error states.
  **Done when:** home renders both vehicles with chips and next due in the
  running app, light and dark, desktop and phone width.
- [x] 7. **History API and logic** - add `receipt` to `ServiceRecordView` (left
  join on `receipts`); update `serviceRecords.d1.test.ts` to assert it for a
  receipt-confirmed record and null for a manual one. Pure `src/history.ts`:
  `serviceGroup(name)`, `filterRecords(records, { query, group, hasReceipt })`,
  `groupByYear(records)` (count and total per year, newest year first), and
  `historyStats(records)`.
  **Done when:** D1 and unit tests pass, including case-insensitive search across
  shop, descriptions, and service names; null amounts and null totals; empty input.
- [x] 8. **Service history page** - rebuild `ServicesPage` per the design:
  stats, search, group chips (`aria-pressed`), Has receipt checkbox, year groups,
  expandable rows (button with `aria-expanded`), line-item table, two-step Delete,
  receipt thumbnail (`<img>` of `/api/receipts/:id/file`, lazy) opening a Dialog
  viewer, PDF tile linking to the file in a new tab (`rel="noopener"`), Add service
  drawer, both empty states.
  **Done when:** in the running app filters, search, expand, delete, viewer, and
  PDF link work; rows stack at phone width.
- [x] 9. **Restyle receipts pages and clean up** - `ReceiptsPage`,
  `ReceiptUploadPage`, `ReceiptReviewPage` on the new components; delete
  `src/styles.ts`, `StatusBadge`/`MileageText` if unused; no `zinc-` or
  unconditioned `dark:` classes left; update `coding-standards.md` and the
  overview note.
  **Done when:** `grep -r "zinc-" src` is empty; full build, test, and lint pass;
  receipt upload and review still work in the running app.

- [x] 10. **Owner review changes (2026-11-13)** - vehicle page actions: Add
  receipt (links to `/receipts/new?vehicle=<id>`, which preselects that vehicle
  when the id is known) and Add service as primary buttons on the first line; Log
  odometer and Log Minder code as smaller secondary buttons on their own line.
  Receipts page as a line-item list: thumbnail, vehicle, kind and upload date, a
  status pill with an icon tinted in the status color naming the action needed
  (Needs reading, Needs review, Confirmed), and an actions column with room for
  View, Read receipt or Review, and Delete (pending only). Summary line of what
  needs attention. On phone the actions sit left-aligned under the text column
  with roomier rows. Pure `vehicleParam(search)` in `src/route.ts` with tests.
  Owner supplied vehicle photos (white-background cutouts) now bundled in
  `src/assets/vehicles/`; shown fitted (`object-contain`) and multiplied onto a
  light `--photo` panel so the white edge disappears in both themes. Favicon
  replaced with a white car on the slate brand tile.
  **Done when:** route tests pass; build, test, and lint pass; both pages render
  in light and dark at desktop and phone width with no horizontal scroll.

- [x] 11. **Independent review repairs** - F-09: the home next-due row shows
  the Minder status and "since <date>" when a Minder code drives the item, and
  shows a status chip beside the service name when it shows an interval
  countdown; `pickNextDue` test for a schedule item carrying `minderSince`. F-10:
  `applyTheme` and the pre-paint script set the `theme-color` meta to the active
  background (`#f8fafc` light, `#0e131a` dark), with a theme test. F-07:
  `src/photos.test.ts` covers `vehicleSlug` and the bundled photo lookup. F-11:
  `ResponsiveDrawer` picks bottom sheet or side sheet while closed and keeps it
  while open, so crossing 640px (rotating an iPhone) no longer drops typed input.
  **Done when:** focused tests pass; build, test, and lint pass; an open drawer
  keeps typed input across a 640px resize.

## Files / areas

- New: `components.json`, `src/lib/utils.ts`, `src/components/ui/*`,
  `src/theme.ts` (+ test), `src/TopBar.tsx`, `src/ResponsiveDrawer.tsx`,
  `src/useMediaQuery.ts`, `src/ServiceCard.tsx`, `src/VehicleHeader.tsx`,
  `src/VehiclePhoto.tsx`, `src/vehiclePhoto.ts`, `src/OdometerDrawer.tsx`,
  `src/MinderDrawer.tsx`, `src/serviceIcons.ts`, `src/history.ts` (+ test),
  `src/HistoryRow.tsx`, `src/ReceiptViewer.tsx`, `shared/scheduleView.ts` (+ test).
- Changed: `index.html`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.json`
  (alias if the CLI needs it), `package.json`/lock, `src/index.css`, `src/App.tsx`,
  `src/route.ts` (+ test), `src/PageShell.tsx`, `src/Feedback.tsx`, all form and
  page components, `shared/api.ts`, `worker/status.ts`,
  `worker/routes/serviceRecords.ts` (+ D1 test), `blueprint/context/coding-standards.md`,
  `blueprint/context/project-overview.md`.
- Removed: `src/OdometerPage.tsx`, `src/MinderPage.tsx`, `src/styles.ts`, and any
  component left unused.

## Data / contracts

- `Vehicle.nextDue: NextDueView | null` where `NextDueView = { serviceName: string;
  status: ItemStatus; minder: { code; date } | null; countdown: Countdown | null }`
  and `Countdown` is `{ kind: 'miles', remaining, used, from: number, to: number }`
  or `{ kind: 'days', remaining, used, from: string, to: string }` (`remaining` < 0
  is overdue; the dimension with the worse status wins, then the larger `used`). Null when the vehicle has no item with a known
  status. Picks the first item by `urgencyRank` across schedule items and leftover
  Minder due items. Purely additive; no persisted data changes.
- `ServiceRecordView.receipt: { id: number; contentType: ReceiptContentType } |
  null`. Additive.
- No migrations. No new endpoints. Existing DELETE endpoints are reused.
- Theme: `localStorage['theme']` is `'light' | 'dark'`; any other value or a
  storage error means light.
- Service groups (client display only): Oil = Oil and filter change; Tires = Tire
  rotation; Filters = Engine air filter, Cabin air filter; Fluids = Brake fluid,
  Engine coolant, Transmission fluid; Inspections = Multi-point inspection, Drive
  belt inspection, Valve clearance inspection, Timing belt and water pump
  inspection; Other = Spark plugs, unmatched line items, and any unknown name.
- User-entered text (shop, descriptions) renders as React text only.
- Receipt files are served by the existing `/api/receipts/:id/file` route (images
  with `nosniff` and `sandbox` CSP); the viewer uses `<img>`, never an iframe.

## Testing

`npm test` is configured, so logic steps ship tests in the same step:
`src/theme.test.ts`, `shared/scheduleView.test.ts`, `src/history.test.ts`,
`src/route.test.ts` updates, and `worker/routes/serviceRecords.d1.test.ts`
updates. UI components are verified with the build plus screenshots of the
running app (desktop and 390px phone width, light and dark), per
`coding-standards.md`. No browser test command is declared, so no browser tests.

## Notes for the AI

- Keep forms' validation and accessibility exactly as they are; only the
  presentation changes.
- Status keeps a text label next to color everywhere.
- Inputs stay 16px font on phone so iOS Safari does not zoom (owner uses iPhone
  Safari).
- Vehicle photos: the owner has not supplied files. Ship the glob lookup and the
  placeholder; dropping `src/assets/vehicles/2024-honda-odyssey.jpg` and
  `2019-toyota-corolla.jpg` in later needs no code change. Say so in the packet.
- shadcn CLI needs network; run it through the normal approval flow. If the
  generated files fail lint (react-refresh rule on files that export variants),
  adjust the ESLint config for `src/components/ui/` rather than hand-editing
  every component.
- Drawer save: forms call `onSaved`; the page closes the drawer and refreshes.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":17281,"specSha256":"924c2e9acaad0f2a7c66ecce15d0d9aaea264442bd2f337234848de1f573ac22","branch":"refs/heads/feature/ui-refresh","head":"79d987a923d79b383091e1cb3346ffe1b8473bf7","baseRef":"refs/heads/main","baseCommit":"b8c62d55338674179683ef2662e1a0279d0be02a","sourceTree":"265ee1b62eeb4b4e72d715dab067523c3324efc3","landing":"local-merge","absentOptional":[]} -->

## Findings

### 8/F-07 [P3] closed - Vehicle photo slug builder has no test

**File:** src/photos.ts:10
**Found:** 2026-11-13 by /audit independent (scope: current; lens: tests)
**Why it matters:** `vehicleSlug` turns a vehicle name into the filename the owner
must drop into `src/assets/vehicles/` (the spec promises that adding
`2024-honda-odyssey.jpg` later needs no code change). Slug builders are in the
coding standards' "what to test" scope, and a regression here fails silently: the
card just keeps showing the placeholder.
**Suggested fix:** Add `src/photos.test.ts` asserting `vehicleSlug('2024 Honda Odyssey')`
is `2024-honda-odyssey`, plus one case with punctuation and leading/trailing
spaces. No behavior change.
**Resolution:** Fixed 2026-11-13 (spec step 11). Added `src/photos.test.ts`: `vehicleSlug` for both vehicle names, punctuation, and edge spaces, plus `vehiclePhotoUrl` for a bundled and an unknown vehicle. Awaiting audit recheck.
Closed 2026-11-13 by /audit independent (79d987a): `src/photos.test.ts` covers both vehicle names, punctuation, edge spaces, and the bundled/unknown photo lookup; it passes in `npm test`. No new defect.

### 8/F-09 [P2] closed - Home next-due shows an interval countdown that contradicts a Minder-driven status, and no status text

**File:** src/HomePage.tsx:24
**Found:** 2026-11-13 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** On a Minder vehicle, a schedule item with an open Minder code
is forced to `overdue` by `mergeMinderStatus` (`worker/minder.ts:110`) and sorts
first, so `pickNextDue` returns it with `minder` set and its interval `countdown`
still filled in. `whenText` prefers `countdown`, so the Odyssey home card can read
"Next due · Minder A1 / Oil and filter change / 3,000 mi left" tinted red. The
vehicle page card for the same item shows "N days since code" instead
(`src/ServiceCard.tsx`), so the two pages disagree and the home line says miles
remain when the car is asking for service now. Separately, the spec asks for the
next due item's "service, status, and countdown", and the coding standards say
status always pairs color with a text label; when a countdown exists the home row
shows no status word, so `soon` and `ok` differ only by color. `pickNextDue` has
no test for a schedule item carrying `minderSince`.
**Suggested fix:** In `whenText`, check `next.minder` before `next.countdown`
(e.g. main = status label, sub = "since <date>"), matching the vehicle card, and
render the status text (a small `StatusChip` or the `statusLabel` word) beside
the countdown. Add a `pickNextDue` case in `shared/scheduleView.test.ts` for an
overdue item with `minderSince` and a non-overdue interval. No current
requirement is lost.
**Resolution:** Fixed 2026-11-13 (spec step 11). `whenText` in `src/HomePage.tsx` now checks `next.minder` before the countdown and shows the status label with "since <date>"; when a countdown shows, a `StatusChip` with the status text sits beside the service name. Added a `pickNextDue` test for an overdue item with `minderSince` and interval miles left. Awaiting audit recheck.
Closed 2026-11-13 by /audit independent (79d987a): `whenText` (`src/HomePage.tsx:24-32`) returns the status label and "since <date>" whenever `next.minder` is set, matching the vehicle card; a `StatusChip` with text renders beside the name only when a countdown shows, and the no-countdown path already shows the status word. `shared/scheduleView.test.ts:140` pins the Minder-driven case. No new defect.

### 8/F-10 [P3] closed - theme-color meta stays light when the dark theme is on

**File:** index.html:7
**Found:** 2026-11-13 by /audit independent (scope: current; lens: quality)
**Why it matters:** The new `<meta name="theme-color" content="#f8fafc">` is
static. Neither the pre-paint script nor `applyTheme` updates it, so with Dark
chosen, iPhone Safari (the owner's browser) tints its toolbar and status area the
light slate color above a dark page.
**Suggested fix:** In the inline script and in `applyTheme`, set the meta's
`content` to the active `--bg` (`#f8fafc` light, `#0e131a` dark). No current
requirement is lost.
**Resolution:** Fixed 2026-11-13 (spec step 11). `applyTheme` sets the `theme-color` meta from `THEME_COLORS` and the pre-paint script in `index.html` sets `#0e131a` for dark; theme test covers it. Awaiting audit recheck.
Closed 2026-11-13 by /audit independent (79d987a): `applyTheme` (`src/theme.ts:37-41`) sets the meta from `THEME_COLORS`, which match `--bg` in `src/index.css:11` and `:60`; the pre-paint script in `index.html` sets the dark color inside its existing try/catch, and the static meta covers light. `src/theme.test.ts` asserts both values. No new defect.

### 8/F-11 [P3] closed - Crossing 640px with a drawer open remounts the form and drops typed input

**File:** src/ResponsiveDrawer.tsx:42
**Found:** 2026-11-13 by /audit independent (scope: current; lens: quality)
**Why it matters:** `ResponsiveDrawer` returns a vaul `Drawer` tree under 640px
and a Radix `Sheet` tree at 640px and wider, chosen from a live
`useMediaQuery`. When the width crosses 640px while a drawer is open, the root
element type changes, so React unmounts the whole subtree and mounts the other
one: the form's local state (date, odometer, line items, shop) is reset and the
drawer list refetches. On the owner's iPhone, rotating from portrait (390px) to
landscape (about 844px) mid-entry does exactly this. No persisted data is lost,
only unsaved input.
**Suggested fix:** Read the breakpoint once when the drawer opens (for example
keep the `phone` value in state that only updates while `open` is false), so an
open drawer never switches implementations. No current requirement is lost.
**Resolution:** Fixed 2026-11-13 (spec step 11). `ResponsiveDrawer` keeps the variant in state and only follows the media query while closed. Headless Chrome: Add service opened at 390px, typed a shop, resized to 844px; still the bottom sheet with the text kept; reopened at 844px as the side sheet. Awaiting audit recheck.
Closed 2026-11-13 by /audit independent (79d987a): `src/ResponsiveDrawer.tsx:37-41` keeps the variant in state and syncs it to the media query only while `open` is false (a render-phase update React supports), so an open drawer never swaps its root element type. Callers (`VehicleDrawers`, `ServicesPage`) keep one `ResponsiveDrawer` instance per page, so the chosen variant is stable across opens. Code-level recheck only; the browser resize evidence is the builder's. No new defect.

## Independent review

**Status:** passed
**Target commit:** 79d987a923d79b383091e1cb3346ffe1b8473bf7
**Base commit:** b8c62d55338674179683ef2662e1a0279d0be02a
**Base ref:** main
**Spec hash:** 924c2e9acaad0f2a7c66ecce15d0d9aaea264442bd2f337234848de1f573ac22
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-13T20:01:22Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-13T20:03:58Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `b8c62d55338674179683ef2662e1a0279d0be02a..79d987a923d79b383091e1cb3346ffe1b8473bf7` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `npm run build`: pass (tsc -b typecheck, client and Worker bundles)
- `npm test`: pass (26 files, 411 tests)
- `npm run lint`: pass
- `npx tsc -p tsconfig.json --noEmit`: fail (TS5101 deprecated `baseUrl`, recorded as F-12; not part of the declared build)

### Evidence

- Freshness verified before review: HEAD equals target, `git merge-base main <target>` equals base, spec SHA-256 matches, only `blueprint/context/review.md` differed from the target.
- Reviewed the full base..target delta (86 files) against all 11 spec build steps, `coding-standards.md`, and `AGENTS.md`: shadcn foundation and alias, theme tokens and `[data-theme]` dark variant, theme persistence and pre-paint script, `ResponsiveDrawer`, form restyles (validation, `aria-*`, `role="alert"` preserved), `shared/scheduleView.ts`, `Vehicle.nextDue` in `worker/status.ts`, `ServiceRecordView.receipt` left join in `worker/routes/serviceRecords.ts`, vehicle page, home, history page and logic, receipts pages, owner review changes, and step 11 repairs.
- Security: no new endpoints; the receipt join is scoped by the existing vehicle filter and exposes only id and content type; user text renders as React text (no `innerHTML`); receipt files load through `<img>` or `rel="noopener"` links, never an iframe in new code; `vehicleParam` is strictly parsed and checked against loaded vehicles.
- Performance: `pickNextDue` adds an in-memory sort per vehicle over existing data; history filtering is client-side over one vehicle's records; receipt thumbnails are lazy. No new queries beyond one left join.
- Tests: new pure logic (`scheduleView`, `history`, `theme`, `photos`, `vehicleParam`) ships with tests; D1 tests assert `nextDue` and `receipt`. No skipped or focused tests found.
- Rechecked F-07, F-09, F-10, F-11 in the target code and closed them.

### Findings

- F-12 [P3] open (new)
- F-07, F-09, F-10, F-11 closed this pass
- F-01 through F-06 and F-08 unchanged (P3, open)

### Remaining risk

- UI behavior (drawers, focus return, 640px resize, phone layouts, light and dark) was reviewed from code only; no browser session was run by the reviewer and no Browser tests command is declared.
- No dependency vulnerability scan was run for the newly added runtime packages (Radix, vaul, lucide-react, and others).

## Try it now

1. Run `npm run dev` and open http://localhost:5173. The garage shows both vehicles with their photos, overdue and soon chips, ODO, and the next due item.
2. Open the settings icon in the top bar, choose Dark, and reload. The page and the browser toolbar stay dark. Choose Light to switch back.
3. Open a vehicle. Add receipt and Add service sit on the first line; Log odometer (and Log Minder code on the Odyssey) sit below. Add receipt opens the upload page with that vehicle already chosen.
4. Choose Add service. A side drawer opens on desktop; at phone width it is a bottom sheet. Save a service and the schedule grid refreshes, most urgent first.
5. Choose Log odometer, then delete a manual reading from the recent list.
6. Follow Service history. Search, pick a service group, toggle Has receipt, expand a row to see its line items, and open a receipt thumbnail.
7. Open Receipts in the top bar. Each line shows a status pill (Needs reading, Needs review, Confirmed) with View and the next action beside it.
