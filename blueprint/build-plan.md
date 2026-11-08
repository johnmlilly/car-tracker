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

- [ ] 6. **Receipt upload** - camera or file capture, client-side resize, stored in R2
- [ ] 7. **Receipt reading and review** - `extractReceipt()` with Haiku 5.5, keyword mapping to services, side-by-side review, Minder code mismatch flag
- [ ] 8. **Bulk import** - upload many past receipts and confirm them from a quick-review list; historical Minder codes record history only

### Milestone 3 - Reminders

- [ ] 9. **Email reminders** - Resend weekly digest (Monday 8am Eastern, only when needed), next-morning overdue alert, stale-odometer nudge
