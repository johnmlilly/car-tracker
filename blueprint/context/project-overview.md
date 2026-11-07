# car-tracker - Project Overview

<!-- blueprint:source-hash d247f0874dc1836cd0e4b73a376a9c1ba0bcb4dd64e210ffb2f1027bc800d0ad -->

> Personal, single-user PWA that tracks maintenance for a 2024 Honda Odyssey and a
> 2019 Toyota Corolla: service history from receipt photos, what's due, and email
> reminders.

## Problem

Maintenance state lives in my head, glovebox receipts, and the cars' dashboards.
Nothing answers "what's due soon, and is anything overdue?" in one place. Success:
the dashboard's due state matches reality (including the Odyssey's own Minder
codes) and logging a service takes about a minute from receipt photo to confirmed
record.

## Users

- **Owner (only user)** - phone at the shop counter or driveway for capture and
  checking status; laptop for bulk import of old receipts. No roles or sharing.

## Usage model

- One user, two vehicles, about 50 receipts a year plus a one-time backfill.
- Internet-facing, entirely behind Cloudflare Access. No in-app auth.
- Real trust boundaries: uploaded files and AI extraction output are untrusted,
  validated server-side, and never written as records without explicit
  confirmation. API keys stay server-side as Worker secrets.
- Non-requirements: multi-tenancy, roles, high availability, compliance, audit
  logging, scale beyond personal use.

## Scheduling rules

Two models, chosen per vehicle. These rules drive several features; keep them
consistent.

**Corolla - fixed intervals**
- Each service has an interval in miles and/or months (seeded, editable).
- One-time "last done" baseline per item (date and/or mileage).
- Next due = last done + interval; whichever of miles or date comes first.
- "Last done" = newest confirmed service for the item, regardless of entry or
  import order.
- Status: **soon** within 1,000 miles or 30 days of due; **overdue** past either;
  otherwise **OK**.

**Odyssey - Honda Maintenance Minder**
- Car shows a code (main letter A/B plus numbered sub-items, e.g. `B12`).
- Lookup table maps letter and sub-items to canonical services.
- Logging a code opens the mapped services as due items, **overdue immediately**.
- Receipt Minder code is a cross-check: mismatch with the open logged code is
  flagged at review; user picks the correct code before confirming.
- No forecasting: after service, nothing is due until a new code is logged.
- Historical codes on bulk-imported receipts record history only; they never open
  due items.

**Closing items (both vehicles)**
- A confirmed service record closes only the items it covers. Uncovered items from
  a logged code stay overdue.

**Mileage**
- Readings come from manual odometer logs and confirmed service records.
- Current mileage is estimated from recent readings and driving rate; used for
  Corolla mileage due points.

## Features

Build order from `build-plan.md`. Headline: **7. Receipt reading and review**.

Milestone 1 - Know what's due
1. **Vehicles and schedules foundation** - D1 schema and seed data (vehicles,
   services, Corolla intervals, Odyssey Minder lookup); deployed to workers.dev
   behind Access with a home screen of both vehicle cards.
2. **Corolla baselines and status** - enter "last done" per item; compute next due
   and OK / soon / overdue.
3. **Odometer logging and mileage estimate** - log readings; estimate current
   mileage from driving rate.
4. **Odyssey Minder code logging** - log a code and open its due items as overdue.
5. **Manual service entry** - record a service with line items; closes only the
   items it covers.

Milestone 2 - Receipts
6. **Receipt upload** - camera or file capture, client-side resize (~1600px JPEG),
   stored in R2.
7. **Receipt reading and review** - `extractReceipt()` with Haiku 5.5, keyword
   mapping to services, side-by-side review, Minder code mismatch flag.
8. **Bulk import** - upload many past receipts; confirm from a quick-review list.

Milestone 3 - Reminders
9. **Email reminders** - Resend weekly digest, next-morning overdue alert,
   stale-odometer nudge.

Non-goals (MVP): multiple users or sharing; offline mode or upload queue; push
notifications; owner's-manual comparison (`unpdf`); cost reports, spending
charts, fuel tracking; adding or managing vehicles in the UI; forecasting the
next Minder code.

## Data model

D1 (SQLite) via Drizzle. Types below are logical; dates are ISO `YYYY-MM-DD`,
timestamps ISO strings, money in integer cents, mileage in integer miles.

> Feature 1 locks `vehicles`, `services`, `schedule_items`, and `minder_codes`;
> every later feature reads them. Feature 4 locks `minder_logs` and
> `due_items`; features 5, 7, and 8 close items through it.

### vehicles
- `id` (int, pk)
- `name` (text) - "2024 Honda Odyssey", "2019 Toyota Corolla"
- `scheduleModel` (enum: `interval` | `minder`)
- Seeded only; no create/edit UI in the MVP.

### services
- `id` (int, pk)
- `name` (text, unique) - canonical service, e.g. "Oil change", "Tire rotation"
- `keywords` (text, JSON array) - used to match receipt line items

### schedule_items (Corolla)
- `id` (int, pk)
- `vehicleId` (fk -> vehicles)
- `serviceId` (fk -> services); unique per vehicle
- `intervalMiles` (int, nullable)
- `intervalMonths` (int, nullable) - at least one of miles or months required
- `baselineDate` (date, nullable), `baselineOdometer` (int, nullable) - one-time
  "last done" seed
- Last done = newer of the baseline and the newest confirmed `service_items` row
  for this vehicle and service.

### minder_codes (Odyssey lookup)
- `id` (int, pk)
- `code` (text) - a main letter (`A`, `B`) or sub-item number (`1`, `2`, ...)
- `kind` (enum: `main` | `sub`)
- `serviceId` (fk -> services); one code can map to several services (one row each)

### minder_logs
- `id` (int, pk)
- `vehicleId` (fk -> vehicles)
- `code` (text) - as shown, e.g. `B12`
- `loggedAt` (timestamp), `odometer` (int, nullable)

### due_items (Odyssey items opened by a logged code)
- `id` (int, pk)
- `minderLogId` (fk -> minder_logs)
- `serviceId` (fk -> services)
- `closedByServiceItemId` (fk -> service_items, nullable) - null means still overdue

### service_records
- `id` (int, pk)
- `vehicleId` (fk -> vehicles)
- `date` (date), `odometer` (int, nullable), `shop` (text, nullable)
- `totalCents` (int, nullable)
- `minderCode` (text, nullable) - code printed on the receipt, if any
- `receiptId` (fk -> receipts, nullable)
- `source` (enum: `manual` | `receipt` | `import`)
- Created only on explicit confirmation.

### service_items
- `id` (int, pk)
- `serviceRecordId` (fk -> service_records)
- `description` (text) - line text as written
- `serviceId` (fk -> services, nullable) - null until matched or picked
- `amountCents` (int, nullable)

### odometer_logs
- `id` (int, pk)
- `vehicleId` (fk -> vehicles)
- `date` (date), `odometer` (int)
- `source` (enum: `manual` | `record`), `serviceRecordId` (fk, nullable)

### receipts
- `id` (int, pk)
- `vehicleId` (fk -> vehicles, nullable) - may be unknown until review
- `r2Key` (text), `contentType` (text)
- `status` (enum: `pending` | `review` | `confirmed`)
- `extraction` (text, JSON, nullable) - raw `extractReceipt()` output
- `importBatchId` (text, nullable) - groups a bulk upload
- `uploadedAt` (timestamp)

### reminder_sends
- `id` (int, pk)
- `kind` (enum: `digest` | `overdue_alert`)
- `itemKey` (text, nullable) - identifies the overdue item for alert dedupe
- `sentAt` (timestamp)

> TODO: exact Corolla intervals and Odyssey Minder sub-item meanings come from the
> owner's manuals and are verified by hand in feature 1.

### extractReceipt() contract
Returns `{ date, shop, odometer, totalCents, minderCode, lineItems: [{ description,
amountCents }] }`, every field nullable. Output is validated server-side before
populating a review; it never writes records directly.

## Tech stack

- **React 19 + TypeScript (strict) + Vite** - client SPA, installable PWA, online only
- **Tailwind CSS v4** - styling
- **Hono on Cloudflare Workers** - API; same Worker serves the built client
- **Cloudflare D1 + Drizzle** - database and migrations
- **Cloudflare R2** - receipt images and PDFs
- **Cloudflare Access** - single-user auth in front of the whole app
- **Claude Haiku 5.5** - receipt reading behind `extractReceipt()` (swappable,
  Workers AI vision as an alternative)
- **Cloudflare Cron Triggers** - reminder jobs
- **Resend** - reminder email from a `johnlilly.dev` address

## Monetization

None. Personal tool.

## UI/UX

Clean, utilitarian, mobile-first; follows system light/dark. Status uses color plus
a text label, never color alone.

- **Home** - two vehicle cards: estimated mileage, count of soon/overdue items.
  Prominent **Add receipt** action in thumb reach; secondary: log odometer, log
  Minder code, manual entry.
- **Vehicle detail** - all items with status, last done, next due.
- **Receipt review** - receipt image beside editable fields; Confirm writes the
  record.
- **Bulk quick-review list** - one editable row per receipt (date, shop, odometer,
  services), batch confirm, full review on demand. Designed for laptop width.
- **Corolla baselines**, **odometer log**, **Minder code log**, **manual entry**
  forms.

> TODO: route paths are not set in the plan; choose them in feature 1.

## Deployment

- **Host**: one Cloudflare Worker serving the Hono API and static client
  (`npm run build` -> `dist/`).
- **URL**: `workers.dev` subdomain behind Cloudflare Access; a `johnlilly.dev`
  subdomain later. Nothing may depend on the hostname.
- **Bindings**: D1, R2, Cron Trigger.
- **Secrets**: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`. Sender and recipient
  addresses as config.
- **Cron**: triggers run in UTC. Run at both candidate UTC hours and send only when
  it is 8:00 am `America/New_York` (weekly digest on Monday; overdue alert next
  morning).
- **Migrations**: apply Drizzle migrations to D1 before deploying dependent code.

> TODO: Worker name, D1/R2 resource names, and Access policy details are settled
> in feature 1.

## Open questions

> Resolve in the plans, then re-run /overview.

- Corolla intervals and Odyssey Minder sub-item meanings (owner's manuals, feature 1).
- Route paths (feature 1).
- Worker, D1, and R2 names and Access policy (feature 1).
