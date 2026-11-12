# Fix: WebP receipt photos

**Type:** Fix
**Status:** verified
**Branch:** fix/webp-receipt-photos

## The problem

Receipt photos are resized in the browser to 1600px on the longer edge and
re-encoded as JPEG at quality 0.85 (`src/receiptFile.ts`). WebP at a slightly
lower quality gives files roughly 25-35% smaller with text that stays readable,
so R2 storage goes further.

The server accepts only JPEG and PDF. `sniffReceiptType` in `worker/receipt.ts`
checks the file's leading bytes, so a WebP upload would be rejected with "Use a
JPEG photo or a PDF." The client and server need to change together.

## The fix

Client (`src/receiptFile.ts`, `src/ReceiptUploadPage.tsx`):

- Encode with `canvas.toBlob(resolve, 'image/webp', 0.75)`, replacing the
  JPEG encode and `JPEG_QUALITY`. No fallback: the owner only uses modern
  browsers that encode WebP.
- Name the form file `receipt.webp` for photos.
- Keep `MAX_EDGE`, EXIF orientation handling, the 10 MB cap, and PDF passthrough
  unchanged.

Server (`worker/receipt.ts`, `worker/routes/receipts.ts`, `shared/api.ts`,
`worker/db/schema.ts`):

- `sniffReceiptType` recognizes WebP (`RIFF` at bytes 0-3 and `WEBP` at bytes
  8-11) and PDF only. JPEG is removed: no receipts have been stored yet, so
  nothing depends on it (owner decision, 2026-11-11). This needs 12 leading bytes, so read `slice(0, 12)` instead of 8.
  Validation stays byte-based. The declared MIME type and filename are still
  ignored.
- Replace `'image/jpeg'` with `'image/webp'` in `ReceiptContentType`, the
  Drizzle `content_type` enum, and the R2 key `EXTENSIONS` map (`webp`).
- Update the type error message to "Use a photo or a PDF."
- The `content_type` column has no SQL CHECK constraint (`migrations/0006`), so
  no migration is needed. Confirm `npm run db:generate` produces nothing; if it
  does produce a migration, commit it.

Must not break:

- The download response keeps `X-Content-Type-Options: nosniff` and the stored
  content type.
- `ReceiptsPage` shows "Photo" for both image types. It already does this
  because it checks only for PDF.

Config (`wrangler.jsonc`): remove the extra `car_tracker_receipts` R2 binding
with `"remote": true`. Nothing uses it, and it makes `getPlatformProxy` try to
reach the deployed Worker behind Cloudflare Access, which fails every
`*.d1.test.ts` route test (owner decision, 2026-11-11).

No new dependency, no grayscale, and no PDF compression. Those are out of scope.

## Build steps

1. [x] **WebP end to end.** Make the client and server changes above together. Add
   tests to `worker/receipt.test.ts` for a sniffed WebP, a RIFF file that isn't
   WebP (for example `RIFF....WAVE`) returning null, and parse accepting WebP.
   Add a `worker/routes/receipts.d1.test.ts` case where a WebP upload stores
   `image/webp` with a `.webp` R2 key and the matching httpMetadata. Switch the
  existing JPEG fixtures to WebP and assert JPEG is rejected.
   *Done when:* `npm test`, `npm run lint`, and `npm run build` pass, and a
   photo uploaded in the dev server is stored as `.webp` in local R2 and opens
   from the Receipts page.

## Verify

- `npm test`: the new sniff, parse, and route cases pass, and existing PDF
  cases still pass.
- Dev server: upload a phone photo. The network request sends `receipt.webp`,
  the payload is noticeably smaller than before, the receipt shows as "Photo",
  and opening it renders the image.
- Upload a PDF and confirm it still stores unchanged.
- A JPEG upload is rejected with "Use a photo or a PDF."


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3526,"specSha256":"bde0987a74b41a6e8f3291ff19049e2fd2623799c28dd8fdedecdbf22c13ba0f","branch":"refs/heads/fix/webp-receipt-photos","head":"4ca96e5de528b6c8128e99d4f1b989911db3af2a","baseRef":"refs/heads/main","baseCommit":"4ca96e5de528b6c8128e99d4f1b989911db3af2a","sourceTree":"cc419d50275ce2241a7651c456880cc99310c4dc","landing":"local-merge","absentOptional":[]} -->
