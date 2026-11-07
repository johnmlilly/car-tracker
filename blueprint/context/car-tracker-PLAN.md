# Vehicle Maintenance Tracker: Plan

Personal app to track maintenance for a 2024 Honda CR-V and a 2019 Toyota Corolla.

## Stack
- React + TypeScript + Vite (PWA)
- Hono on Cloudflare Workers
- D1 + Drizzle
- R2 (receipt files)
- Cloudflare Access (auth, single user)
- Workers AI vision for receipt extraction, behind `extractReceipt()` so Claude Haiku 5.5 can be swapped in
- Cron Trigger + email or web push for reminders

## Data Model
- `vehicles`
- `service_records`: date, odometer, shop, total, receipt link
- `service_items`: line items mapped to a canonical service
- `schedule_items`: seeded general intervals (miles and/or months), editable
- `odometer_logs`
- `receipts`: R2 key, status (pending, review, confirmed), raw extraction JSON

## Build Order
1. **Schema and seed data**
   - Drizzle schema and migrations
   - Seed vehicles and general schedules for the CR-V and Corolla
2. **API and manual entry**
   - Vehicles, records, and odometer CRUD
   - Manual service entry form
3. **Dashboard**
   - Per item: last done, next due (miles and date), status (OK, soon, overdue)
   - Current mileage estimate
4. **Receipt upload**
   - Camera/file input (`accept="image/*,application/pdf" capture="environment"`)
   - Client-side resize (~1600px JPEG), upload to R2
5. **Extraction and review**
   - `extractReceipt()` returns JSON: date, shop, odometer, total, line items
   - Keyword mapping to canonical services; unmatched items picked by user
   - Review screen with image beside editable fields, then Confirm writes records
6. **Reminders**
   - Daily cron finds items coming due
   - Email or web push (decide at this step)

## Cost Notes (estimates, ~50 receipts/yr)
- Workers AI vision: free tier (10,000 neurons/day)
- Claude Haiku 5.5: ~$0.0005/receipt (~$0.03/yr)
- Claude Sonnet 5.5: ~$0.01/receipt (~$0.50/yr)

## Phase 2
- Compare against owner's manual intervals
- `unpdf` for text extraction
- Honda CR-V uses Maintenance Minder codes (A/B + sub-items 1-8), so it needs a lookup table instead of fixed intervals
- Manual schedule pages extract poorly (rotated headings, checkbox glyphs), so expect manual verification
