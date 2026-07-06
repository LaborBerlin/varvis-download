---
name: splitting-oversized-files
description: Use when a js/ or tests/ file in varvis-download is near or over the 600-line architecture budget, when `npm run architecture:check` warns or blocks, or when extracting a concern into a new CommonJS module. Covers where to cut the seam, how to rewire consumers, mirroring tests, and updating KNOWN_OVERSIZED_FILES.
---

# Splitting oversized files

This repo enforces a per-file line budget (`scripts/check-architecture-budget.mjs`,
run via `npm run architecture:check`):

- **warn at 500 lines**, **block at 600 lines** for any `.js/.cjs/.mjs/.ts` file.
- Files pinned in `KNOWN_OVERSIZED_FILES` only warn ("split when touched").
- Touching a pinned file is an implicit request to split it.

The whole recent git history is these splits (`refactor(cli):`, `refactor(io):`,
`refactor(download):`, `refactor(commands):`). Follow the established pattern
below — it is not the generic "extract a module" advice.

## The established pattern: extract and rewire (never a facade)

This repo controls every consumer of its modules, so a split **moves code to a
new module and repoints each consumer's `require()` at it directly**. There are
**no re-export facades** in `js/`, and repo precedent (the
`refactor(cli|io|download|commands)` series; `8ed7832` deleted the old CLI shim)
is consistently rewire-and-delete. Do not add a facade.

Facade and rewire are **mutually exclusive**: a facade only works if consumers
keep the old path, so you cannot "rewire consumers but keep a facade for the
tests" — the moment a consumer requires the new path, a `jest.mock('old-path')`
intercepts nothing. It is always full-rewire.

Two situations add *mechanical work* to the rewire but are **not** reasons to
keep a facade:

- **Module singleton** (like `metrics`): give it exactly one new home and repoint
  every `require` of it so Node's module cache keeps one instance. Separate the
  requirers (repoint) from functions that receive it as an **argument** (no
  change) — grep both to size the blast radius.
- **Mocked by path in many tests**: every `jest.mock('.../old.cjs', …)` must be
  repointed. If one mock stubbed functions that now live in different modules, it
  **fans out into several `jest.mock` calls** — usually the biggest labor in the
  split.

## Recipe

**First, confirm the target.** Run `npm run architecture:check` and read *which*
file it flags — it's often a **test** file (e.g. `tests/unit/*.new.test.js`), not a
source module. Test files are first-class split targets: split them the same way,
by `describe` block, under the mirrored path. Don't split a source file that isn't
the one flagged.

1. **Baseline before touching code.** Run the full gate green and record coverage
   numbers you must not regress (thresholds 60/50/60/60 live in `jest.config.cjs`):
   ```bash
   npm test -- --coverage
   npm run architecture:check
   ```
   If the change is behaviour-observable (CLI `--help`, config merge, `--version`),
   capture/refresh a baseline fixture under `tests/fixtures/cli-output/` first so
   the refactor is provably behaviour-preserving (precedent: commit `765d99c`,
   and `tests/unit/cli/configMerge-snapshot.test.js`).

2. **Cut the seam by cohesion, not by line count.** Map exports to consumers
   (`rg -n "require\(.*<module>"`), then cluster functions that share private
   state or the same dependency. Put each cluster in a concern subdirectory —
   `js/cli/`, `js/commands/`, `js/download/`, `js/io/`, `js/net/` — with a
   `camelCase.cjs` name (enforced by `unicorn/filename-case`). Target < 300 lines
   per new file for headroom.

3. **Move code + its JSDoc together.** `jsdoc/require-jsdoc` errors on any
   exported function in `js/**/*.cjs` without a doc block. When a file moves one
   directory deeper, fix relative type imports: `import('./types')` →
   `import('../types')`. Keep `node:` protocol requires. See the
   `writing-typed-jsdoc` skill for the doc/type conventions.

4. **Rewire every consumer** to `require()` the new path. Grep to be exhaustive;
   include `varvis-download.cjs`. Both `require('.../fetchUtils.cjs')` and the
   extensionless `require('.../fetchUtils')` form coexist — match both.

5. **Mirror the tests.** Relocate the moved code's unit tests to mirror the new
   module path under `tests/unit/<subdir>/`. Never delete a passing test to make
   the split fit — move it. See the `testing-varvis-modules` skill.

6. **Update the trackers.**
   - `KNOWN_OVERSIZED_FILES` in `scripts/check-architecture-budget.mjs`: **remove**
     the entry once a pinned file drops below 600 (precedent: `8ed7832` removed
     the `varvis-download.cjs` exception). Land the whole split in **one PR** so
     the blocked state never reaches `main`; only add a *temporary* pin if the
     split must span multiple PRs.
   - Update the module's section in `js/README.md`.
   - Verify no new file (including relocated test files) crossed 600.

7. **One concern per commit.** Each commit = new module + its relocated test,
   passing the full gate. Message style: `refactor(<area>): extract <concern> to js/<path>`.

## Gotchas

| Gotcha | What to do |
|--------|------------|
| `docs/scripts/docs-generator.cjs` only scans **top-level** `js/*.cjs` | Modules in `js/<subdir>/` won't appear in generated API docs. Known gap — don't scope-creep the (already oversized) generator; note it in the PR. |
| Husky/lint-staged runs `eslint --fix` on staged `*.{js,cjs}` | Don't bypass with `--no-verify`. Stage files explicitly; never sweep unrelated working-tree changes into a refactor commit. |
| `metrics` and other module singletons | Object identity comes from Node's module cache. If you split a singleton out, every consumer must require the same new path, or the singleton splits in two. |
| Keeping the entry point thin | `varvis-download.cjs` orchestrates only. Don't push domain logic back up into it, and don't couple argv parsing to domain modules — pass plain config objects down. |

## Verify (in CI order — see `.github/workflows/codequality.yaml`)

```bash
npm run lint
npx prettier --check .
npm run type-check
npm test -- --coverage
npm run architecture:check     # target file gone from blocking, no new >=500 warnings
node varvis-download.cjs --version   # smoke test that module wiring resolves outside Jest
```
