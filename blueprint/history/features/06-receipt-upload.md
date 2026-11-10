# Feature: Receipt upload

**From build-plan:** feature 6
**Build attempt:** 1
**Branch:** feature/receipt-upload
**Status:** verified

## Goal

From the phone at the shop counter, take a photo of a receipt (or pick an image
or PDF), choose the vehicle, and upload it. Images are shrunk in the browser to
about 1600px JPEG and stored in R2 with a `pending` receipts row. A Receipts page
lists uploads waiting for reading (feature 7), each with View and Delete.

This feature also pays down the deferred tech debt: D1-backed route tests for the
service-record create/delete batches, using a harness the receipt routes reuse.

## In scope

- Test harness: real local D1 + R2 bindings in Vitest through wrangler's
  `getPlatformProxy` (already installed), migrations applied to a fresh database.
- Route tests for service records, Minder closure, and record-owned odometer readings.
- `receipts` table and migration; R2 bucket binding `RECEIPTS`.
- API: upload, list, view file, delete pending receipt.
- Client: Add receipt page (vehicle required, take photo / choose file, resize,
  upload), Receipts list page, prominent Home action.
- First-deploy note for creating the R2 bucket.
- HEIC photos from the owner's iPhone (Safari): handled natively. Safari
  transcodes HEIC to JPEG for `accept="image/*"` or decodes it in
  `createImageBitmap`; the upload is always a JPEG. Confirmed with the owner on
  2026-11-09; no HEIC decoder library for Chrome or Android.

## Out of scope

- `extractReceipt()`, review screen, linking receipts to service records, the
  `service_records.receiptId` column (feature 7).
- Bulk upload, `importBatchId` population (feature 8). The column is created now
  per the data model but stays null.
- Offline queue or retry-in-background (non-goal).
- Resizing or rasterizing PDFs.
- README rewrite, ledger F-01/F-02 (still deferred).

## Build loop

`workflow.stepReview` is `feature`: build all steps, then review at the end.
`workflow.checkpointCommits` is `disabled`: no per-step commits; `/complete`
makes the single feature commit. After each step run `npm test` and `npm run lint`;
run `npm run build` after steps that touch types, config, or client code.

## Build steps

- [x] **1. D1/R2 test harness + service-record route tests.**
  Add `worker/test/platform.ts` exposing a helper that starts
  `getPlatformProxy({ configPath: 'wrangler.jsonc', persist: false })`, applies
  every `migrations/*.sql` file in name order to the proxied `DB` (splitting on
  `--> statement-breakpoint` and statement boundaries as needed), and returns
  `{ env, dispose }`. Each test gets a fresh database (new proxy per test or per
  `describe` with a reset; pick whichever keeps the suite under ~30s). Tests call
  `app.request(path, init, env)`. Name these files `*.d1.test.ts` so they are easy
  to find; they stay in the existing `npm test` run (plain Node Vitest).
  First confirm `getPlatformProxy` works under Vitest 5 in this repo. If it cannot
  provide working D1 bindings, stop and report rather than downgrading Vitest or
  adding `@cloudflare/vitest-pool-workers` (its latest, 0.23.0, needs Vitest ^4).
  Tests in `worker/routes/serviceRecords.d1.test.ts`:
  - Seeded data present: `GET /api/vehicles` returns both vehicles.
  - Create on the Odyssey with an open Minder code closes only the due items whose
    service appears on a line item; uncovered items stay open (overdue) and
    unmatched lines (`serviceId: null`) close nothing.
  - Create with an odometer writes a `source: 'record'` odometer log linked to the
    record; a conflicting odometer returns 400 with `fields.odometer` and writes
    nothing (record, items, log counts unchanged).
  - Unknown `serviceId` returns 400 `items.N.serviceId`, writes nothing.
  - `DELETE /api/odometer-logs/:id` on a record-owned reading returns 409 with the
    existing message.
  - Delete a record: its items and odometer log are removed; a Minder item it closed
    is handed to another record's matching line when one qualifies, otherwise
    reopened; deleting again returns 404.
  **Done when:** `npm test` runs and passes the new D1 tests alongside the existing
  suite, with no new dependency added.

- [x] **2. Receipts schema and R2 binding.**
  Add `receipts` to `worker/db/schema.ts` (see Data / contracts), run
  `npm run db:generate` to create `migrations/0006_*.sql`, add to `wrangler.jsonc`:
  `"r2_buckets": [{ "binding": "RECEIPTS", "bucket_name": "car-tracker-receipts" }]`,
  run `npm run cf-typegen`. Add to AGENTS.md "First deploy (manual)" a step before
  deploy: `npx wrangler r2 bucket create car-tracker-receipts`, and note that an
  existing deployment needs the bucket created and `npm run db:migrate:remote` run
  before `npm run deploy`.
  **Done when:** `npm run db:migrate:local` applies 0006; `Env` has
  `RECEIPTS: R2Bucket`; the harness from step 1 exposes `env.RECEIPTS`;
  `npm run build` and `npm test` pass.

- [x] **3. Upload validation (pure).**
  `worker/receipt.ts`: `sniffReceiptType(bytes: Uint8Array)` returns
  `'image/jpeg'` (starts `FF D8 FF`), `'application/pdf'` (starts `%PDF-`), or
  `null`; `parseReceiptUpload(form)` validates `vehicleId` (via `parseId`) and
  `file` (present, a `File`, 1 byte to `MAX_RECEIPT_BYTES` = 10 MiB, sniffed type
  not null). Field errors use keys `vehicleId` and `file`. The client-declared
  MIME type and filename are ignored; the sniffed type is what gets stored.
  Unit tests in `worker/receipt.test.ts` cover JPEG, PDF, PNG/HEIC/text rejected,
  empty, oversize, missing/invalid vehicleId.
  **Done when:** tests pass.

- [x] **4. Receipt API routes + D1/R2 tests.**
  `worker/routes/receipts.ts`, mounted in `worker/index.ts`. Contracts below.
  Upload order: validate, confirm vehicle exists (400 `fields.vehicleId` if not),
  `RECEIPTS.put` with `httpMetadata.contentType`, then insert the row; if the
  insert throws, best-effort `RECEIPTS.delete(key)` and rethrow (generic 500).
  Reject early with 413 when `Content-Length` exceeds 10 MiB + 64 KiB, before
  parsing the body. Delete order: delete the row (only when `status = 'pending'`),
  then `RECEIPTS.delete`; an orphaned object is harmless, a row without an object
  is not.
  Tests in `worker/routes/receipts.d1.test.ts`: upload JPEG and PDF succeed (201,
  object exists in R2 with that content type, row `pending`); PNG bytes labelled
  `image/jpeg` rejected 400 `file`; missing/unknown vehicle 400 `vehicleId`; list
  returns newest first with vehicle names; file route returns bytes plus the
  security headers; missing object 404; delete removes row and object; delete of a
  non-pending row returns 409 and keeps both; unknown/invalid ids 404.
  **Done when:** tests pass and `npm run build` passes.

- [x] **5. Client image preparation (pure + browser glue).**
  `src/receiptFile.ts`: `fitWithin(width, height, max = 1600)` returns scaled
  integer dimensions, never upscaling; `classifyFile(file)` returns `'image'`,
  `'pdf'`, or an error message (PDF over 10 MiB, unsupported type);
  `prepareReceipt(file)` returns a `Blob`: PDFs pass through unchanged, images go
  through `createImageBitmap(file, { imageOrientation: 'from-image' })` to a
  canvas at `fitWithin` size, then `canvas.toBlob(..., 'image/jpeg', 0.85)`.
  A decode failure surfaces "Couldn't read that image. Try another photo or file."
  Unit tests in `src/receiptFile.test.ts` for `fitWithin` and `classifyFile`
  (landscape, portrait, already small, square, exact 1600, PDF size limit,
  unsupported type). Canvas code is browser-only and is not unit tested.
  **Done when:** tests pass.

- [x] **6. Add receipt page, Receipts page, Home action.**
  Routes in `src/route.ts` (+ `route.test.ts` cases): `/receipts/new` ->
  `receiptNew`, `/receipts` -> `receipts`. Wire them in `src/App.tsx`.
  - **Add receipt** (`src/ReceiptUploadPage.tsx`): vehicle radio group loaded from
    `/api/vehicles` (required; no default selection); two actions, "Take photo"
    (`<input type="file" accept="image/*" capture="environment">`) and
    "Choose file" (`accept="image/*,application/pdf"`); shows the chosen file name
    and an image preview (object URL, revoked on change/unmount) or "PDF" label;
    Upload button. States: loading vehicles, vehicle-load error with retry,
    preparing ("Preparing photo..."), uploading ("Uploading..."), field errors
    (no vehicle: "Choose a vehicle."; no file: "Choose a photo or PDF."; server
    field errors mapped to the same fields), unexpected error with the file kept
    so Upload can be retried. Buttons disabled while busy. On success navigate to
    `/receipts`, which shows a polite "Receipt uploaded." status.
    Send `FormData` (`vehicleId`, `file` named `receipt.jpg` or `receipt.pdf`);
    do not set `Content-Type` manually. Reuse `apiRequest`/`ApiError` if it
    accepts a non-JSON body; otherwise add the smallest option to it rather than a
    parallel fetch wrapper.
  - **Receipts** (`src/ReceiptsPage.tsx`, using `PageShell`): list from
    `GET /api/receipts`; each row shows vehicle name (or "No vehicle"), upload
    date (Eastern, formatted like other pages), "Photo" or "PDF", the status text
    label "Waiting for reading" for `pending`, a "View" link to
    `/api/receipts/:id/file` (`target="_blank" rel="noopener"`), and
    `ConfirmDelete`. Empty state: "No receipts yet." with an Add receipt link.
    Loading and error states as on other pages.
  - **Home**: a prominent full-width "Add receipt" link to `/receipts/new`,
    placed after the vehicle cards and sticky to the bottom of the viewport on
    phone widths (thumb reach), plus a secondary "Receipts" link.
  User-controlled text (vehicle names, file names) renders as React text only.
  **Done when:** `npm run lint`, `npm test`, `npm run build` pass; in
  `npm run dev` at phone width: upload a photo (stored JPEG long edge <= 1600)
  and a PDF for a vehicle, both appear on Receipts, View opens each, Delete
  removes one, the validation errors appear for no vehicle / no file /
  unsupported file. Record UI evidence when a browser is available.

## Files / areas

- `worker/test/platform.ts` (new), `worker/routes/serviceRecords.d1.test.ts` (new)
- `worker/db/schema.ts`, `migrations/0006_*.sql` (+ `migrations/meta/`), `wrangler.jsonc`,
  `worker-configuration.d.ts` (regenerated)
- `worker/receipt.ts`, `worker/receipt.test.ts` (new)
- `worker/routes/receipts.ts`, `worker/routes/receipts.d1.test.ts` (new), `worker/index.ts`
- `shared/api.ts` (receipt types)
- `src/receiptFile.ts`, `src/receiptFile.test.ts` (new)
- `src/ReceiptUploadPage.tsx`, `src/ReceiptsPage.tsx` (new), `src/route.ts`,
  `src/route.test.ts`, `src/App.tsx`, `src/HomePage.tsx`, possibly `src/api.ts`
- `AGENTS.md` (first-deploy R2 step)

## Data / contracts

**`receipts` table** (migration 0006):

| column | type | notes |
|---|---|---|
| `id` | integer pk autoincrement | |
| `vehicle_id` | integer, nullable, FK vehicles | Required by this feature's upload form; nullable for feature 8 |
| `r2_key` | text not null unique | `receipts/<crypto.randomUUID()>.jpg` or `.pdf` |
| `content_type` | text not null | `image/jpeg` or `application/pdf` (sniffed) |
| `status` | text enum `pending`/`review`/`confirmed`, not null, default `pending` | |
| `extraction` | text, nullable | unused until feature 7 |
| `import_batch_id` | text, nullable | unused until feature 8 |
| `uploaded_at` | text not null | `new Date().toISOString()` |

Index on `uploaded_at` is not needed at this scale.

**Shared types** (`shared/api.ts`):

```ts
export type ReceiptStatus = 'pending' | 'review' | 'confirmed'
export interface ReceiptView {
  id: number
  vehicle: { id: number; name: string } | null
  contentType: 'image/jpeg' | 'application/pdf'
  status: ReceiptStatus
  uploadedAt: string
}
export interface ReceiptsResponse { receipts: ReceiptView[] }
```

**Routes** (all errors use the existing `ErrorResponse` shape):

- `POST /api/receipts` - `multipart/form-data` with `vehicleId`, `file`.
  201 `ReceiptView`. 400 `{ message: 'Invalid receipt', fields }` with
  `vehicleId` / `file` messages ("Choose a vehicle.", "Choose a photo or PDF.",
  "Use a JPEG photo or a PDF.", "File is larger than 10 MB."). 413
  `{ message: 'File is larger than 10 MB.' }` from the early Content-Length check.
  A non-multipart body returns 400.
- `GET /api/receipts` - 200 `ReceiptsResponse`, newest `uploaded_at` first, then id desc.
- `GET /api/receipts/:id/file` - 200 object body with `Content-Type` = stored
  type, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: sandbox`, `Cache-Control: private, max-age=3600`.
  404 "Receipt not found" for an invalid id, missing row, or missing object.
- `DELETE /api/receipts/:id` - 204. 404 "Receipt not found". 409
  "Only receipts waiting for reading can be deleted." when status is not `pending`.

**Limits:** 10 MiB per file, checked on the client (PDFs; resized JPEGs are far
smaller) and on the server (authoritative).

## Testing

- Unit (Node Vitest): `worker/receipt.test.ts`, `src/receiptFile.test.ts`,
  `src/route.test.ts` additions.
- D1/R2 integration (Node Vitest + `getPlatformProxy`, local Miniflare, no network):
  `worker/routes/serviceRecords.d1.test.ts`, `worker/routes/receipts.d1.test.ts`.
- Not automated: canvas resize, camera capture, and page UI. Verified by hand in
  `npm run dev` per step 6; no browser test harness is configured.
- No live Cloudflare (remote D1/R2) evidence is claimed; deploy is manual.

## Notes for the AI

- Uploaded bytes are untrusted: trust only the sniffed type, never the filename
  or declared MIME type; serve with `nosniff` and `sandbox` CSP so a crafted PDF or
  image cannot run script on the app origin.
- R2 and D1 are not transactional together. Keep the stated write orders
  (object then row on upload; row then object on delete).
- The Worker reads the whole upload into memory via `c.req.parseBody()`; at
  10 MiB that is fine. Do not add streaming machinery.
- Keep `vehicleId` nullable in the schema even though this form requires it.
- Reuse `parseId`, `findVehicle`, `notFound`, `PageShell`, `ConfirmDelete`,
  `useApi`, and the existing style constants. No new runtime dependencies.
- iPhone camera files: Safari normally hands the file input a JPEG; if it hands
  HEIC, `createImageBitmap` still decodes it in Safari and the output is JPEG.
  If decoding fails, show the stated error; do not add a HEIC library.
- Keep feature 7 out: no extraction, no review page, no "Read now" button.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":14548,"specSha256":"bc990d22f4807b0943bd18853a2dc8e0ff33d62c3a74ed9da690859d1ec76636","branch":"refs/heads/feature/receipt-upload","head":"5e072a70011fe706432c25d6cad3eb34f9a6245c","baseRef":"refs/heads/main","baseCommit":"f83bd276c4d444a216436c03e42b2f6412acea8a","sourceTree":"10d3e0bdfee50eb4389d49cfbfc7b25157746931","landing":"local-merge","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 5e072a70011fe706432c25d6cad3eb34f9a6245c
**Base commit:** f83bd276c4d444a216436c03e42b2f6412acea8a
**Base ref:** main
**Spec hash:** bc990d22f4807b0943bd18853a2dc8e0ff33d62c3a74ed9da690859d1ec76636
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-10T02:39:10Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-10T02:41:10Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `<base>..<target>` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `npm test`: pass (17 files, 299 tests, including both `*.d1.test.ts` suites)
- `npm run lint`: pass
- `npm run build`: pass (`tsc -b` across app, node, worker, and d1test projects, then client and Worker build)

## Evidence

- Preconditions: `HEAD` = target; `git merge-base main HEAD` = base; spec SHA-256 matches; only `blueprint/context/review.md` differed from target before writing.
- Reviewed all 27 files in `f83bd27..5e072a7` (excluding review.md and findings.md), plus callers `worker/http.ts` helpers, `src/api.ts`, `src/ConfirmDelete.tsx`, `vitest.config.ts`, and the coding standards.
- Upload trust: type comes only from leading-byte sniffing (`worker/receipt.ts`); size checked after parse and by early `Content-Length`; vehicle confirmed before the R2 put; object-then-row with cleanup on insert failure.
- File serving sets stored `Content-Type`, `nosniff`, `Content-Security-Policy: sandbox`, `inline`, and `private` caching, as the spec requires; the View link is `target="_blank" rel="noopener"`.
- Delete removes the row only when `pending`, then the object; 404 vs 409 is decided by a follow-up existence check. Tests cover 204, repeat 404, 409 keeping both, and invalid ids.
- Harness applies every migration in a fresh in-memory Miniflare per test; the `tsconfig.d1test.json` split keeps wrangler/Node types out of the Worker program, and the build typechecks it.
- Client: field errors use `role="alert"` and `aria-describedby`; the preview object URL is revoked on change and unmount; the file is kept on unexpected errors; user text renders as React text only.

## Findings

- F-03 [P3] Receipt delete returns 500 after the row is gone when the R2 delete throws.
- F-04 [P3] "Receipt uploaded." status persists on the history entry and may not be announced.
- F-05 [P3] Upload insert-failure rollback and `Cache-Control` header are untested.
- F-06 [P3] Coding standards not updated for R2 and the D1 test harness.

## Remaining risk

- No browser or assistive-technology run: camera capture, canvas resize, stored JPEG long edge <= 1600, phone-width sticky Home action, and the status announcement are unverified by this review. No Browser tests command is declared.
- Unverified: some desktop browsers (Chrome's built-in PDF viewer in particular) may refuse to render an inline PDF served with `Content-Security-Policy: sandbox`. The header is spec-mandated; confirm View on a PDF in the browsers the owner uses.
- A chunked request without `Content-Length` skips the early 413 and is fully buffered before the 10 MiB check. Acceptable behind Cloudflare Access with one user.
- No live Cloudflare evidence: the R2 bucket and the remote 0006 migration are manual deploy steps.
- Check was not required and was not run.

## Try it now

1. Run `npm run dev` (after `npm run db:migrate:local`) and open the app on an iPhone or at phone width.
2. Tap **Add receipt**, pick a vehicle, then **Take photo**; also try **Choose file** with a HEIC from the photo library.
3. Tap **Upload**: the Receipts page shows "Receipt uploaded." and the receipt as "Waiting for reading".
4. Tap **View**: the photo opens with its long edge at most 1600px. Repeat with a PDF.
5. Tap **Delete**, then **Confirm delete**: the receipt disappears and its file returns 404.
