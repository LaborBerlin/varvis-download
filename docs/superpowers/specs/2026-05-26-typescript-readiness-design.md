---
title: TypeScript-Readiness Preparation
status: Proposed (rev 3)
date: 2026-05-26
revised: 2026-05-26
author: bernt.popp@charite.de
produces-adr: docs/adr/0001-defer-typescript-conversion.md
---

# TypeScript-Readiness Preparation

## Revision History

- **rev 1 (2026-05-26):** initial draft after brainstorming.
- **rev 2 (2026-05-26):** Codex review-driven revisions. Phases A and B reordered (types.d.ts must land before strict flags because 200 of 339 strict errors are TS2339 "Property does not exist", which `@param {object}` weasel-types produce). Added per-file vs command-level error tiers. Fixed `RestoreMode` to include `'none'`. Loosened leaf-import rule to allow npm deps. Reworked baseline fixtures (non-deterministic `--version`/`--list` swapped for `--help` + programmatic configMerge snapshots). Fixed ADR circular reference. Added `cli/args.cjs` test. Corrected counts (process.exit 14 → 13, tests 24 → 19, JSDoc 206 → ~226).
- **rev 3 (2026-05-26):** Second Codex review pass. LOC goal corrected to 600 (was conflated 200/600). Phase A retagging step made explicit (types alone don't fix TS2339; the `@param {object}` sites must be retagged to imported types). Tier 3 refined to distinguish ranged/full-download body failures (recoverable) from URL-refresh/index-acquisition failures (fatal, matching today). Yargs added as a known termination site with mitigation. Circular `fetchUtils ↔ archiveUtils` requires called out — C5 breaks the cycle. Credential precedence contract defined (env → argv/config → prompt, validate last). Prettier formatting applied.

## Context

`varvis-download` is described as a JavaScript project, but TypeScript is already part of the toolchain: `tsconfig.json` runs in `checkJs` / `noEmit` mode against JSDoc-annotated `.cjs` files, and `npm run type-check` gates every PR via `.github/workflows/test.yml`. The codebase has ~226 typed JSDoc annotations (`@param`/`@returns`/`@type`/`@typedef`/`@property`) across 14 source modules.

This spec **produces** an accompanying ADR (`docs/adr/0001-defer-typescript-conversion.md`, written in Phase D) capturing the higher-order decision that a full `.cjs` → `.ts` migration is **not justified today**: the marginal benefit is small relative to the cost (build step, transformer churn, ongoing tsgo maturation), and the project already captures most of TypeScript's value through JSDoc + `tsc --noEmit`. The ADR does not exist before this spec is executed; do not cite it as prior art.

Three structural issues currently make a future conversion expensive:

1. `tsconfig.json` runs with `strict: false`. JSDoc-typed code can drift in ways strict mode would catch (null/undefined narrowing, implicit any). A trial run of `npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns` currently reports **339 error lines** — dominated by TS2339 (200) "Property does not exist on type", which originates from `@param {object}` parameters.
2. Domain types are inlined as `@param {object}` weasel-types in many modules. Generics and discriminated unions are awkward in JSDoc.
3. `varvis-download.cjs` is 1051 LOC with a 580-line `main()` that mixes CLI parsing, HTTP setup, three distinct commands (`list`, `resume`, full download), region parsing, and **13 `process.exit()` calls**.

This spec captures the work needed to remove those three blockers without converting any file to `.ts`. The goal is to deliver immediate value (strict checking, smaller files) while ensuring a later TS conversion is mechanical rather than archaeological.

## Decision

Do four pieces of preparation work, in this order (the order matters — see "Phase ordering rationale" below):

- **A — Domain types.** Create `js/types.d.ts` with shared domain types. Update `tsconfig.json` `include` to add `js/**/*.d.ts`. Add ambient declaration shims for untyped npm deps (`mute-stream`, `progress`). Reference the types from existing JSDoc via `import('./types').TypeName` (or `../types` from subdirs once the split lands).
- **B — Strict tsconfig.** Enable `strict`, `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`; fix surfaced errors in JSDoc. With Phase A's types in place, the TS2339 family (200 of 339 initial errors) is expected to evaporate; remaining work is genuine strictness cleanup (~100–150 errors).
- **C — Entry split.** Break `varvis-download.cjs` (1051 LOC) into a thin entry (~80 LOC) plus 15 focused modules under `js/cli/`, `js/net/`, `js/io/`, `js/download/`, `js/commands/`, `js/errors.cjs`, and a shared `js/download/commonDownload.cjs` helper. Some duplication between BAM and VCF download paths is **extracted and deduplicated**, not preserved verbatim — see "Phase C extraction rule" below.
- **D — ADR.** Write `docs/adr/0001-defer-typescript-conversion.md` capturing the deferral decision, the migration recipe to use when a future trigger fires, and the explicit list of conditions that should re-open the conversation.

Each piece is independently mergeable but delivered together on a single long-lived branch.

### Phase ordering rationale

Phase A (types) must precede Phase B (strict flags) because the trial-run strict-error breakdown is dominated by TS2339 ("Property does not exist on type") at 200 of 339 errors. These come from `@param {object}` declarations — fixing them requires the very types Phase A creates. Running Phase B first would surface a noise cliff that can only be cleared by retroactively doing Phase A. Reverse order avoids the rework.

## Goals

- All of `tsconfig.json`'s strict flags turn on without regressing CI.
- **No source file exceeds 600 LOC** after the split. This matches the existing `NEW_FILE_HARD_THRESHOLD` in `scripts/check-architecture-budget.mjs`. Existing modules (`archiveUtils.cjs` 464, `rangedUtils.cjs` 452, `fetchUtils.cjs` 415) are under 600 and stay untouched.
- New/extracted modules target ≤200 LOC each (soft goal; hard limit is 600).
- `varvis-download.cjs` is removed from `KNOWN_OVERSIZED_FILES` in `scripts/check-architecture-budget.mjs`.
- Every new module has a focused unit test.
- A future contributor can run `find js -name '*.cjs' -exec mv {} {}.ts \;` (notional) and have a mechanical, days-long migration instead of weeks.
- A clear ADR documents the decision so the next agent or contributor doesn't relitigate it.

## Non-Goals

- No file gets renamed to `.ts`.
- `@swc/jest` is **not** added. Jest 30 continues to run `.js` directly.
- `tests/integration/archive.test.js` (818 LOC) and `tests/unit/rangedUtils.enhanced.test.js` (648 LOC) stay in `KNOWN_OVERSIZED_FILES`. They are out of scope.
- `docs/scripts/docs-generator.cjs` stays in `KNOWN_OVERSIZED_FILES`. Out of scope.
- No new external runtime dependencies.
- No CLI behavior changes are observable to users beyond (a) consolidated error-log formatting and (b) the credential-precedence fix that makes env vars and the password prompt work as the README already documents (see "Credential Precedence Contract" below). Exit codes remain identical for all valid input combinations.
- No documentation rewrites beyond the new ADR.

## Branch Strategy

This is the central organizing constraint: **all work happens on a single long-lived branch, never directly on `main`.**

### Branch

- Name: `refactor/typescript-readiness`
- Base: `main`
- Lifetime: ~6–10 calendar weeks (7.25–10.75 dev-days spread across the calendar)
- Final integration: one PR against `main`, **merge commit** (not squash) so phase history survives.

### Workflow inside the branch

The 9 phases (A, B, C1–C6, D) are committed sequentially to the branch. Each phase commit message follows the existing convention (`refactor:`, `chore:`, `docs:` etc.).

Two sub-options for review granularity — pick at branch creation, don't mix:

1. **Linear commits, single final PR.** Each phase = one or more commits directly on `refactor/typescript-readiness`. Final PR review covers the cumulative diff. Best for solo work.
2. **Phase sub-branches → feature-branch PRs.** Each phase done on a `refactor/typescript-readiness/phase-c1-cli-extract`-style sub-branch, PR'd into `refactor/typescript-readiness` for review. Final PR to `main` covers integration. Best if a second reviewer is in the loop.

Default is **option 1**. Switching to option 2 mid-flight is not allowed.

### CI on the branch

`.github/workflows/test.yml` triggers on `push: branches: [main, develop]` and `pull_request: branches: [main, develop]`. Pushes to `refactor/typescript-readiness` do **not** trigger CI on their own.

Mitigation: **open the main-bound PR in draft on day one**, before any code is pushed. Every subsequent push to the branch triggers CI via the PR. Convert from draft to ready only when the branch is complete.

### Keeping current with main

- Rebase, not merge, when pulling `main` into the branch — keeps the phase commit history linear.
- Rebase cadence: at least weekly, or whenever a `main` commit touches a file the branch also touches.
- If `main` lands a commit that conflicts heavily, stop and resolve immediately rather than letting conflicts compound.

### Pre-merge gate

Before flipping the PR from draft to ready:

```bash
npm run lint && \
  npx prettier --check . && \
  npm run type-check && \
  npm test && \
  npm run architecture:check
```

All must pass. `npm run architecture:check` must show **zero** entries from this PR's new modules in any oversized list, and `varvis-download.cjs` must be removed from `KNOWN_OVERSIZED_FILES`.

### Rollback

If the work is abandoned mid-flight, the branch is simply deleted; `main` is untouched. Individual phases are reversible by `git revert` of the phase commit(s) on the branch.

## Architecture: Target Structure

```
varvis-download.cjs                    ~80 LOC  thin entry: parse → dispatch
js/
  cli/
    args.cjs                          ~170 LOC  yargs schema
    configMerge.cjs                    ~90 LOC  config + argv merge + validation
    versionInfo.cjs                    ~25 LOC  --version handler
  net/
    httpAgent.cjs                      ~40 LOC  proxy + cookie agent factory
  io/
    passwordPrompt.cjs                 ~35 LOC  mute-stream readline prompt
    urlListing.cjs                     ~35 LOC  handleUrlListing
    regionParsing.cjs                  ~70 LOC  CLI/BED region → temp BED file
  download/
    urlRefresh.cjs                     ~85 LOC  getValidDownloadUrl
    commonDownload.cjs                 ~50 LOC  shared full-download + optional-index helper
    bamHandler.cjs                    ~180 LOC  BAM ranged/unmapped/full (uses commonDownload)
    vcfHandler.cjs                    ~125 LOC  VCF ranged/full (uses commonDownload)
  commands/
    list.cjs                           ~45 LOC  listAvailableFiles loop
    resume.cjs                         ~60 LOC  archive resumption mode
    download.cjs                      ~150 LOC  main download orchestration
  errors.cjs                           ~40 LOC  ConfigurationError, OperationalError
  types.d.ts                           ~70 LOC  shared domain type declarations
  shims/
    mute-stream.d.ts                   ~12 LOC  ambient declaration
    progress.d.ts                      ~12 LOC  ambient declaration
  ...existing js/*.cjs unchanged
```

Total source: ~3,850 LOC across 30 `.cjs` files (14 existing in `js/`, 15 newly created in the split — including `js/errors.cjs` and `download/commonDownload.cjs`, 1 entry) plus `js/types.d.ts` and 2 shim declarations. New modules target ≤200 LOC; the architecture budget enforces ≤600 LOC hard. The 1051-LOC entry becomes ~80.

## Architecture Principles

- **Plain-config dependency injection.** Each command receives `(config, deps)` where `deps = { logger, agent, authService, rl, metrics }`. No module-scope mutable state. This completes a pattern AGENTS.md already requires but the current entry violates.
- **Layered imports (no back-edges).**
  - `commands/` may import `download/`, `io/`, `net/`, `cli/configMerge`, existing `js/*.cjs`, and any npm dep.
  - `download/` may import `io/`, existing `js/*.cjs`, and any npm dep.
  - `cli/`, `io/`, `net/` are leaves: may import Node built-ins, npm deps (e.g. `undici`, `tough-cookie`, `http-cookie-agent/undici`, `mute-stream`, `progress`, `yargs`), and existing `js/*.cjs` domain modules. They may **not** import from `cli/` (peers), `commands/`, or `download/`.
  - Enforced informally during review; enforced mechanically only if friction shows up (no new ESLint rule added in this spec).
- **Single termination site, with yargs caveat.** Only `varvis-download.cjs` and `yargs` call `process.exit()`. Yargs exits the process on `--help`, `--version` (when yargs's built-in handler is enabled), parse errors, and unrecognized flags. We accept yargs as a known external termination site rather than fight it. To keep test code from terminating the runner, `cli/args.cjs` exposes a `buildParser()` factory that callers can configure with `.exitProcess(false)` in tests. In production, yargs's default exit behavior is preserved (so `--help` still exits 0 as users expect). All _our_ code paths throw `ConfigurationError` / `OperationalError` and let the entry catch handle exit. Logging via `winston` is unaffected — that side effect remains everywhere. See "Error handling change" below.
- **No new dependencies.** All splits are pure reorganizations of existing code.

## Domain Types (Phase A)

### `js/types.d.ts`

Contains, at minimum:

```ts
export interface AnalysisFile {
  fileName: string;
  downloadLink?: string;
  analysisId?: string;
  // ...mirrors what apiClient/fetchUtils currently produce
}

export type FileDict = Record<string, AnalysisFile>;

// 'none' is intentional: list mode (js/fetchUtils.cjs:298-308) passes 'none'
// to bypass restoration logic entirely. 'no' is a user-facing CLI value that
// explicitly declines restoration with logging. Different semantics; both kept.
export type RestoreMode = 'no' | 'none' | 'ask' | 'all' | 'force';

export interface FinalConfig {
  username: string;
  password?: string;
  target: string;
  analysisIds: string[];
  sampleIds: string[];
  limsIds: string[];
  filetypes: string[];
  destination: string;
  filters: string[];
  // ... full list lifted from configMerge output
}

export interface Metrics {
  startTime: number;
  totalFilesDownloaded: number;
  totalFilesSkipped: number;
  totalBytesDownloaded: number;
  downloadSpeeds: number[];
}

export interface RestorationOptions {
  destination: string;
  overwrite: boolean;
  range: string | null;
  bed: string | null;
  unmapped: boolean;
  restorationFile: string;
  filetypes: string[];
}

export interface RangedDownloadDeps {
  logger: import('winston').Logger;
  metrics: Metrics;
}

// Runtime classes — implemented in js/errors.cjs (created in Phase C5).
// Declared here so JSDoc can reference them in pure-type contexts.
export class ConfigurationError extends Error {
  readonly exitCode: 1;
}
export class OperationalError extends Error {
  readonly exitCode: number;
}
```

Existing `.cjs` files reference these via `@type {import('./types').FileDict}` (or `import('../types').FileDict` from subdirs). No file is renamed.

### `tsconfig.json` update

The current `include` (`tsconfig.json:26`) is `["js/**/*.cjs", "*.cjs"]`. Phase A appends `"js/**/*.d.ts"` so the declaration file is picked up by `tsc --noEmit`. Without this, the type imports silently resolve to `any` and the strict-flag fixes are illusory.

### Ambient shims

Phase A adds `js/shims/` (a new directory, ignored by ESLint's filename-case rule via the existing exemption pattern) containing tiny ambient declarations for npm deps that ship without types:

- `js/shims/mute-stream.d.ts` — declares `MuteStream` class with `pipe`, `end` methods used by `passwordPrompt`.
- `js/shims/progress.d.ts` — declares the `ProgressBar` class used by `downloadFile` in `fileUtils.cjs`.

Each shim is ~10 LOC. Any other untyped dep that surfaces during Phase B gets a similar shim in the same commit as the JSDoc fix.

## Phase Plan

Each phase is one or more commits to `refactor/typescript-readiness`. Each phase ends with the full local gate green.

| Phase  | Title                                                                                                                                                   | Risk   | New tests                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| **A**  | Create `js/types.d.ts` + `js/shims/*.d.ts`; update `tsconfig.json` `include`                                                                            | low    | 0                                  |
| **B**  | Enable strict flags; fix JSDoc errors (~100–150 expected after Phase A)                                                                                 | medium | 0                                  |
| **C1** | Extract `cli/args.cjs`, `cli/configMerge.cjs`, `cli/versionInfo.cjs`                                                                                    | medium | 3 (args, configMerge, versionInfo) |
| **C2** | Extract `net/httpAgent.cjs`, `io/passwordPrompt.cjs`, `io/urlListing.cjs`                                                                               | low    | 3                                  |
| **C3** | Extract `io/regionParsing.cjs`, `download/urlRefresh.cjs`                                                                                               | medium | 2                                  |
| **C4** | Create `download/commonDownload.cjs`; extract `download/bamHandler.cjs`, `download/vcfHandler.cjs` (deduplicate full-download + optional-index pattern) | high   | 3 (incl. commonDownload)           |
| **C5** | Create `js/errors.cjs`; extract `commands/list.cjs`, `commands/resume.cjs`, `commands/download.cjs`                                                     | high   | 4 (incl. errors.cjs)               |
| **C6** | Remove `varvis-download.cjs` from `KNOWN_OVERSIZED_FILES`; final integration test pass                                                                  | low    | 0                                  |
| **D**  | Author `docs/adr/0001-defer-typescript-conversion.md`                                                                                                   | low    | 0                                  |

Total new tests: **15** unit tests, ~850 LOC. Tests for newly subdir'd modules live under `tests/unit/cli/`, `tests/unit/net/`, `tests/unit/io/`, `tests/unit/download/`, `tests/unit/commands/`. The `errors.cjs` test lives at `tests/unit/errors.test.js` (root of `tests/unit/`, matching the existing convention for `js/`-root modules).

`cli/args.cjs` test scope: import the yargs builder, parse `['--target=X', '--username=Y', '--password=Z']`, assert known options resolve. Yargs's process-exit-on-error behavior is mocked via `.exitProcess(false)` in the test.

### Phase A details

**Four** changes, not three. Creating declarations without retagging the call-sites that _use_ them leaves the TS2339 family intact — the strict baseline does not drop.

1. **Create `js/types.d.ts`** with the interfaces from the "Domain Types (Phase A)" section above.
2. **Create `js/shims/mute-stream.d.ts` and `js/shims/progress.d.ts`** with ambient declarations for the methods actually used.
3. **Edit `tsconfig.json:26`**: change `"include": ["js/**/*.cjs", "*.cjs"]` to `"include": ["js/**/*.cjs", "*.cjs", "js/**/*.d.ts"]`.
4. **Retag JSDoc call-sites** that drive the TS2339 family. For each `@param {object}` that takes a domain object, replace with `@param {import('./types').<TypeName>}`. Same for `agent`, `logger`, file dicts, options bags. Concretely, the highest-density retargets are:
   - `js/fetchUtils.cjs` — `agent`, `logger`, file-dict params (~38 sites)
   - `js/rangedUtils.cjs` — `metrics`, `logger`, agent (~46 sites)
   - `js/archiveUtils.cjs` — restoration options, file objects (~17 sites)
   - `js/restorationState.cjs` — restoration state shape (~21 sites)
   - The remaining 10 source files have <15 sites each; sweep them too.

Verification:

- `npm run type-check` still passes (Phase A does not yet enable strict flags).
- A scratch run of `npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns 2>&1 | wc -l` shows a meaningful reduction from the baseline 339 lines — target **≤150** (the non-TS2339 residual). If the reduction is much smaller, retargeting missed the high-density modules; investigate before proceeding to Phase B.

The retagging step is mechanical but spans every typed source file. Allocate ~0.75 day for it within Phase A's 1–1.5 day envelope.

### Phase B details

Edit `tsconfig.json:14-18`:

```json
"strict": true,
"noImplicitAny": true,
"strictNullChecks": true,
"noImplicitReturns": true,
"noUnusedLocals": false,
"noUnusedParameters": false
```

Run `npm run type-check`. Expected surface area: **~100–150 errors** (down from 339, post-Phase-A). Dominant remaining categories:

- Implicit `any` on legitimately-untyped extractions (e.g., `options.dispatcher` at `apiClient.cjs:79`).
- Possibly-undefined access on `fileDict[fileName]?.downloadLink` chains.
- Missing return on conditional branches.
- Number-narrowing in retry logic.

Fix each by tightening the JSDoc (e.g., `@param {import('undici').Agent}`) or adding the type to `js/types.d.ts`. **`@ts-ignore` and `@ts-nocheck` are disallowed in this phase.** If a fix requires non-trivial code change, defer to a follow-up commit within Phase B with a clear `refactor:` message and a one-line explanation.

If the residual error count is >250 after Phase A, stop and reassess: Phase A's types are likely too narrow or wrongly imported. Do not push through.

### Phase C extraction rule

For each extracted module:

1. **Identify** the function(s) and their dependencies in `varvis-download.cjs`.
2. **Extract**, deduplicating shared patterns. Specifically:
   - BAM and VCF full-download paths share a "download primary file + optionally download index + reindex" sequence today (entry lines ~852-897 and ~970-1015 are near-mirrors). The shared logic moves to a helper (`download/commonDownload.cjs`, ~50 LOC) that both `bamHandler` and `vcfHandler` call. The C4 budget of ~305 LOC across `bamHandler` + `vcfHandler` assumes this deduplication; verbatim extraction would exceed the budget.
   - URL refresh + index URL refresh share a pattern; both go through `download/urlRefresh.cjs`.
3. **Convert** the function signature to take `(config, deps)` or `(input, deps)` where `deps` is the explicit dependency object. Replace module-scope variable access with `deps.*` or `config.*`.
4. **Test** with a focused unit test that exercises the public behavior with mocked deps.
5. **Wire** `varvis-download.cjs` to import and call the extracted module.
6. **Run** the full gate. Commit. Move to next module.

No phase ends with `main()` partially refactored. Each phase boundary is a working CLI.

This is an **extraction with refactoring**, not a verbatim move. The 580-LOC `main()` reduces to ~80 LOC entry because (a) it dispatches to commands instead of containing them, and (b) the duplication between BAM and VCF download paths is factored into the shared helper above.

## Error Handling Change

The current entry has **13** `process.exit(0)` / `process.exit(1)` calls spread through `main()` and synchronous validation. The current code also catches per-file download/range errors **inside the loop** and logs-and-continues — these failures are **recoverable** and must remain so. The refactor distinguishes three tiers:

### Tier 1 — Configuration errors (fatal, pre-loop)

User-facing argument or config validation failures. Currently 4 `process.exit(1)` sites in entry lines 290-315. Refactor: `cli/configMerge.cjs` throws `ConfigurationError`. Entry catches once, logs, exits 1.

### Tier 2 — Operational errors (fatal, mid-command)

Failures that cannot be salvaged: auth failure, no analysis IDs, missing required external tool. Refactor: `commands/*.cjs` throw `OperationalError(message, exitCode)`. Entry catches once, logs, exits with carried code.

### Tier 3 — Per-file download body errors (recoverable, stay in loop)

Per-file download _body_ errors currently caught at entry lines ~822-826, ~847-850, ~893-895, ~964-967, ~1011-1013. These remain `try { … } catch (error) { logger.error(...); }` inside the download loop in `commands/download.cjs`. The user sees one log line per failed file and the command exits 0 if at least one file succeeded. **This behavior is contractual; do not "promote" these to throws.**

The set of operations covered by Tier 3 today (verified against `varvis-download.cjs`):

- `rangedDownloadBAM` body failure (line 822 catch)
- `rangedDownloadVCF` body failure (line 964 catch)
- `unmappedDownloadBAM` body failure (line 847 catch)
- `downloadFile` (full-download) body failure (lines 893, 1011 catches)

### Important: Tier 2, not Tier 3 (matches current behavior)

The following per-file operations are **outside** the inner catches today and are therefore **fatal** to the whole run. The refactor must preserve this — do not move them inside the loop's inner catch:

- `getValidDownloadUrl` (URL refresh on expiring URLs) — uncaught at entry lines ~749, 769, 909.
- `ensureIndexFile` (index acquisition for ranged/unmapped downloads) — uncaught at entry lines ~790, 930.
- `getDownloadLinks` (the per-analysis API call) — uncaught at entry line ~718.

These currently propagate to the outer `main()` try/catch at line ~1037 which logs and exits 1. After the refactor, they become `OperationalError(message, 1)` and the entry's top-level handler logs and exits 1. **Exit codes preserved; the per-analysis batch terminates on these failures, same as today.**

If a future change makes these recoverable, do it under a separate spec — not as a side-effect of this refactor.

### Runtime classes

Live in a new `js/errors.cjs` (~40 LOC):

```js
class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 1;
  }
}
class OperationalError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
module.exports = { ConfigurationError, OperationalError };
```

### Type declarations

Mirrored in `js/types.d.ts` so JSDoc `@param {import('./types').ConfigurationError}` works without a separate runtime import in pure-type contexts.

### Behavior changes observable to users

- Validation error log lines may consolidate (currently some validation errors log twice). **Exit codes do not change.**
- Per-file errors continue logging and continuing — **no change**.
- `process.exit(0)` on success path moves from inside `main()` to the top-level catch handler — **no observable difference**.

### Verification

Phase C5 captures the exit-code matrix as a snapshot:

| Scenario                                | Current exit       | Target exit                           |
| --------------------------------------- | ------------------ | ------------------------------------- |
| Missing `--target`                      | 1                  | 1                                     |
| `--unmapped --bed` combined             | 1                  | 1                                     |
| No analysis/sample/lims IDs             | 1                  | 1                                     |
| `--help` (yargs built-in)               | 0                  | 0 (yargs handles; we don't intercept) |
| `--version`                             | 0                  | 0                                     |
| `--list` success                        | 0                  | 0                                     |
| `--list-urls` success                   | 0                  | 0                                     |
| Successful download                     | 0                  | 0                                     |
| Resume mode success                     | 0                  | 0                                     |
| Per-file body failure (one file)        | 0 (others succeed) | 0                                     |
| All-files body failure                  | 0 (logged)         | 0 (logged) — **contract preserved**   |
| URL refresh failure (Tier 2)            | 1                  | 1 — **must preserve fatality**        |
| `ensureIndexFile` failure (Tier 2)      | 1                  | 1 — **must preserve fatality**        |
| `getDownloadLinks` API failure (Tier 2) | 1                  | 1 — **must preserve fatality**        |
| Auth failure                            | 1                  | 1                                     |
| Unhandled exception in main             | 1                  | 1                                     |

The matrix is captured to `tests/fixtures/exit-codes.json` at the start of Phase C5 and re-verified at the end.

## Credential Precedence Contract

The current entry has a latent bug: `varvis-download.cjs:288-294` validates `finalConfig.password` exists BEFORE `varvis-download.cjs:319-320` applies the `VARVIS_PASSWORD` env override. The interactive prompt at `varvis-download.cjs:528-547` runs even later. The result: env vars and the prompt are effectively dead code if password is missing from argv/config — validation kills the process first.

The README documents env vars as a valid auth path. The current code does not honor that. Rather than treat this as "no observable change" (the rev-1 wording), this spec **defines and tests the intended precedence** explicitly and aligns the code with the documented behavior.

### Intended precedence (highest wins)

1. **CLI args** (`--username`, `--password`)
2. **Environment variables** (`VARVIS_USER`, `VARVIS_PASSWORD`)
3. **Config file** (`.config.json` or `--config <path>`)
4. **Interactive prompt** (password only; username has no prompt today and won't get one in this spec)
5. **Validation:** after all four sources are tried, if `username` or `target` is still missing, throw `ConfigurationError`. If `password` is still missing AND we're not in an interactive TTY, throw `ConfigurationError`.

### Refactor location

`cli/configMerge.cjs` performs steps 1–3 and produces a partial `FinalConfig` where `password` may be unset.

`commands/*.cjs` perform step 4 (prompt) if `password` is unset and `process.stdin.isTTY` is true.

`varvis-download.cjs` performs step 5 (validation) AFTER prompt fallback. `username` and `target` validation runs in `cli/configMerge.cjs` (since they have no prompt fallback).

### Tests added

- `tests/unit/cli/configMerge.test.js` covers each precedence case: argv-only, env-only, config-only, all three with conflicts, none + non-TTY (expect throw), none + TTY (expect undefined password, downstream prompts).
- `tests/unit/commands/download.test.js` covers the prompt fallback with a mocked TTY.

### Behavior change observable to users

This is the **only** intentional behavior change in this spec: env vars and the prompt now work as documented, instead of being dead code. Exit codes for malformed configs (missing required fields with no fallback available) remain 1.

This change is called out in the ADR and PR description.

## Circular-Require Resolution

Today `js/fetchUtils.cjs:3` imports `archiveUtils.cjs` at the top level. To avoid a circular import, `js/archiveUtils.cjs:119` lazy-requires `fetchUtils.cjs` (and `rangedUtils.cjs`, `fileUtils.cjs`) _inside_ the `resumeArchivedDownloads` function body. This works in CommonJS but breaks the "mechanical TS conversion" claim — TS `import` is hoisted and cannot replicate the lazy pattern without rewriting to dynamic `import()`.

Phase C5 breaks the cycle by **moving the resume orchestration out of `js/archiveUtils.cjs` into `js/commands/resume.cjs`**:

- `js/archiveUtils.cjs` keeps `triggerRestoreArchivedFile` and helpers; loses the orchestration function `resumeArchivedDownloads`.
- `js/commands/resume.cjs` becomes the new home of `resumeArchivedDownloads`, with all required imports declared at the top.
- `js/fetchUtils.cjs` continues to import `archiveUtils.cjs` for `triggerRestoreArchivedFile` (no longer cyclic).
- The lazy `require()` calls at `archiveUtils.cjs:119-129` are deleted.

This is a behavior-preserving move: the function is the same, just relocated. The existing `tests/integration/archive.test.js` must still pass unchanged.

After this move, a search for `require(` inside function bodies in `js/` should return zero hits (or a documented exception). This is the "mechanical conversion" precondition.

## Testing Strategy

- **Phase A & B regression:** the existing **19** test files (`npx jest --listTests` count) must pass; `npm run type-check` must pass.
- **Pre-Phase-C1 baseline capture:** record only **deterministic** outputs to `tests/fixtures/cli-output/`:
  - `--help` text (stable, only churns on yargs option additions which are blocked by this spec's non-goals).
  - Programmatic `configMerge` output: given a known `argv` array and known config file, snapshot the resulting `finalConfig` object as JSON. This exercises the merge logic without invoking process.exit or network.
  - **`--version` is _not_ fixtured** — its output includes `getLastModifiedDate(__filename)` (`varvis-download.cjs:240`) which churns whenever the file is touched. Instead, a unit test asserts that `--version` prints the strings `name`, `Version`, `Author`, `Repository`, `License` and exits 0.
  - **`--list` is _not_ fixtured** — it requires Varvis API auth and is covered by the existing integration tests.
- **Exit-code matrix:** captured as `tests/fixtures/exit-codes.json` before Phase C5 begins (see "Error Handling Change" → "Verification").
- **Phase C extraction tests:** every extracted module ships with its unit test in the same commit (see "Phase C extraction rule").
- **Phase C5 integration check:** the existing `tests/integration/archive.test.js` must pass unchanged. If it doesn't, the extraction is wrong, not the test.
- **No coverage threshold change.** Jest's `60/50/60/60` thresholds remain. The split should naturally improve coverage on the previously-untested orchestration code.

## Verification Gates

A phase is "done" only when:

1. `npm run lint` exits 0.
2. `npx prettier --check .` exits 0.
3. `npm run type-check` exits 0 (with the strict flags from Phase B enabled, starting from Phase B onward).
4. `npm test` exits 0; all existing tests pass; new tests from this phase pass.
5. `npm run architecture:check` exits 0; no new files appear in the warn (≥500 LOC) tier.
6. The full `npm run check` aggregate passes.
7. Commit message follows convention (`refactor:`, `chore:`, `docs:`).

## What the Future TS Conversion Looks Like

After this spec lands, converting to `.ts` is a mechanical pass — **enabled by the circular-require resolution in Phase C5**. Without that, step 3 below would require rewriting lazy `require()` to dynamic `import()`, which is not mechanical.

1. `git checkout -b refactor/typescript-conversion`.
2. For each `.cjs` file: `git mv path/to.cjs path/to.ts`.
3. Rewrite `require()` → `import`, `module.exports = {a, b}` → `export {a, b}`. (All `require()` calls are top-level at this point, post-Phase-C5.)
4. Inline JSDoc types as TS annotations; delete `@param`/`@returns` comments (descriptions stay).
5. `types.d.ts` → `types.ts`.
6. Configure `@swc/jest` for `.ts` test execution.
7. Add a `dist/` build step; update `bin` in `package.json`.

Estimated effort post-this-spec: **5–7 days** (down from 12–18 without it). The hard work — file splitting, type extraction, error-class refactor, module-scope state removal — is already done.

## Estimate

| Phase                                     | Effort              | Note                                                                                                            |
| ----------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| A — types.d.ts + shims + tsconfig include | 1–1.5 days          | Revised up from rev 1 — accounts for shim authoring, dep audit, and verification that TS2339 drops as predicted |
| B — strict flags + JSDoc fixes            | 1.5–3 days          | Revised up — 100–150 residual errors after Phase A, each needing a targeted JSDoc fix                           |
| C1                                        | 0.5 day             |                                                                                                                 |
| C2                                        | 0.5 day             |                                                                                                                 |
| C3                                        | 0.5 day             |                                                                                                                 |
| C4                                        | 1–1.5 days          | Includes the BAM/VCF deduplication helper                                                                       |
| C5                                        | 1.5–2 days          | Error-class refactor + 3-tier behavior preservation                                                             |
| C6                                        | 0.25 day            |                                                                                                                 |
| D — ADR                                   | 0.5 day             |                                                                                                                 |
| **Total**                                 | **7.25–10.75 days** |                                                                                                                 |

Calendar time with part-time work: **6–10 weeks** on `refactor/typescript-readiness`.

## Open Questions / Decisions Deferred

- **PR review granularity.** Default is one final PR. Option to switch to per-phase sub-branch PRs exists but is not the default.
- **ESLint `no-restricted-imports` rule.** Mentioned in "Architecture Principles" as informal; deferred to a follow-up if review friction shows up.
- **`@swc/jest` adoption.** Documented as a next step in the ADR but not in scope here.
- **Test file splits.** Two test files remain in `KNOWN_OVERSIZED_FILES`; their splits are tracked separately, not in this spec.

## Sign-Off

- [ ] User-approved spec (this file).
- [ ] Branch `refactor/typescript-readiness` created from `main` and pushed.
- [ ] Draft PR opened against `main` for CI coverage.
- [ ] Phase plan tracked in PR description as a checklist.

---

_This spec was authored under the brainstorming skill from the Superpowers plugin. The implementation plan is generated separately by the writing-plans skill from this spec._
