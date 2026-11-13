# Build Plan

Features in build order. Details come later in `/feature`. Run `/overview` when
both planning docs are ready; it adds tracking numbers and checkboxes if needed.
Do not renumber completed features; their archived specs refer to these IDs.

## Your features

### Milestone 1 - Know what's due

- [x] 1. **Vehicles and schedules foundation** - D1 schema and seed data (vehicles, canonical services, Corolla intervals, Odyssey Minder lookup), deployed to workers.dev behind Cloudflare Access with a home screen showing both vehicle cards
- [x] 2. **Corolla baselines and status** - enter "last done" per item; compute next due and OK / soon / overdue
- [x] 3. **Odometer logging and mileage estimate** - log readings and estimate current mileage from driving rate
- [x] 4. **Odyssey Minder code logging** - Odyssey gets the same interval schedule as the Corolla (tire rotation every 5,000 mi); log a code shown by the car and open its due items as overdue; worse of interval and Minder status wins
- [x] 5. **Manual service entry** - record a service with line items; each confirmed record closes only the items it covers

### Milestone 2 - Receipts

- [x] 6. **Receipt upload** - camera or file capture, client-side resize, stored in R2
- [x] 7. **Receipt reading and review** - `extractReceipt()` with Haiku 5.5, keyword mapping to services, side-by-side review, Minder code mismatch flag
  - [x] 7a. **Receipt reading** - read each receipt with `extractReceipt()` (Haiku 5.5) right after upload, validate the output, map line items to services by keyword, store it, and move the receipt to review; retry when reading fails
  - [x] 7b. **Receipt review and confirm** - receipt image beside editable fields, Minder code mismatch flag, Confirm writes the service record linked to its receipt; add a Transmission fluid schedule item to the Corolla only (60,000 mi / 72 months)
- [ ] 8. **UI refresh** - muted slate theme (flat slate-blue accent, system font with tabular numbers, lucide icons), light by default with a Light/Dark choice in a settings menu saved per device; adopt shadcn/ui as the component base (copied into `src/components/ui/`: Button, Badge, Input, Select, Sheet and Drawer for the side drawer and phone bottom sheet, Dialog for the receipt viewer, Table), themed with the slate tokens; last done, add service, odometer, and Minder code inputs open in a side drawer (bottom sheet on phone); service cards in a 2-column grid, most urgent first, with countdown and progress bar; home vehicle cards with bundled photos, ODO, overdue/soon chips, next due item; odometer and Minder pages fold into drawers; per-vehicle service history page (full list grouped by year: date, work done with service tags, shop, miles, cost; search and service filters; row expands to line items; receipt thumbnails open images in a viewer and PDFs in a new tab); whole app restyled. Design reference: `prototypes/`
- [ ] 9. **Bulk import** - upload many past receipts and confirm them from a quick-review list; historical Minder codes record history only

### Milestone 3 - Reminders

- [ ] 10. **Email reminders** - Resend weekly digest (Monday 8am Eastern, only when needed), next-morning overdue alert, stale-odometer nudge
