# Feature: Receipt review and confirm

**From build-plan:** feature 7b
**Build attempt:** 1
**Branch:** feature/receipt-review-and-confirm
**Status:** verified

## Goal

A receipt in `review` opens a review screen with the receipt beside an editable
service form, prefilled from what 7a read. For the Odyssey, the receipt's Minder
code is checked against the open logged code, and a mismatch must be resolved
before confirming. Confirm writes one service record (source `receipt`, linked
to the receipt), which closes the items it covers exactly like a manual entry,
and marks the receipt `confirmed`. The Corolla also gains a Transmission fluid
schedule item (owner decision 2026-11-11: Corolla only, 60,000 mi / 72 months).

## In scope

- Schema: `service_records.minder_code` (text, nullable) and
  `service_records.receipt_id` (fk -> receipts, nullable, unique).
- Data migration: Corolla `Transmission fluid` schedule item, 60,000 mi / 72 mo.
- `POST /api/receipts/:id/confirm` and review data on `GET /api/receipts/:id`.
- Deleting a service record that came from a receipt returns that receipt to
  `review`.
- Review page at `/receipts/:id/review`; "Review" link on `review` rows of the
  Receipts list.
- `ServiceForm` reuse: initial values, submit URL and label, extra fields slot.
- Keyword matching also accepts a plural `s`/`es` (7a review risk: "Spark
  plugs", "air filters").
- Findings F-07 (retry 409) and F-08 (concurrent-read test), both small and in
  this area.
- Inline PDF preview on the review screen (owner request 2026-11-11), using the
  browser's PDF viewer in an iframe. Owner chose this over pdf.js, accepting that
  PDFs are served without the `sandbox` CSP (images keep it).
- Home vehicle cards get a "Service history" link to `/vehicles/:id/services`
  (owner request 2026-11-11: the service records page was hard to find because
  its only entry point was labeled "Add service").

## Out of scope

- Changing a receipt's vehicle at review (it was chosen at upload).
- Logging a new Minder code from a receipt or reopening items; the chosen code
  is stored on the record only. Closing still follows the matched services.
- Bulk quick-review (feature 8), editing or deleting `review` receipts,
  editing keywords, a pdf.js renderer (the browser's own viewer is used).
- Odyssey schedule changes.

## Build loop

`workflow.stepReview` is `feature`; Autopilot builds all steps, then one review
packet. `workflow.checkpointCommits` is `disabled`.

## Build steps

1. [x] **Data and matching.** In `worker/db/schema.ts` add `minderCode` and
   `receiptId` (references `receipts.id`) to `serviceRecords` with a unique index
   on `receipt_id`; run `npm run db:generate` (expect `0007_*`). Add
   `npm run db:generate -- --custom --name corolla_transmission` (`0008_*`)
   inserting the Corolla schedule row by seeded names, like `0004`. Extend
   `matchService` to accept an optional `s`/`es` after a keyword. *Done when:*
   a D1 test shows the Corolla has Transmission fluid at 60,000/72 and the
   Odyssey does not; matching unit tests cover plurals; `npm test` passes.
2. [x] **Confirm and record linkage (server).** Move the insert-building half of
   `POST /vehicles/:id/service-records` into a shared helper in
   `worker/serviceRecordWrite.ts` used by both routes (behavior unchanged for
   manual entries). Add `POST /api/receipts/:id/confirm`; extend the detail
   response; make record delete return a linked receipt to `review`; add the
   F-08 concurrent-read test. *Done when:* route tests cover the contract table
   below and existing service-record tests still pass.
3. [x] **Review screen (client).** `ServiceForm` props for initial values,
   submit URL, submit label, extra body and extra fields; `ReceiptReviewPage`
   at `/receipts/:id/review`; route + route test; "Review" link on `review`
   rows; F-07 (a 409 from Read receipt refreshes the list); "Service history"
   link on each home vehicle card. *Done when:*
   `npm run build`, `npm run lint`, `npm test` pass and the manual try path
   works on the dev server.

## Files / areas

- `worker/db/schema.ts`, `migrations/0007_*`, `migrations/0008_corolla_transmission.sql`, `migrations/meta/*`
- `worker/receiptExtraction.ts` (+ test)
- New `worker/serviceRecordWrite.ts`; `worker/routes/serviceRecords.ts`, `worker/routes/receipts.ts`, their D1 tests
- `shared/api.ts`
- `src/ServiceForm.tsx`, new `src/ReceiptReviewPage.tsx`, `src/ReceiptsPage.tsx`, `src/route.ts` (+ test), `src/App.tsx`, `src/HomePage.tsx`
- `blueprint/context/findings.md` (F-07, F-08 -> `fixed`)

## Data / contracts

**Schema.** `service_records.minder_code` text null; `service_records.receipt_id`
integer null references `receipts(id)`, unique (SQLite allows many NULLs). If
drizzle-kit generates a table rebuild instead of `ALTER TABLE ADD COLUMN`,
review it for data preservation before applying; stop if it would drop rows.

**Matching.** A keyword matches when followed by nothing, `s`, or `es`, then a
non-letter/digit boundary (`spark plug` matches "Spark plugs"; `lof` still does
not match "aloft"). Still exactly-one-service-or-null.

**`GET /api/receipts/:id`** adds:
`today` (Eastern), `scheduleModel` of the receipt's vehicle (null without one),
`services: {id, name}[]` (name order, as on the services page), and
`openMinderCode: string | null`: the code of the newest `minder_logs` row for
that vehicle that still has an open due item; null for interval vehicles.

**`POST /api/receipts/:id/confirm`** body = `ServiceRecordInput` plus
`minderCode: string | null`.

| Case | Status | Effect |
|---|---|---|
| Invalid/unknown id | 404 `Receipt not found` | none |
| Receipt not `review` | 409 `This receipt isn't ready to confirm.` | none |
| Receipt has no vehicle | 409 same message | none |
| Body invalid (same rules/messages as manual entry) | 400 with `fields` | none |
| `minderCode` not accepted by `normalizeCode` | 400 `fields.minderCode` `Enter a code like A or B12.` | none |
| Unknown service id / odometer conflict | 400 as manual entry | none |
| Unique `receipt_id` conflict (already confirmed) | 409 same message | batch rolled back |
| Success | 201 `ReceiptView` (status `confirmed`) | one batch: record (`source 'receipt'`, `receiptId`, `minderCode` normalized; forced null for `interval` vehicles), items, odometer log, Minder closures, `UPDATE receipts SET status='confirmed' WHERE id=? AND status='review'` |

**Delete record.** `DELETE /service-records/:id` adds, in the same batch,
`UPDATE receipts SET status='review' WHERE id = <record.receiptId>` (the receipt
row stays, so the FK is safe). Manual records unchanged.

**Review UI.**
- Layout: receipt on the left at `lg:` width, stacked above the form on phones.
  Image: `<img src="/api/receipts/:id/file" alt="Receipt">`. PDF:
  `<iframe title="Receipt PDF">` of the same URL at 70vh, plus an "Open PDF in a
  new tab" link (iPhone Safari shows only page 1 inline).
- File endpoint: PDFs are served without `Content-Security-Policy: sandbox`
  (browsers will not render a sandboxed PDF in an iframe); images keep it. Both
  keep `nosniff`, `inline`, and the upload-time byte sniff.
- Form prefill: date (null -> empty, so it must be entered), odometer, shop,
  total and line amounts as dollars, lines with `suggestedServiceId` (null ->
  "Other (not tracked)"); no lines -> one empty line. All values are rendered
  as React text/inputs, never HTML.
- Minder (vehicle `scheduleModel === 'minder'` only): text field "Minder code
  on receipt (optional)" prefilled with the receipt code. When the receipt code
  and `openMinderCode` are both present and differ, show a warning ("The
  receipt shows B12, but the open logged code is A1.") with two radio choices
  (each code); Confirm is blocked with an inline error until one is chosen, and
  the choice fills the field. No open code or no receipt code: no warning.
- Submit label "Confirm service"; on success navigate to
  `/vehicles/:vehicleId/services`. 400 fields show inline (including
  `minderCode`); 409 shows "This receipt was already confirmed or isn't ready."
  with a link to Receipts; other errors use the existing generic message.
- Receipt not in `review`: page shows "This receipt isn't ready to review." and
  a link back to Receipts. Unknown id: PageShell error state.
- `ServiceForm` on the manual page behaves exactly as before (defaults keep the
  current URL, label, reset-after-save, and "Service saved." status).

## Testing

- Unit: `matchService` plurals (`plugs`, `filters`, `rotations`) and the
  `aloft` boundary still null.
- D1: migration result (Corolla has Transmission fluid 60000/72; Odyssey none);
  confirm success (record fields, `source`, `receipt_id`, `minder_code`, items,
  odometer log, Minder item closed for a covered Odyssey service, receipt
  `confirmed`); every error row in the table; second confirm 409 with one
  record; Corolla minder code forced null; delete returns receipt to `review`;
  detail includes `openMinderCode`, `scheduleModel`, `services`, `today`;
  F-08 concurrent read (mocked extract flips the row first) -> 409, stored
  extraction untouched; existing manual-entry tests unchanged.
- Route matcher: `/receipts/1/review` and trailing slash; rejects `/receipts/0/review`.
- No browser harness: UI gets build, lint, and the manual try path.

## Notes for the AI

- Reuse `parseServiceRecordInput`, `findConflict`, `selectDueItemsToClose`,
  `normalizeCode`, `parseDollarsToCents`/`formatCents` (check `shared/money.ts`
  for a cents-to-input-string helper before adding one).
- Keep the max(id)-in-batch pattern for the new record id; one batch is one
  transaction.
- Extraction text is untrusted: React text only, no `dangerouslySetInnerHTML`.

## Verification record

- Automated (2026-11-11, after the owner's PDF-preview and service-history-link
  additions): `npm test` 368 passed (incl. 12 confirm D1 tests, migration test,
  plural matching, F-08 concurrent read, PDF/image file headers, route matcher),
  `npm run lint` clean, `npm run build` passes. `npm run db:generate` produced
  `0007_service_record_receipt.sql` as two `ALTER TABLE ... ADD` plus a unique
  index (no table rebuild).
- Not yet observed: the review screen and Confirm flow on the dev server (no
  browser harness; the manual try path below is pending the owner).

## Manual try path

1. `npm run db:migrate:local`, then `npm run dev` (key in root `.dev.vars`).
2. Receipts -> "Review" on the Lake Ridge receipt: the PDF previews on the left,
   fields prefilled, transmission lines preset to Transmission fluid.
3. Confirm -> lands on the Corolla service history with the new record; the
   Corolla schedule shows Transmission fluid with last done set.
4. Receipts list shows it "Confirmed". Deleting that service record from the
   history returns the receipt to "Ready to review".
5. Odyssey: log code A1, upload a receipt printed with B12 -> mismatch warning;
   Confirm blocked until a code is chosen.
6. Home: each vehicle card shows "Service history", which opens that
   vehicle's service records (`/vehicles/:id/services`).


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11106,"specSha256":"6be93907d13613b4d5a0c89d09f87b2778ef09114ac3bdb9afa1de549360bc83","branch":"refs/heads/feature/receipt-review-and-confirm","head":"04754fbfd79d5bed1fed1cec16211ae8ca7e0fc7","baseRef":"refs/heads/main","baseCommit":"dd098175e36409fecb55e91885b45f481d53f2ec","sourceTree":"3b7a43c43c639bf96e153b01e9855ddbd98bc17a","landing":"local-merge","absentOptional":[]} -->

## Findings

### 7b/F-07 [P3] closed - Read retry shows a permanent error when the receipt was already read

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
**Resolution:** Fixed in feature 7b: `ReadButton` in `src/ReceiptsPage.tsx` treats an `ApiError` 409 as already read and calls `onRead()` to refresh the list instead of showing the error. Closed 2026-11-12 by independent /audit (fresh subagent, scope: current): `src/ReceiptsPage.tsx:37-41` checks `ApiError` status 409 and calls `onRead()`; the read route's only 409s are already-read cases (`worker/routes/receipts.ts:189,214`), so the row refreshes to `review` and the button unmounts. No new defect.

### 7b/F-08 [P3] closed - The concurrent-read 409 guard has no route test

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
**Resolution:** Fixed in feature 7b: `receipts.d1.test.ts` "keeps the first result when a concurrent read finishes first" flips the row to `review` inside the mocked extract and asserts 409 with the winner's extraction unchanged. Closed 2026-11-12 by independent /audit (fresh subagent, scope: current): the test at `worker/routes/receipts.d1.test.ts:275` reaches the final `WHERE status = 'pending'` branch (`worker/routes/receipts.ts:209-214`) and asserts status and stored extraction; `npm test` passes. No new defect.

## Independent review

**Status:** passed
**Target commit:** 04754fbfd79d5bed1fed1cec16211ae8ca7e0fc7
**Base commit:** dd098175e36409fecb55e91885b45f481d53f2ec
**Base ref:** main
**Spec hash:** 6be93907d13613b4d5a0c89d09f87b2778ef09114ac3bdb9afa1de549360bc83
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-12T03:56:04Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-12T03:58:11Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required


## Commands

- `npm test`: pass (21 files, 368 tests)
- `npm run lint`: pass
- `npm run build`: pass (`tsc -b` typecheck plus client and Worker build)

## Evidence

- Freshness: HEAD, `git merge-base main HEAD`, and the spec SHA-256 match the request; only `blueprint/context/review.md` differed from HEAD before this pass. Spec is tracked, so no snapshot applies.
- Reviewed all 27 changed files in the range against feature 7b's spec, plus callers and contracts: `worker/http.ts`, `worker/minder.ts` (`normalizeCode`), `worker/receipt.ts` (upload sniff), `shared/money.ts`, the read and delete receipt routes, and the service-record delete route.
- Migrations: `0007` is two `ALTER TABLE ... ADD` plus a unique index (no rebuild, rows preserved); `0008` inserts by the seeded names `2019 Toyota Corolla` and `Transmission fluid` (`0001_seed.sql:5,14`), and `migrations.d1.test.ts` proves Corolla-only 60000/72.
- `worker/serviceRecordWrite.ts` is a faithful move of the old manual insert (same validation, max(id)-in-batch, closures); manual route passes `source: 'manual'` and existing service-record tests pass unchanged.
- Confirm route: status/vehicle 409, combined 400 fields including `minderCode`, interval code forced null, one batch with guarded status update; `isUniqueViolation` can only fire on `service_records_receipt_id_unique` because no other unique constraint is touched by the batch. Rollback and second-confirm tests assert one record and unchanged items.
- Record delete flips a linked receipt to `review` in the same batch; receipt delete is limited to `pending`, so the new FK cannot strand a confirmed receipt.
- PDF file response: no `sandbox` CSP per owner decision; remaining protections hold: Content-Type comes from the upload-time byte sniff (`%PDF-` or webp only), `nosniff`, `inline`, private cache, and the app sits behind Access with a single owner uploader. Images keep `sandbox` (tested).
- Review UI renders extraction text only as React text and input values; no `dangerouslySetInnerHTML`. Iframe has a title, image has alt, Minder mismatch uses a labelled fieldset/legend with radios and an `role="alert"` error tied by `aria-describedby`.
- F-07 and F-08 repairs verified and closed.

## Findings

- None new. F-07 closed, F-08 closed.

## Remaining risk

- No browser harness: the review screen, Confirm flow, PDF iframe preview, and Minder mismatch gating were reviewed by code only; the spec's manual try path is still pending the owner.
- Unverified, low likelihood: two concurrent deletes of the same receipt-linked record interleaved with a re-confirm could let the stale delete batch set the receipt back to `review` while a new record links it (the receipt update in `worker/routes/serviceRecords.ts:173-176` is not conditioned on the record still existing). Single-owner usage makes this impractical; not recorded as a finding.
- Client-side helpers in `src/ReceiptReviewPage.tsx` (`initialValues`, mismatch gating) have no unit tests; covered only by build, lint, and the pending manual path.

## Try it now

1. Run `npm run db:migrate:local`, then `npm run dev`.
2. On the home page, each vehicle card shows "Service history", which opens that vehicle's service records.
3. Receipts -> "Review" on a read receipt: the PDF previews (or the photo shows) on the left; the form is prefilled and lines carry suggested services.
4. "Confirm service" lands on the vehicle's service history with the new record; the receipt shows "Confirmed".
5. Deleting that service record returns the receipt to "Ready to review".
6. Odyssey: with a logged code that differs from the receipt's Minder code, Confirm is blocked until one code is chosen.
