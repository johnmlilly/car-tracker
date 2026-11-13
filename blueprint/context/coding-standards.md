# Coding Standards

> Tuned by `/onboard` and updated as features land. Installed: React + TypeScript
> + Vite client, Hono API on Cloudflare Workers, D1 + Drizzle, Cloudflare Access.
> Planned but not added: R2, receipt extraction, Resend, and Cron Triggers. Add
> their conventions when the first feature that uses them lands.

## Stack

- Client: React 19 SPA built with Vite 8, client-side rendering only. Planned
  as a PWA.
- API: Hono on Cloudflare Workers; the same Worker serves the built client.
- Database: Cloudflare D1 through Drizzle ORM.
- Language: TypeScript 6 (`tsconfig.app.json` for `src/`, `tsconfig.node.json`
  for Vite config).
- Package manager: npm. Commit `package-lock.json`; don't mix in other managers.
- Lint: ESLint flat config (`eslint.config.js`) with typescript-eslint,
  react-hooks, and react-refresh.

## TypeScript

- Strict mode is on (`"strict": true` in `tsconfig.app.json` and
  `tsconfig.node.json`).
- `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, and
  `verbatimModuleSyntax` are on: use `import type` for type-only imports and
  avoid `enum` and parameter properties.
- No `any`; use proper types or `unknown`.
- Type props, API payloads, and data models explicitly; rely on inference where
  obvious.

## React

- Functional components and hooks only.
- One job per component; extract reusable logic into custom hooks.
- Keep files that export components exporting only components (react-refresh
  lint rule) so HMR works.

## File Organization

- Entry: `src/main.tsx`, root component `src/App.tsx`.
- Files served as-is: `public/`. Static assets imported by code go in a new
  `src/assets/` folder, created with the first such asset.
- Client: flat `src/`, one component per file (`HomePage.tsx`,
  `OdometerForm.tsx`). `src/api.ts` holds `apiRequest` and the `useApi` hook,
  `src/route.ts` the history-API router (`matchRoute`, `navigate`,
  `usePathname`), `src/format.ts` display formatting, and `src/styles.ts`
  Tailwind class strings shared by forms.
- Worker: `worker/index.ts` is the Hono app under `/api`. Request validation
  lives in pure functions beside it (`worker/baseline.ts`,
  `worker/odometer.ts`); the schema is `worker/db/schema.ts`.
- Shared: `shared/` holds code used by both the client and the Worker:
  response types in `shared/api.ts`, pure scheduling and mileage logic
  (`shared/schedule.ts`, `shared/mileage.ts`), and formatters whose output
  must match on both sides (`shared/format.ts`).

## Naming

- Components: PascalCase (`ServiceRecordForm.tsx`)
- Functions and variables: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase, no prefix

## Styling

- Tailwind CSS v4 via the `@tailwindcss/vite` plugin. CSS-first config: put
  theme tokens in `@theme` in `src/index.css`; there is no `tailwind.config.js`.
- Style with utility classes. Write custom CSS only for what utilities can't
  express cleanly.
- No component library is installed yet; build small components in React.
  Feature 8 adds shadcn/ui in `src/components/ui/` and updates this rule.
- No inline styles except for truly dynamic values.
- Mobile-first: layouts must work on a phone (receipt capture is a mobile flow).

## Data and API Boundaries

- The client calls the API only through `apiRequest` / `useApi` in
  `src/api.ts`. Types for request and response bodies live in `shared/api.ts`.
- Validate every request body on the server in a pure `parse*Input(body, today)`
  function that returns `{ ok, value }` or `{ ok: false, fields }`, with unit
  tests. Client checks are for fast feedback only.
- Errors use the `ErrorResponse` shape: 400 `{ error: { message, fields } }`
  with per-field messages, 404 for an invalid or unknown id (ids are parsed
  with the strict `parseId`), and a generic 500 from `app.onError`.
- Migrations: edit `worker/db/schema.ts`, run `npm run db:generate`, and apply
  with `npm run db:migrate:local`. Seed data goes in custom migrations. Apply
  remote migrations (`npm run db:migrate:remote`) before deploying code that
  depends on them.
- Local D1 state is stored per `database_id`. After changing the id in
  `wrangler.jsonc`, run `npm run db:migrate:local` again or local requests fail
  with a 500.
- "Today" is computed on the server in `America/New_York` (`todayInEastern`).
  Dates are `YYYY-MM-DD` strings and mileage is integer miles.

- Treat receipt uploads and AI extraction output as untrusted: validate on the
  server before writing records, and require user confirmation before extracted
  data becomes service records.

## Error Handling

- Surface failed requests and uploads to the user with a clear message; never
  fail silently.
- Don't swallow errors in empty `catch` blocks.

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding: Vitest (`vitest.config.ts`, separate from `vite.config.ts` so tests
run in plain Node without the Cloudflare plugin). Test files live next to source
under `src/`, `worker/`, or `shared/` as `*.test.ts(x)`. Test Worker routes through
`app.request(path, init, env)` with a stub `env`, as in `worker/index.test.ts`;
keep due-date and status math in pure functions so it can be tested without D1.
Use `vi.mock()` for external dependencies and `vi.useFakeTimers()` for
time-dependent logic such as due-date calculations.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Browser automation is separately opt-in through `/tests browser`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
