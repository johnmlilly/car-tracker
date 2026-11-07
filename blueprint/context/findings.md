# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] open - Coding standards still describe the backend as absent

**File:** blueprint/context/coding-standards.md:5
**Found:** 2026-11-07 by /audit (scope: current; lens: quality)
**Why it matters:** This feature lands the Hono Worker, D1, Drizzle migrations, `shared/api.ts`, and removes the template CSS, but the standards file still says the backend "is not installed yet" (line 5), keeps the Worker layout and API-client layout as TODOs (lines 40, 43), keeps the "no backend exists yet" Data and API Boundaries TODO (line 66), and still tells readers to remove `src/App.css` leftovers that are already gone. The standards file itself says to add backend conventions "when the first feature that uses it lands". Later features (2-9) will read stale guidance on where API types, migrations, and request validation live.
**Suggested fix:** Replace the TODOs with the conventions this feature established: `worker/index.ts` Hono app under `/api`, `worker/db/schema.ts` plus `npm run db:generate` and custom migrations for seed data, `shared/api.ts` for response types shared by client and Worker, the error shape, and drop the template-leftover note. Documentation only; no behavior is lost.
**Resolution:**
