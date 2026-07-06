# AGENTS.md

Shared repository instructions for Codex, Claude Code, Gemini CLI, Cursor, Copilot, and other coding agents. Keep this file concise and current; model-specific wrapper files (`CLAUDE.md`, `GEMINI.md`) import this file instead of duplicating project facts.

## Project Snapshot

`varvis-download` is a Node.js CLI for downloading BAM/BAI/VCF files from the Varvis genomics API. It handles authentication, filtering, archived-file restoration, ranged downloads with `samtools`/`tabix`/`bgzip`, and proxy configuration.

Primary stack:

- Node.js >= 22.22.2, npm >= 10
- CommonJS (`.cjs`) for runtime code; ES modules (`.mjs`) for scripts; `package.json` is `"type": "module"`
- TypeScript only for type-checking (`tsc --noEmit`); no transpile step
- Jest 30 for unit tests, Jest with `--runInBand` for integration tests
- ESLint 10 (flat config) with prettier, jsdoc, unicorn, security, no-secrets plugins
- VitePress for the docs site under `docs/`
- husky + lint-staged for pre-commit hooks
- `undici` for HTTP, `winston` for logging, `yargs` for CLI parsing

## First Steps

1. Read `README.md`, this file, and the files directly related to the task.
2. Run `git status --short` before editing. Do not overwrite uncommitted user work.
3. Prefer `rg` (ripgrep) and `rg --files` for search.
4. Use `npm`; do not introduce `pnpm`, `yarn`, or `bun` lockfiles.
5. Keep changes scoped. Do not modernise unrelated code while fixing a docs change or a single feature.

## Commands

Use the scripts in `package.json` as the primary interface:

- Install: `npm ci` (or `npm install` if updating deps)
- Lint: `npm run lint`
- Lint + fix: `npm run lint:fix`
- Format: `npm run format`
- Format check: `npx prettier --check .`
- Type-check: `npm run type-check`
- Unit tests: `npm test`
- Unit tests + coverage: `npm test -- --coverage`
- Integration tests (needs `VARVIS_PLAYGROUND_USER`/`VARVIS_PLAYGROUND_PASS`): `npm run test:integration`
- Architecture budget check (line limits, lockfile sanity): `npm run architecture:check`
- Docs dev server: `npm run docs:dev`
- Docs build: `npm run docs:build`

The local CI-equivalent gate is `npm run check`, which runs:

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

## Architecture Guardrails

- Entry point: `varvis-download.cjs` — CLI parsing, top-level orchestration. Treat as legacy oversized file (1051 LOC); split when touched.
- Domain modules: `js/*.cjs` — each module owns one concern (auth, fetch, range, archive, filter, prompts, restoration state, tool checks, URLs, files, logging, config, arrays, API client).
- Tests mirror module structure under `tests/unit/` and `tests/integration/`.
- Test helpers live in `tests/helpers/` (`testUtils.js`, `fixtures.js`, `mockFactories.js`).
- `tests/setup.js` runs before every Jest worker and cleans `${os.tmpdir()}/varvis-download-tests` after the suite.
- Docs source lives in `docs/`; generated API reference under `docs/api/`. Generator script: `docs/scripts/docs-generator.cjs` (also legacy oversized).
- Do not couple CLI argv parsing to domain modules — pass plain config objects.
- Do not invent new external tool dependencies beyond `samtools`, `tabix`, `bgzip` without discussion.

## Coding Conventions

- Follow existing CommonJS patterns in neighbouring files. `require()` + `module.exports`, not ESM `import`/`export`, in `js/` and `varvis-download.cjs`.
- **Maintain small files**: keep all source and test files **under 600 lines**. The architecture budget script warns at 500 and blocks new files at 600. Existing oversized files are listed in `scripts/check-architecture-budget.mjs` as `KNOWN_OVERSIZED_FILES`; if your change touches one, split it as part of the work.
- Use `node:` protocol for built-in module imports (`require('node:fs')`, not `require('fs')`). Enforced by `unicorn/prefer-node-protocol`.
- Filenames are `camelCase.cjs` (enforced). Exceptions are listed in `eslint.config.js` (`unicorn/filename-case`).
- JSDoc is required on exported functions, classes, and methods in `js/**/*.cjs` and root `*.cjs`. Tests and `docs/scripts/` are exempt.
- Never commit secrets, real credentials, or raw Varvis API payloads. Use redacted fixtures.
- Keep comments sparse. Prefer readable code over explanatory comments. The exception is a non-obvious _why_ (workaround, hidden constraint, surprising invariant).

## Testing Expectations

- **Verify before completion**: never claim a task is done without running the relevant Jest tests.
- For behaviour changes, add or update focused unit tests near the changed module.
- For multi-module flows, add an integration test under `tests/integration/`.
- E2E download tests live under `tests/integration/e2e/` and need playground credentials; they only run on `main` PRs.
- Coverage thresholds are enforced by Jest config (currently 60/50/60/60 global).
- Run `npm test -- --testPathPatterns=<name>` (Jest 30 renamed `--testPathPattern` → `--testPathPatterns`) for focused runs.
- For docs-only changes, run at least `npx prettier --check` on the touched Markdown files.

## Agentic Workflow

Follow a "Think-Plan-Act-Verify" cycle:

1. **Think & Research**: explore the codebase and requirements before proposing changes.
2. **Plan**: for non-trivial changes, write a short plan first. Break complex tasks into small, verifiable steps.
3. **Act**: implement incrementally. Maintain modularity. Favour deterministic code over clever abstractions.
4. **Refactor as you go**: if a task touches an oversized file (> 600 lines or in `KNOWN_OVERSIZED_FILES`), prioritise splitting it as part of the work.
5. **Verify**: run `npm run lint`, `npm run type-check`, `npm test`, `npm run architecture:check` before claiming done.

- Use Superpowers Skills when they match the task. Start sessions by loading `superpowers:using-superpowers`.
- Default to feature branches and PRs for substantial work. Direct commits to `main` are acceptable for small docs, fixes, or instruction updates after the local gate has passed.
- Commits use short conventional-ish prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`.
- Keep agent manifests short. Put durable project facts in `AGENTS.md`; put tool-specific loading notes only in `CLAUDE.md` or `GEMINI.md`.

## Project Skills

Repo-specific skills live in `.claude/skills/` (Claude Code auto-loads them by
description; invoke directly with `/<name>`). They encode this repo's conventions
so you don't rediscover them each time:

- **`splitting-oversized-files`** — the 600-line budget workflow: find the flagged
  file, cut the seam by cohesion, rewire consumers (no facades), mirror tests,
  update `KNOWN_OVERSIZED_FILES`.
- **`testing-varvis-modules`** — Jest patterns: mock-factory catalog, mocking
  `child_process` and the network, fake-timer cleanup, and the single-file
  `--coverage` threshold trap.
- **`writing-typed-jsdoc`** — JSDoc that satisfies both `tsc --noEmit` strict and
  eslint-plugin-jsdoc: the `import('./types')` idiom, `js/shims/`, error-vs-warn
  rules, and strict `unknown`/null body idioms.

## Boundaries

- **Never** run `git push --force` to `main` or `git reset --hard` against uncommitted work without explicit instruction.
- **Never** bypass hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly asked.
- **Never** delete a failing test to make CI green. Fix the underlying issue or report it.
- **Never** weaken the JSDoc, security, or no-secrets ESLint rules to silence a violation; refactor the code instead.
- **Never** add new external CLI tool dependencies (beyond samtools/tabix/bgzip) without discussion.
- **Ask first** before deleting files outside the task scope, before changing CI workflows, or before introducing a new top-level dependency.

## Tool Compatibility Notes

- Codex reads `AGENTS.md` as its project instruction manifest directly.
- Claude Code reads `CLAUDE.md`; this repo's `CLAUDE.md` imports `AGENTS.md` via `@AGENTS.md`.
- Gemini CLI reads `GEMINI.md`; this repo's `GEMINI.md` imports `AGENTS.md` via `@AGENTS.md`.
- Cursor and GitHub Copilot read `AGENTS.md` natively.
- If a model appears to ignore these instructions, ask it to refresh or show its loaded project memory before editing files.
