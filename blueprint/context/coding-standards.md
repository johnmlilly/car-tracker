# Coding Standards

> Tuned by `/onboard` for the current scaffold: React + TypeScript + Vite, npm.
> The planned backend (Hono on Cloudflare Workers, D1 + Drizzle, R2, Cloudflare
> Access, Workers AI) is not installed yet. Add its conventions when the first
> feature that uses it lands, rather than guessing them now.

## Stack

- Client: React 19 SPA built with Vite 8, client-side rendering only. Planned
  as a PWA.
- Language: TypeScript 6 (`tsconfig.app.json` for `src/`, `tsconfig.node.json`
  for Vite config).
- Package manager: npm. Commit `package-lock.json`; don't mix in other managers.
- Lint: ESLint flat config (`eslint.config.js`) with typescript-eslint,
  react-hooks, and react-refresh.

## TypeScript

- `tsconfig.app.json` does not enable `strict` yet.
  > TODO: decide whether to turn on `"strict": true` before feature work starts.
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
- Static assets imported by code: `src/assets/`; files served as-is: `public/`.
  > TODO: no component, routing, or API-client layout exists yet. Establish it
  > with the first real feature (for example `src/components/`, `src/lib/`,
  > `src/types/`) and record it here.
- Server code (planned Worker) layout: > TODO when the backend is added.

## Naming

- Components: PascalCase (`ServiceRecordForm.tsx`)
- Functions and variables: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase, no prefix

## Styling

- Plain CSS today: global styles in `src/index.css`, component styles in
  `src/App.css`. No CSS framework or component library is installed.
  > TODO: confirm whether to stay with plain CSS or adopt a framework.
- No inline styles except for truly dynamic values.
- Layouts must work on a phone (receipt capture is a mobile flow).

## Data and API Boundaries

> TODO: no backend exists yet. Per the draft plan in
> `blueprint/context/car-tracker-PLAN.md`, the client will call a Hono API on
> Cloudflare Workers backed by D1 (Drizzle) and R2. When that lands, define here:
> the API client location, migration workflow, and where request validation lives.

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

Stack binding: no runner is installed. For this Vite + TypeScript project the
natural choice is Vitest, with `vi.mock()` for external dependencies and
`vi.useFakeTimers()` for time-dependent logic such as due-date calculations.
Add it with `/tests`.

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
