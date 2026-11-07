# Feature: Vehicles and schedules foundation

**From build-plan:** feature 1
**Build attempt:** 1
**Branch:** feature/vehicles-and-schedules-foundation
**Status:** verified

## Goal

Stand up the Worker backend and its D1 schema, seed the reference data both
scheduling models depend on (vehicles, canonical services, Corolla intervals,
Odyssey Minder lookup), and replace the Vite template page with a home screen that
loads and shows both vehicle cards from the API. The app is ready to deploy to
`workers.dev` behind Cloudflare Access; the deploy itself is a user action.

## In scope

- Cloudflare Worker (Hono) serving `/api/*` and the built client as static assets,
  wired into Vite dev via `@cloudflare/vite-plugin`.
- Drizzle schema and SQL migrations for `vehicles`, `services`, `schedule_items`,
  `minder_codes` (the four tables the overview says feature 1 locks).
- Seed migration with the two vehicles, canonical services and keywords, Corolla
  intervals, and Odyssey Minder code mappings.
- `GET /api/vehicles`.
- Home screen at `/`: two vehicle cards, with loading, error, and empty states,
  mobile-first, light/dark via system setting.
- npm scripts for migrations, type generation, and deploy; deploy steps in
  `AGENTS.md`.

## Out of scope

- Baselines, status computation, mileage, Minder logging, service records,
  receipts, reminders (features 2-9), and their tables.
- Estimated mileage and soon/overdue counts on cards (they need features 2-4).
- Editing intervals in the UI.
- Running `wrangler deploy`, creating the remote D1 database, or configuring the
  Access policy. Autopilot must not deploy; these are user steps.
- In-app auth or Access JWT verification (plan: Access in front, no in-app login).
- Client-side routing library; there is one screen.

## Build loop

`workflow.stepReview: feature`, `workflow.checkpointCommits: disabled`. Run under
Autopilot: no per-step pauses, no checkpoint commits; one review at the end.
`/complete` creates the feature commit.

## Build steps

- [x] 1. **Worker skeleton.** Install `hono`, `wrangler`, `@cloudflare/vite-plugin`.
  Add `wrangler.jsonc` (name `car-tracker`, static assets with SPA fallback,
  `run_worker_first` for `/api/*`), `worker/index.ts` with a Hono app and
  `GET /api/health` returning `{ ok: true }`, `tsconfig.worker.json`, generated
  Worker types, and the Vite plugin.
  Done when: `npm run build` and `npm run lint` pass, and `GET /api/health` on the
  dev server returns `{"ok":true}` while `/` still serves the client.
- [x] 2. **Schema and migrations.** Install `drizzle-orm`, `drizzle-kit`. Add
  `worker/db/schema.ts` (four tables), `drizzle.config.ts`, the generated
  migration under `migrations/`, the D1 binding `DB` in `wrangler.jsonc`, and npm
  scripts `db:generate`, `db:migrate:local`, `db:migrate:remote`.
  Done when: `npm run db:migrate:local` applies cleanly and the local D1 lists the
  four tables; build and lint pass.
- [x] 3. **Seed data.** Custom Drizzle migration inserting vehicles, services,
  Corolla `schedule_items`, and Odyssey `minder_codes` (values below).
  Done when: local migration applies; queries return 2 vehicles, 12 services,
  the Corolla schedule rows, and the Minder rows listed below.
- [x] 4. **Vehicles API.** `GET /api/vehicles` reads D1 through Drizzle and returns
  the contract below; unexpected errors return the error shape with status 500.
  Done when: the endpoint returns both vehicles from local D1 on the dev server;
  build and lint pass.
- [x] 5. **Home screen.** Replace the template `App.tsx` with the home screen:
  fetch `/api/vehicles`, render loading, error (with retry), empty, and two
  cards. Remove the template assets and CSS it no longer uses.
  Done when: in a browser at the dev server, both cards render with name and
  schedule label, no console errors; the error state shows when the API fails;
  build and lint pass.
- [x] 6. **Deploy readiness.** Add `deploy` and `cf-typegen` scripts and a short
  deploy section in `AGENTS.md` (create D1, set `database_id`, migrate remote,
  deploy, enable Access on `workers.dev`). Update `.gitignore` if needed.
  Done when: `npm run build` produces the client and Worker bundles; the
  documented commands match `package.json`.

## Files / areas

- `package.json`, `package-lock.json`, `vite.config.ts`, `wrangler.jsonc`
- `tsconfig.json`, `tsconfig.worker.json`, `worker-configuration.d.ts`
- `worker/index.ts`, `worker/db/schema.ts`
- `shared/api.ts` (response types used by worker and client)
- `drizzle.config.ts`, `migrations/`
- `src/App.tsx`, `src/index.css`, `src/App.css` (removed), `src/assets/` (template
  assets removed), `index.html` (title)
- `AGENTS.md` (Commands and deploy section), `eslint.config.js` if new dirs need
  globals

## Data / contracts

All tables in D1 (SQLite). Integer autoincrement primary keys.

### vehicles
- `id` integer pk
- `name` text not null unique
- `schedule_model` text not null, `'interval' | 'minder'`

### services
- `id` integer pk
- `name` text not null unique
- `keywords` text not null, JSON array of lowercase strings

### schedule_items
- `id` integer pk
- `vehicle_id` integer not null -> vehicles.id
- `service_id` integer not null -> services.id
- `interval_miles` integer null, `interval_months` integer null; at least one is
  set (CHECK constraint)
- `baseline_date` text null (ISO `YYYY-MM-DD`), `baseline_odometer` integer null
- unique (`vehicle_id`, `service_id`)

### minder_codes
- `id` integer pk
- `code` text not null (`A`, `B`, or sub-item digit as text)
- `kind` text not null, `'main' | 'sub'`
- `service_id` integer not null -> services.id
- unique (`code`, `service_id`)

### Seed values (pending owner's-manual verification)

Services (name: keywords):

| Service | Keywords |
|---|---|
| Oil and filter change | oil, lube, lof, synthetic |
| Multi-point inspection | inspection, inspect, multi-point |
| Tire rotation | rotate, rotation |
| Engine air filter | engine air filter, air filter |
| Cabin air filter | cabin, pollen |
| Drive belt inspection | drive belt, serpentine |
| Transmission fluid | transmission, atf |
| Spark plugs | spark plug |
| Valve clearance inspection | valve |
| Timing belt and water pump inspection | timing belt, water pump |
| Engine coolant | coolant, antifreeze |
| Brake fluid | brake fluid |

Odyssey Minder (Honda standard meanings): `A` oil; `B` oil + inspection; `1` tire
rotation; `2` engine air filter + cabin air filter + drive belt inspection; `3`
transmission fluid; `4` spark plugs + valve clearance + timing belt; `5` engine
coolant; `7` brake fluid. (`6` is rear differential, AWD only; not seeded.) Honda
`A` is oil only; seeding it to the combined oil-and-filter service is a deliberate
simplification so one receipt line closes one item.

Corolla intervals (miles / months): oil and filter 10,000 / 12; tire rotation
5,000 / 6; cabin air filter 30,000 / 36; engine air filter 30,000 / 36; brake
fluid 30,000 / 36; engine coolant 100,000 / 120; spark plugs 120,000 / none.
Baselines null (feature 2 adds them).

### API

`GET /api/vehicles` -> `200`

```json
{ "vehicles": [{ "id": 1, "name": "2024 Honda Odyssey", "scheduleModel": "minder" }] }
```

Ordered by `id`. Unexpected errors -> `500` with
`{ "error": { "message": "Something went wrong" } }`; details logged server-side,
never returned. Unknown `/api/*` paths -> `404` with the same error shape.

`GET /api/health` -> `200 { "ok": true }`.

## Testing

No test command is declared in `AGENTS.md`, so tests are not a gate
(`verification.logicTests: when-configured`). Evidence: `npm run build`,
`npm run lint`, local migration output and D1 queries, `curl` against the dev
server, and browser inspection of the home screen. Feature 1 has no computed logic
worth unit testing; feature 2's due-date math should prompt `/tests` first.

## Notes for the AI

- Route paths: client `/` (home); later features add `/vehicles/:id` style paths.
  API under `/api/*`. Nothing may depend on the hostname.
- Render vehicle names as text (React escapes); no HTML injection paths.
- Status and labels use text, not color alone. Schedule label: `Maintenance
  Minder` for `minder`, `Interval schedule` for `interval`.
- `database_id` in `wrangler.jsonc` is a placeholder until the user creates the
  remote D1; local dev does not need a real ID.
- Deploying, creating remote resources, and Access setup are hard stops for
  Autopilot; document them, don't run them.
- Seed values must be confirmed against the owner's manuals before relying on
  them; they live in one seed migration file so corrections are a new migration.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":8623,"specSha256":"d535f026f39a38bb5f8fa7d0a4a1f140c4199efea50251e7829d747bcb60dac7","branch":"refs/heads/feature/vehicles-and-schedules-foundation","head":"8cdd2ae0a98720928891beea105bdfd87b3458f1","baseRef":"refs/heads/main","baseCommit":"5b4aa581e3adde7499bc6f73b41ed255d40b6ab0","sourceTree":"2f12216e56bc129ed5c44910e4ee236afc9d37d4","landing":"local-merge","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 8cdd2ae0a98720928891beea105bdfd87b3458f1
**Base commit:** 5b4aa581e3adde7499bc6f73b41ed255d40b6ab0
**Base ref:** main
**Spec hash:** d535f026f39a38bb5f8fa7d0a4a1f140c4199efea50251e7829d747bcb60dac7
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-07T19:43:09Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-07T19:44:23Z
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

- `git rev-parse HEAD`, `git merge-base main HEAD`, `shasum -a 256 blueprint/context/current-feature.md`, `git status --porcelain`: pass (HEAD, merge base, and spec hash match the request; only `blueprint/context/review.md` differed)
- `git diff 5b4aa58..8cdd2ae` (full delta, 29 files): pass
- `npm run build`: pass (tsc -b plus Worker bundle `dist/car_tracker/` and client bundle `dist/client/`)
- `npm run lint`: pass (no issues)
- `npx wrangler d1 execute DB --local` (SELECT counts, table list, schedule_items and minder_codes contents): pass (12 services, 7 Corolla schedule rows, 13 Minder rows, four app tables present)

### Evidence

- Worker `worker/index.ts`: `GET /api/health`, `GET /api/vehicles` ordered by `id`, `notFound` 404 and `onError` 500 return the spec error shape; error details are only logged server-side.
- `wrangler.jsonc`: SPA fallback with `run_worker_first: ["/api/*"]`; placeholder `database_id` documented; `preview_urls` defaults to false in the installed wrangler schema, so Access on `workers.dev` covers the only public hostname.
- Schema and `migrations/0000_init.sql` match the spec contract (unique constraints, interval CHECK, FKs); `migrations/0001_seed.sql` values match the spec tables and local D1 rows.
- `src/App.tsx`: loading, error with retry, empty, and card states; abort on unmount; names rendered as text; schedule label as text. Template assets and CSS removed.
- Performance: one small ordered SELECT per page load, no repeated or unbounded work found.
- Tests: no test command declared in `AGENTS.md`; spec states feature 1 has no computed logic, so no tests are expected. No skipped or focused tests exist.

### Findings

- F-01 [P3] open - Coding standards still describe the backend as absent

### Remaining risk

- Dev server and browser not exercised by this reviewer (no long-running servers permitted); `/api/*` runtime responses, 404/500 shapes, and home-screen rendering were verified by code reading only.
- No test command is configured; no automated tests cover the Worker or client.
- `npm audit` or other dependency vulnerability scans not run (network-backed); no current vulnerability claim is made.
- Seed values remain pending owner's-manual verification, as the spec states.
- Cloudflare Access is a manual deploy step; until it is configured, a deployed Worker would expose `/api/vehicles` publicly.

## Try it now

1. `npm run db:migrate:local` (once, to create and seed the local database)
2. `npm run dev`, then open http://localhost:5173
3. Expect two cards: "2024 Honda Odyssey" labeled "Maintenance Minder" and "2019 Toyota Corolla" labeled "Interval schedule".
4. Optional: open http://localhost:5173/api/vehicles to see the JSON both cards come from.
