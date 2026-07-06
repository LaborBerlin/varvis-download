---
name: splitting-oversized-files
description: Use when a js/ or tests/ file in varvis-download is near or over the 600-line architecture budget, when `npm run architecture:check` warns or blocks, when a task touches a file pinned in KNOWN_OVERSIZED_FILES, or when extracting a concern into a new CommonJS module or test file.
---

# Splitting oversized files

`npm run architecture:check` (`scripts/check-architecture-budget.mjs`) warns at
500 lines and blocks at 600 for any `.js/.cjs/.mjs/.ts` file. Files pinned in
`KNOWN_OVERSIZED_FILES` only warn ("split when touched") — touching one is an
implicit request to split it.

## Extract and rewire — never a facade

A split **moves code to a new module and repoints every consumer's `require()`
directly**. There are no re-export facades in `js/`; repo precedent (the
`refactor(cli|io|download|commands)` commit series) is consistently
rewire-and-delete.

Facade and rewire are **mutually exclusive**: a facade only works if consumers
keep the old path, so you cannot "rewire consumers but keep a facade for the
tests" — once a consumer requires the new path, a `jest.mock('old-path')`
intercepts nothing. Always full-rewire.

Two situations add mechanical work but are **not** reasons for a facade:

- **Module singleton** (like `metrics`): give it exactly one new home and
  repoint every `require` so Node's module cache keeps one instance. Functions
  that receive it as an **argument** need no change — grep both to size the
  blast radius.
- **Mocked by path in many tests**: every `jest.mock('.../old.cjs', …)` must be
  repointed. If one mock stubbed functions that now live in different modules,
  it **fans out into several `jest.mock` calls** — usually the biggest labor in
  the split.

## Recipe

**Confirm the target first.** Run `npm run architecture:check` and read which
file it flags — often a **test** file, not a source module. Don't split a file
that isn't flagged. Test files are first-class split targets: split by
`describe` block into dot-suffix siblings in the same directory
(`x.<concern>.test.js`), duplicating the whole header (requires, `jest.mock`
calls, `beforeEach`) into each shard — `jest.mock` is per-file and can't be
shared — then pruning requires the shard doesn't use. A test-only split is one
commit (`refactor(tests): split <file> by describe block`) and needs no
`js/README.md` update.

1. **Baseline.** Get `npm test -- --coverage` and `npm run architecture:check`
   green and note coverage you must not regress (thresholds 60/50/60/60 in
   `jest.config.cjs`). If the change is behaviour-observable (CLI `--help`,
   config merge, `--version`), capture a fixture under
   `tests/fixtures/cli-output/` first so the refactor is provably
   behaviour-preserving (precedent: `tests/unit/cli/configMerge-snapshot.test.js`).
2. **Cut the seam by cohesion, not line count.** Map exports to consumers
   (`rg -n "require\(.*<module>"`), then cluster functions that share private
   state or the same dependency. Put each cluster in a concern subdirectory —
   `js/cli/`, `js/commands/`, `js/download/`, `js/io/`, `js/net/` — with a
   `camelCase.cjs` name (enforced). Target < 300 lines per new file for
   headroom.
3. **Move code + its JSDoc together.** Exported functions without doc blocks
   fail lint. A file one directory deeper needs `import('./types')` →
   `import('../types')`. Keep `node:` protocol requires. See the
   `writing-typed-jsdoc` skill.
4. **Rewire every consumer**, including `varvis-download.cjs`. Both
   `require('.../x.cjs')` and the extensionless `require('.../x')` form
   coexist — grep for both.
5. **Mirror the tests** under `tests/unit/<subdir>/`. Never delete a passing
   test to make the split fit — move it. See the `testing-varvis-modules`
   skill.
6. **Update the trackers.** Remove the file's `KNOWN_OVERSIZED_FILES` entry
   once it drops below 600. Land the whole split in one PR so a blocked state
   never reaches `main`; add a temporary pin only if the split must span PRs.
   For source-module splits, update the module's section in `js/README.md`.
   Check that no new file (relocated tests included) crossed 600.
7. **One concern per commit** (source splits) — new module + its relocated
   test, passing the full gate. Message style:
   `refactor(<area>): extract <concern> to js/<path>`.

## Gotchas

| Gotcha                                                            | What to do                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/scripts/docs-generator.cjs` scans only top-level `js/*.cjs` | Modules in `js/<subdir>/` won't appear in generated API docs. Known gap — note it in the PR; don't scope-creep the generator.                            |
| lint-staged runs `eslint --fix` on staged `*.{js,cjs}`            | Don't bypass with `--no-verify`. Stage files explicitly; never sweep unrelated working-tree changes into a refactor commit.                              |
| Module singletons                                                 | Identity comes from Node's module cache. Every consumer must require the same new path, or the singleton splits in two.                                  |
| Thin entry point                                                  | `varvis-download.cjs` orchestrates only. Don't push domain logic back into it or couple argv parsing to domain modules — pass plain config objects down. |

## Verify (CI order)

```bash
npm run lint
npx prettier --check .
npm run type-check
npm test -- --coverage
npm run architecture:check           # target no longer flagged; no new >=500 warnings
node varvis-download.cjs --version   # module wiring resolves outside Jest
```
