# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point. Codex, Google Antigravity, and OpenCode read `AGENTS.md`. Other
compatible tools do too. Claude Code reads `CLAUDE.md`, which imports this file,
so there is a single source of truth.

Claude Code, Codex, and every other AI tool must not add AI attribution to
commits or pull requests, including AI `Co-Authored-By` trailers or generated-by
signatures. Preserve genuine human attribution. See
[Commit and PR attribution](blueprint/context/ai-interaction.md#commit-and-pr-attribution)
for optional tool settings.

## What this is

car-tracker: a personal PWA for tracking maintenance on a 2024 Honda Odyssey and a
2019 Toyota Corolla. Logs service records and odometer readings, extracts data
from receipt photos, and shows what is coming due.

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. To start a new project, scaffold the app first in an empty folder
(create-next-app, Vite, etc.), then overlay these files on top. Never run a
framework scaffolder inside a directory that already holds the blueprint files
(`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`); it fails
because the directory isn't empty.

The workflow is defined by the local skills and context files below.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.
- Stack-specific template standards apply only when the project uses that stack.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/workflow.md` - workflow reference for configuration, skills, dashboard activity, and checks
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built in this checkout

Reuse relevant context already loaded in the session. Claude Code imports only
this file; its Blueprint skills load the other files on demand.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. The feature
loop is `/feature` -> `/implement` -> `/check` -> `/audit current` ->
`/complete`; approve the Feature spec before Implement. Each command is a local
skill at `.agents/skills/<skill>/SKILL.md` or `.claude/skills/<skill>/SKILL.md`
that carries its own instructions. Claude Code and Google Antigravity use slash
commands such as `/feature`, Codex uses `$feature`, and other tools can follow
the matching `SKILL.md` when asked.

Skills: `adopt`, `audit`, `blueprint-doctor`, `blueprint-status`, `brief`,
`check`, `ci`, `complete`, `debug`, `discovery`, `explore`, `feature`, `fix`,
`implement`, `onboard`, `overview`, `prototype`, `release`, `rollback`, and
`tests`, plus the explicit-only `autopilot` and `continuous`.

- Keep one active work item per checkout. Parallel work needs its own clone or
  Git worktree and branch; never replace another worker's active spec.
- `blueprint/config.json` can make review or verification stricter and tune
  local workflow settings. It never grants permission to commit, merge, push,
  deploy, publish, send, delete data, waive a failing check, or accept a finding.
- Never create or edit `blueprint/.state/run.json` directly. Tracked skills
  record dashboard activity through the managed helper.

## Commands

Package manager: npm (`package-lock.json`).

- Dev server: `npm run dev` (Vite with the Worker and local D1, http://localhost:5173)
- Build: `npm run build` (runs `tsc -b` typecheck, then builds the client and Worker into `dist/`)
- Preview built app: `npm run preview`
- Lint: `npm run lint` (ESLint)
- Test: `npm test` (Vitest, runs once; fails if no tests are found)
- Test watch: `npm run test:watch`
- Generate a migration from `worker/db/schema.ts`: `npm run db:generate`
- Apply migrations to local D1: `npm run db:migrate:local` (run once before first `npm run dev`)
- Apply migrations to remote D1: `npm run db:migrate:remote`
- Regenerate Worker types after editing `wrangler.jsonc`: `npm run cf-typegen`
- Deploy: `npm run deploy`

Tests are a gate for logic-bearing steps (see `coding-standards.md`). No
standalone typecheck or Verify command exists; `npm run build` includes the
typecheck.

### First deploy (manual)

1. `npx wrangler login`
2. `npx wrangler d1 create car-tracker`, then copy the printed `database_id` into
   `wrangler.jsonc` (replacing the all-zero placeholder).
3. `npm run db:migrate:remote`
4. `npm run deploy`
5. In the Cloudflare dashboard, enable Cloudflare Access for the Worker's
   `workers.dev` route and restrict it to your own email. Keep the app behind
   Access; it has no in-app login.

Testing is opt-in. If this project does not already have a unit test runner, run
`/tests` or `$tests` to add one and update this section with the real test
commands.

Browser testing is also opt-in. Run `/tests browser` or `$tests browser` to add
or normalize a browser harness and document its exact command as `Browser
tests`. Check and Continuous Mode can then reuse it without installing tooling
mid-feature.
