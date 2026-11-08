# Project Plan

Developed through `/discovery` on 2026-11-07, building on the draft in
`blueprint/context/car-tracker-PLAN.md`. Edit freely; this file is yours.

## 1. Problem - What problem are we solving?

Keeping two family cars on top of maintenance currently lives in my head, glovebox
receipts, and the cars' own dashboards. Nothing answers "what's due soon, and is
anything overdue?" in one place, and paper receipts are a poor service history.

car-tracker is a personal app that:

- keeps a complete service history for each vehicle, captured mostly by
  photographing receipts
- tells me what is coming due or overdue, per vehicle and per service item
- emails me when something needs attention, so I don't have to remember to check

Success: I stop tracking maintenance mentally. The dashboard is trusted because
its "due" state matches reality (including what the Odyssey itself says), and
logging a service takes about a minute from receipt photo to confirmed record.

## 2. Users - Who is this for?

One user: me. Single owner of both vehicles, using a phone at the shop counter or
in the driveway, and a laptop for bulk work such as importing old receipts.

There are no other users, roles, or sharing in the MVP.

## 3. Features - What does the MVP need?

Vehicles (seeded, not user-created in the MVP):

- 2024 Honda Odyssey
- 2019 Toyota Corolla

### Scheduling model

Both vehicles use fixed intervals. The Odyssey also logs Honda Maintenance Minder
codes on top of its intervals.

**Fixed intervals (both vehicles).**

- Each canonical service has an interval in miles and/or months, seeded from the
  maintenance schedule and editable. The Odyssey starts with the same services
  and intervals as the Corolla, except tire rotation every 5,000 miles.
- A one-time **"last done" baseline** per item (date and/or mileage) seeds the
  starting point, so the dashboard is useful on day one without history.
- Next due = last done + interval, by miles and by date; whichever comes first.
- "Last done" is always the **newest confirmed** service for that item,
  regardless of the order records were entered or imported.

**Odyssey - Honda Maintenance Minder (in addition to intervals).**

- The car decides when service is due and shows a code (for example `B12`): a main
  letter (A or B) plus numbered sub-items.
- A **Minder lookup table** maps letters and sub-items to canonical services. Its
  contents come from the Odyssey owner's manual and are verified by hand.
- I **log the code when the car shows it**. That opens the mapped services as due
  items, and they are **overdue from the moment they are logged** (the car is
  already asking for them).
- The code is also read from receipts as a **cross-check**: if the receipt's code
  differs from the logged code, review flags it and I pick the correct one before
  confirming.
- The app does not forecast the next Minder code. After service, a service's
  Minder item is closed and only its interval (if any) drives its status until I
  log a new code.
- When a service has both an interval and an open Minder item, the worse status
  wins: an open Minder item is always overdue.

### Closing due items

- A confirmed service record closes **only the items it actually covers**. If
  `B12` opened four items and the receipt shows two, the other two stay overdue
  until a later record covers them.

### Status

- Each item is **OK**, **soon**, or **overdue**.
- Interval items (both vehicles) "soon": within **1,000 miles or 30 days** of the
  due point, whichever comes first. "Overdue": past either.
- Odyssey logged Minder items: overdue immediately, regardless of interval.
- Status is shown with color plus a text label, never color alone.

### Mileage

- I log odometer readings directly; receipts also contribute readings.
- Current mileage is estimated from recent readings and driving rate, and used for
  mileage-based due points on both vehicles.

### Data entry

- **Manual service entry**: date, odometer, shop, total, and line items mapped to
  canonical services.
- **Receipt upload**: camera or file picker
  (`accept="image/*,application/pdf" capture="environment"`). Images resized on
  the phone (about 1600px JPEG) before upload; stored in R2.
- **Receipt reading**: `extractReceipt()` returns date, shop, odometer, total,
  Minder code when present, and line items. Line items are matched to canonical
  services by keyword; anything unmatched I pick by hand.
- **Single-receipt review**: receipt image beside editable fields; Confirm writes
  the service record and closes covered items. Nothing extracted becomes a record
  until I confirm it.
- **Bulk import** (MVP): upload many past receipts at once. Each is read, then all
  appear in a **quick-review list**: one editable row per receipt (date, shop,
  odometer, services) with batch confirm and the full side-by-side view on
  demand.
  - Historical Odyssey Minder codes on imported receipts **only record what was
    done**; they never open new due items.
  - The per-item baseline remains for anything old receipts don't cover.

### Reminders

- Email via **Resend**, sent from a `johnlilly.dev` address (for example
  `reminders@johnlilly.dev`).
- **Weekly digest**, Monday 8:00 am **Eastern**, sent **only when** something is
  soon or overdue.
- **Overdue alert**: when an item newly becomes overdue, one email the next
  morning rather than waiting for Monday.
- **Odometer nudge** in the digest when the latest reading is over 30 days old.

### Explicit non-goals (MVP)

- Multiple users, sharing, or roles
- Offline mode or an offline upload queue (the phone's camera roll is the queue)
- Push notifications
- Comparing service history against owner's manual intervals (`unpdf`)
- Cost reports, spending charts, fuel tracking
- Adding or managing vehicles in the UI
- Forecasting the Odyssey's next Minder code

### Later possibilities

- Owner's manual comparison and `unpdf` text extraction (manual schedule pages
  extract poorly: rotated headings, checkbox glyphs; expect manual verification)
- Web push reminders
- Cost and spending views
- Custom subdomain under `johnlilly.dev`

## 4. Data - What are we storing?

- `vehicles`: the two seeded vehicles and whether each also uses Minder codes
- `services`: canonical service types (oil change, tire rotation, cabin filter,
  and so on) with keywords for receipt matching
- `schedule_items`: per-vehicle intervals (miles and/or months), seeded
  and editable, plus the "last done" baseline
- `minder_codes`: Odyssey lookup from main letter and sub-item numbers to services
- `minder_logs`: codes I logged, when, at what mileage, and which items they opened
- `service_records`: date, odometer, shop, total, vehicle, linked receipt
- `service_items`: line items on a record, each mapped to a canonical service
  (or flagged unmatched until I pick one)
- `odometer_logs`: manual readings and readings taken from records
- `receipts`: R2 key, status (`pending`, `review`, `confirmed`), raw extraction
  JSON, import batch when part of a bulk upload
- Reminder send state: enough to avoid duplicate overdue alerts

> TODO: exact Corolla intervals and Odyssey Minder sub-item meanings come from the
> owner's manuals and are verified by hand when feature 1 is built.

## 5. Tech - What stack are we using?

- **Client**: React 19 + TypeScript (strict) + Vite, Tailwind CSS v4, installable
  PWA (online only).
- **API**: Hono on Cloudflare Workers.
- **Database**: Cloudflare D1 with Drizzle ORM and migrations.
- **Files**: Cloudflare R2 for receipt images and PDFs.
- **Auth**: Cloudflare Access in front of the app, single user. No in-app login.
- **Receipt reading**: Claude Haiku 5.5 by default, behind `extractReceipt()` so
  the model can be swapped (Workers AI vision remains a possible alternative).
- **Scheduled jobs**: Cloudflare Cron Triggers for reminders.
- **Email**: Resend.

Cost notes (estimates, about 50 receipts a year):

- Haiku 5.5: about $0.0005 per receipt (about $0.03 a year); a 200-receipt
  backfill is about $0.10.
- Cloudflare Workers, D1, R2, and Access: expected to stay in free tiers.

## 6. Monetize - How will this make money?

It won't. Personal tool; no ads, accounts, or payments.

## 7. UI/UX - How should this look and feel?

- **Home**: two vehicle cards (Odyssey, Corolla), each with estimated mileage and a
  count of soon/overdue items. Tap through to the full item list: status, last
  done, next due.
- **Primary action**: a prominent **Add receipt** button, always in thumb reach.
  Secondary: log odometer, log Minder code, manual entry.
- **Style**: clean and utilitarian. Follows system light/dark. Status by color plus
  text label.
- **Mobile-first** for everyday use; the bulk-import quick-review list is designed
  for a laptop-width screen.

## 8. Deployment - Where and how will this ship?

- **Host**: Cloudflare Workers. The Worker serves the API and the built static
  client (`npm run build` output in `dist/`).
- **URL**: the `workers.dev` subdomain for now, protected by Cloudflare Access. A
  subdomain under `johnlilly.dev` comes later; nothing should depend on the
  hostname.
- **Bindings**: D1 database, R2 bucket, Cron Trigger.
- **Secrets** (by name, set as Worker secrets): `ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`. Reminder recipient and sender addresses as config.
- **Cron**: Cron Triggers run in UTC. To hold 8:00 am Eastern across daylight
  saving, run at both candidate UTC hours and send only when it is 8:00 am in
  `America/New_York`. Same pattern for the next-morning overdue alert.
- **Migrations**: Drizzle migrations applied to D1 before deploying code that
  depends on them.

> TODO: exact Worker name, D1/R2 resource names, and Access policy details are
> settled in feature 1.

## 9. Usage model and constraints (optional)

- One user, two vehicles, about 50 receipts a year plus a one-time backfill.
- Internet-facing, but entirely behind Cloudflare Access; only I can reach it.
- Trust boundaries that still matter: uploaded files and AI extraction output are
  untrusted input, validated server-side, and never written as records without my
  confirmation. API keys stay server-side as Worker secrets.
- Explicit non-requirements: multi-tenancy, roles, high availability, compliance,
  audit logging, scale beyond personal use.
