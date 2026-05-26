# TypeScript-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land four pieces of preparation work (types.d.ts, strict flags, entry split, ADR) on a single long-lived branch so that a future `.cjs` → `.ts` conversion becomes mechanical instead of archaeological.

**Architecture:** All work on `refactor/typescript-readiness` off `main` with a draft PR open from day one for CI coverage. Phases ordered A (types) → B (strict) → C1-C6 (split) → D (ADR). Single final merge-commit PR to `main`.

**Tech Stack:** Node.js ≥22.22.2, npm, CommonJS (`.cjs`), JSDoc-annotated, TypeScript in `checkJs`/`noEmit` mode, Jest 30, ESLint 10 (flat config), husky + lint-staged.

**Spec:** `docs/superpowers/specs/2026-05-26-typescript-readiness-design.md`

---

## Pre-flight: Branch + Draft PR

### Task 0: Create branch and open draft PR

**Files:**

- Modify: git state (new branch)
- Create: `tests/fixtures/cli-output/.gitkeep` (placeholder so the dir exists for Phase C0)

- [ ] **Step 1: Verify clean main**

```bash
git status --short
git branch --show-current
```

Expected: working tree clean; current branch is `main`.

- [ ] **Step 2: Create the long-lived branch**

```bash
git checkout -b refactor/typescript-readiness
```

- [ ] **Step 3: Create the fixtures directory placeholder**

```bash
mkdir -p tests/fixtures/cli-output
```

Then write `tests/fixtures/cli-output/.gitkeep`:

```
# Baseline CLI output fixtures (created in Phase C0).
```

- [ ] **Step 4: Initial commit on the branch**

```bash
git add tests/fixtures/cli-output/.gitkeep
git commit -m "chore: create fixtures directory for ts-readiness refactor"
```

- [ ] **Step 5: Push the branch and open draft PR**

```bash
git push -u origin refactor/typescript-readiness
gh pr create --draft --base main --title "refactor: TypeScript-readiness preparation" --body "Tracking PR for the long-running ts-readiness refactor. See \`docs/superpowers/specs/2026-05-26-typescript-readiness-design.md\`.

Phases:
- [ ] A — Domain types + shims + tsconfig include
- [ ] B — Strict flags + JSDoc fixes
- [ ] C1 — cli/ extraction
- [ ] C2 — net/ + io/ leaves
- [ ] C3 — io/regionParsing + download/urlRefresh
- [ ] C4 — download handlers + commonDownload helper
- [ ] C5 — errors.cjs + commands/ + circular-require fix
- [ ] C6 — KNOWN_OVERSIZED_FILES cleanup
- [ ] D — ADR

Do not convert from draft until all checkboxes are ticked and the full local gate passes."
```

Expected: PR URL printed; CI runs against the branch.

---

## Phase A — Domain types + shims + JSDoc retagging

### Task A1: Create `js/types.d.ts`

**Files:**

- Create: `js/types.d.ts`

- [ ] **Step 1: Write the declaration file**

```ts
/**
 * Shared domain type declarations for varvis-download.
 *
 * Referenced from JSDoc via:
 *   - From js/ root:  @param {import('./types').FileDict}
 *   - From js/sub/:   @param {import('../types').FileDict}
 *
 * No runtime code lives here. Runtime classes (ConfigurationError,
 * OperationalError) are implemented in js/errors.cjs and declared
 * below for type-only contexts.
 */

import type { Logger } from 'winston';

export interface AnalysisFile {
  fileName: string;
  downloadLink?: string;
  analysisId?: string;
  archived?: boolean;
  restoreEstimation?: string;
}

export type FileDict = Record<string, AnalysisFile>;

// 'none' is intentional: list mode (js/fetchUtils.cjs:298-308) passes 'none'
// to bypass restoration logic entirely. 'no' is a user-facing CLI value that
// explicitly declines restoration with logging. Different semantics; both kept.
export type RestoreMode = 'no' | 'none' | 'ask' | 'all' | 'force';

export interface Metrics {
  startTime: number;
  totalFilesDownloaded: number;
  totalFilesSkipped: number;
  totalBytesDownloaded: number;
  downloadSpeeds: number[];
}

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
  proxy?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  overwrite: boolean;
  reportfile?: string;
  restoreArchived: RestoreMode;
  restorationFile: string;
  resumeArchivedDownloads: boolean;
  listUrls: boolean;
  urlFile: string | null;
  range: string | null;
  bed: string | null;
  unmapped: boolean;
  latest: boolean;
  list?: boolean;
  config?: string;
  loglevel?: string;
  logfile?: string;
  version?: boolean;
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

export interface CommandDeps {
  logger: Logger;
  agent: unknown; // undici Agent or ProxyAgent; structurally compatible
  authService: {
    token: string;
    login: (
      creds: { username: string; password: string },
      target: string,
    ) => Promise<void>;
  };
  rl: import('node:readline').Interface;
  metrics: Metrics;
}

export interface RangedDownloadDeps {
  logger: Logger;
  metrics: Metrics;
}

// Runtime classes implemented in js/errors.cjs (created in Phase C5).
// Declared here so JSDoc can reference them in pure-type contexts.
export class ConfigurationError extends Error {
  readonly exitCode: 1;
  constructor(message: string);
}

export class OperationalError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode?: number);
}
```

- [ ] **Step 2: Verify file compiles standalone**

```bash
npx tsc --noEmit js/types.d.ts
```

Expected: zero output. If there are errors about missing `winston` types, verify `@types/node` is present and `winston` is in dependencies.

- [ ] **Step 3: Commit**

```bash
git add js/types.d.ts
git commit -m "chore(types): add js/types.d.ts with shared domain types"
```

---

### Task A2: Create `js/shims/mute-stream.d.ts`

**Files:**

- Create: `js/shims/mute-stream.d.ts`

- [ ] **Step 1: Write the ambient declaration**

```ts
/**
 * Ambient declaration for `mute-stream`. The package ships without types.
 * Only declares the surface we actually use (constructor + pipe + end).
 */

declare module 'mute-stream' {
  import { Writable } from 'node:stream';

  class MuteStream extends Writable {
    constructor(opts?: { replace?: string; prompt?: string });
    pipe<T extends NodeJS.WritableStream>(dest: T): T;
    end(): void;
    mute(): void;
    unmute(): void;
  }

  export = MuteStream;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/shims/mute-stream.d.ts
git commit -m "chore(types): add ambient declaration for mute-stream"
```

---

### Task A3: Create `js/shims/progress.d.ts`

**Files:**

- Create: `js/shims/progress.d.ts`

- [ ] **Step 1: Inspect how `progress` is used to scope the shim**

```bash
grep -rn "require('progress')\|require(\"progress\")" js/ varvis-download.cjs
```

- [ ] **Step 2: Write the ambient declaration**

```ts
/**
 * Ambient declaration for `progress`. The package ships without types.
 * Declares only the ProgressBar class with the methods used in fileUtils.cjs.
 */

declare module 'progress' {
  class ProgressBar {
    constructor(
      format: string,
      options: {
        total: number;
        width?: number;
        complete?: string;
        incomplete?: string;
        renderThrottle?: number;
        clear?: boolean;
      },
    );
    tick(delta?: number, tokens?: Record<string, unknown>): void;
    update(ratio: number, tokens?: Record<string, unknown>): void;
    interrupt(message: string): void;
    terminate(): void;
    complete: boolean;
  }

  export = ProgressBar;
}
```

- [ ] **Step 3: Commit**

```bash
git add js/shims/progress.d.ts
git commit -m "chore(types): add ambient declaration for progress"
```

---

### Task A4: Update `tsconfig.json` to include `.d.ts` files

**Files:**

- Modify: `tsconfig.json:26`

- [ ] **Step 1: Edit `tsconfig.json` `include` array**

Change `tsconfig.json:26` from:

```json
"include": ["js/**/*.cjs", "*.cjs"],
```

to:

```json
"include": ["js/**/*.cjs", "*.cjs", "js/**/*.d.ts"],
```

- [ ] **Step 2: Run type-check to confirm nothing broke**

```bash
npm run type-check
```

Expected: zero errors. If errors appear, the type declarations conflict with something — investigate before continuing.

- [ ] **Step 3: Capture the strict-mode error baseline before retagging**

```bash
npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns --pretty false 2>&1 | tee /tmp/strict-baseline.txt | wc -l
```

Expected: ~339 lines. Save the exact number — Task A9 verifies the reduction.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "chore(tsconfig): include js/**/*.d.ts in type-check"
```

---

### Task A5: Retag `js/fetchUtils.cjs` JSDoc sites

**Files:**

- Modify: `js/fetchUtils.cjs`

This file has ~38 typed JSDoc annotations. Most are `@param {object}` weasel-types that should be retagged.

- [ ] **Step 1: List the current `@param {object}` and `@param {Array}` sites**

```bash
grep -n "@param {object}\|@param {Array\|@returns {object}" js/fetchUtils.cjs
```

- [ ] **Step 2: Apply the retagging pattern**

For each site, replace:

| Old                                             | New                                                      |
| ----------------------------------------------- | -------------------------------------------------------- |
| `@param {object} agent`                         | `@param {import('undici').Agent} agent`                  |
| `@param {object} logger` (or `winston`-like)    | `@param {import('winston').Logger} logger`               |
| `@param {object} options` (restoration options) | `@param {import('./types').RestorationOptions} options`  |
| `@param {object} file` (analysis file)          | `@param {import('./types').AnalysisFile} file`           |
| `@param {object} rl`                            | `@param {import('node:readline').Interface} rl`          |
| `@returns {Promise<object>}` (file dict result) | `@returns {Promise<import('./types').FileDict>}`         |
| `@param {string} restoreArchived`               | `@param {import('./types').RestoreMode} restoreArchived` |

Example diff for one function (mirror for the rest):

```diff
 /**
  * Fetches download links for an analysis ID.
- * @param   {string}        analysisId    - The analysis ID.
- * @param   {string[]}      filetypes     - File types filter.
- * @param   {string}        target        - Varvis target.
- * @param   {string}        token         - CSRF token.
- * @param   {object}        agent         - HTTP agent.
- * @param   {object}        logger        - Logger.
- * @param   {string}        restoreArchived - Restoration mode.
- * @param   {object}        rl            - Readline interface.
- * @param   {string}        restorationFile - Awaiting-restoration file path.
- * @param   {object}        options       - Restoration options.
- * @returns {Promise<object>}              - Map of fileName -> file info.
+ * @param   {string}                                  analysisId      - The analysis ID.
+ * @param   {string[]|null}                           filetypes       - File types filter (null = all).
+ * @param   {string}                                  target          - Varvis target.
+ * @param   {string}                                  token           - CSRF token.
+ * @param   {import('undici').Agent}                  agent           - HTTP agent.
+ * @param   {import('winston').Logger}                logger          - Logger.
+ * @param   {import('./types').RestoreMode}           restoreArchived - Restoration mode.
+ * @param   {import('node:readline').Interface|null}  rl              - Readline interface.
+ * @param   {string}                                  restorationFile - Awaiting-restoration file path.
+ * @param   {import('./types').RestorationOptions}    options         - Restoration options.
+ * @returns {Promise<import('./types').FileDict>}                      - Map of fileName -> file info.
  */
```

Repeat for every function in `js/fetchUtils.cjs`.

- [ ] **Step 3: Verify the file still passes the existing (non-strict) type-check**

```bash
npm run type-check
```

Expected: zero errors.

- [ ] **Step 4: Verify the strict-mode error count dropped for this file specifically**

```bash
npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns --pretty false 2>&1 | grep "fetchUtils.cjs" | wc -l
```

Expected: meaningful drop from baseline. If the count is still high, the retagging missed weasel-types — inspect specific errors and continue.

- [ ] **Step 5: Commit**

```bash
git add js/fetchUtils.cjs
git commit -m "chore(types): retag js/fetchUtils.cjs JSDoc to imported domain types"
```

---

### Task A6: Retag `js/rangedUtils.cjs` JSDoc sites

**Files:**

- Modify: `js/rangedUtils.cjs`

Apply the same retagging pattern from Task A5. Highest-density target — ~46 sites.

- [ ] **Step 1: Apply the table from Task A5 across `js/rangedUtils.cjs`**

Additional mappings specific to this file:

| Old                       | New                                          |
| ------------------------- | -------------------------------------------- |
| `@param {object} metrics` | `@param {import('./types').Metrics} metrics` |

- [ ] **Step 2: Verify**

```bash
npm run type-check
npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns --pretty false 2>&1 | grep "rangedUtils.cjs" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add js/rangedUtils.cjs
git commit -m "chore(types): retag js/rangedUtils.cjs JSDoc to imported domain types"
```

---

### Task A7: Retag `js/archiveUtils.cjs` JSDoc sites

**Files:**

- Modify: `js/archiveUtils.cjs`

~17 sites. Same retagging pattern.

- [ ] **Step 1: Apply retagging**

Additional mappings:

| Old                                         | New                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `@param {object} entry` (restoration entry) | `@param {import('./types').AnalysisFile & { restoreEstimation: string }} entry` |

- [ ] **Step 2: Verify and commit**

```bash
npm run type-check
git add js/archiveUtils.cjs
git commit -m "chore(types): retag js/archiveUtils.cjs JSDoc to imported domain types"
```

---

### Task A8: Retag remaining `js/*.cjs` files

**Files:**

- Modify: `js/apiClient.cjs`, `js/arrayUtils.cjs`, `js/authService.cjs`, `js/configUtils.cjs`, `js/fileUtils.cjs`, `js/filterUtils.cjs`, `js/logger.cjs`, `js/promptUtils.cjs`, `js/restorationState.cjs`, `js/toolChecks.cjs`, `js/urlUtils.cjs`

Each has <25 sites. Sweep them in alphabetical order.

- [ ] **Step 1: For each file, identify and retag weasel-types**

```bash
grep -n "@param {object}\|@param {Array" js/apiClient.cjs js/arrayUtils.cjs js/authService.cjs js/configUtils.cjs js/fileUtils.cjs js/filterUtils.cjs js/logger.cjs js/promptUtils.cjs js/restorationState.cjs js/toolChecks.cjs js/urlUtils.cjs
```

Apply mappings from Tasks A5/A6/A7.

- [ ] **Step 2: Verify**

```bash
npm run type-check
```

- [ ] **Step 3: Commit (one combined commit is fine since these are smaller files)**

```bash
git add js/*.cjs
git commit -m "chore(types): retag remaining js/*.cjs JSDoc to imported domain types"
```

---

### Task A9: Verify Phase A success and commit

**Files:**

- None modified; verification only.

- [ ] **Step 1: Run the full strict-mode scratch check**

```bash
npx tsc --noEmit --strict --noImplicitAny --strictNullChecks --noImplicitReturns --pretty false 2>&1 | wc -l
```

Expected: **≤150 lines** (down from 339). If higher than 200, retagging missed a high-density site — return to Tasks A5/A6/A7 before proceeding.

- [ ] **Step 2: Run the full local gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

Expected: all pass.

- [ ] **Step 3: Push to draft PR**

```bash
git push
```

Expected: CI runs on the draft PR. Wait for green; if red, investigate before Phase B.

---

## Phase B — Strict tsconfig

### Task B1: Enable strict flags in `tsconfig.json`

**Files:**

- Modify: `tsconfig.json:14-18`

- [ ] **Step 1: Edit `tsconfig.json` strict flags**

Change `tsconfig.json:14-18` from:

```json
    "strict": false,
    "noImplicitAny": false,
    "noImplicitReturns": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```

to:

```json
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```

- [ ] **Step 2: Run type-check to see current error count**

```bash
npm run type-check 2>&1 | tee /tmp/strict-errors.txt | tail -5
```

Expected: ~100-150 errors. Save the full output to `/tmp/strict-errors.txt` for triage.

---

### Task B2: Fix strict errors by category — implicit-any extractions

**Files:**

- Modify: any `.cjs` file flagged with TS7006, TS7034, TS7005

- [ ] **Step 1: List TS7006 errors (implicit any on parameter)**

```bash
grep -E "TS(7006|7034|7005)" /tmp/strict-errors.txt
```

- [ ] **Step 2: For each site, tighten the JSDoc or destructure with a typed cast**

Example fix at `js/apiClient.cjs:79`:

```diff
 async function fetchWithRetry(url, options, retries = 3, logger) {
-  const agent = options.dispatcher;
+  /** @type {import('undici').Agent | undefined} */
+  const agent = options.dispatcher;
   if (!agent) {
     throw new Error('Agent (dispatcher) is required for fetchWithRetry');
   }
```

- [ ] **Step 3: Re-run type-check after each module is fixed**

```bash
npm run type-check 2>&1 | grep "error TS" | wc -l
```

Repeat until TS7006/TS7034/TS7005 are zero.

- [ ] **Step 4: Commit when this category is clean**

```bash
git add -A
git commit -m "fix(types): resolve implicit-any errors under strict mode"
```

---

### Task B3: Fix strict errors by category — possibly-undefined

**Files:**

- Modify: any `.cjs` file flagged with TS18046, TS18047, TS2532, TS2533

- [ ] **Step 1: List undefined-narrowing errors**

```bash
grep -E "TS(18046|18047|2532|2533)" /tmp/strict-errors.txt
```

- [ ] **Step 2: For each site, add a guard or non-null assertion via JSDoc**

Example fix for `fileDict[fileName]?.downloadLink` chains:

```diff
 const file = fileDict[fileName];
-if (!file || !file.downloadLink) {
+if (file === undefined || file.downloadLink === undefined) {
   throw new Error(`No download link found for file: ${fileName}`);
 }
+/** @type {string} */
+const downloadLink = file.downloadLink;
```

- [ ] **Step 3: Re-run type-check**

```bash
npm run type-check 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(types): resolve possibly-undefined errors under strict mode"
```

---

### Task B4: Fix strict errors by category — missing returns and remaining

**Files:**

- Modify: any remaining flagged file

- [ ] **Step 1: List remaining errors**

```bash
npm run type-check 2>&1 | grep "error TS" | sort | uniq -c | sort -rn
```

- [ ] **Step 2: Fix each remaining site**

Common patterns:

- TS7053 (element implicitly has any): retag the index expression or add a type.
- TS2740 (missing properties): widen or narrow the type appropriately.
- TS2345 (argument type mismatch): tighten the source or destination type.

If a fix needs non-trivial code change, do it in its own commit with a clear `refactor:` prefix.

- [ ] **Step 3: Verify clean**

```bash
npm run type-check
```

Expected: zero errors.

- [ ] **Step 4: Full local gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

- [ ] **Step 5: Final commit for Phase B**

```bash
git add -A
git commit -m "fix(types): resolve remaining strict-mode errors"
git push
```

---

## Phase C0 — Baseline fixtures (before C1 starts)

### Task C0.1: Capture `--help` output as fixture

**Files:**

- Create: `tests/fixtures/cli-output/help.txt`

- [ ] **Step 1: Run --help and capture stdout**

```bash
node varvis-download.cjs --help > tests/fixtures/cli-output/help.txt
```

- [ ] **Step 2: Inspect for any unstable content**

```bash
cat tests/fixtures/cli-output/help.txt
```

If output contains version strings or dates, edit the file to use placeholders and document in a sibling `README.md` what the placeholder represents.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/cli-output/help.txt
git commit -m "test(fixtures): capture --help baseline for refactor regression checks"
```

---

### Task C0.2: Capture `configMerge` programmatic snapshot

**Files:**

- Create: `tests/fixtures/cli-output/configMerge.json`
- Create: `tests/fixtures/cli-output/configMerge-input.json`

- [ ] **Step 1: Define the input scenarios**

Write `tests/fixtures/cli-output/configMerge-input.json`:

```json
{
  "argv": [
    "--target=playground",
    "--username=alice",
    "--password=secret",
    "--analysisIds=123,456",
    "--filetypes=bam,bam.bai"
  ],
  "configFile": {
    "destination": "/tmp/downloads",
    "filters": ["analysisType=SNV"]
  }
}
```

- [ ] **Step 2: Run the current entry's config-merge logic manually**

There is no clean programmatic entry point yet — that's what `cli/configMerge.cjs` will provide in Task C1.3. For now, run the CLI with the args and capture the logger output's "Final configuration" line, OR defer this fixture to Task C1.4 once `configMerge` is callable from a test.

Decision: **defer the JSON snapshot capture to Task C1.4** (after configMerge is extracted). Keep `configMerge-input.json` checked in now so the input is fixed.

- [ ] **Step 3: Commit the input only**

```bash
git add tests/fixtures/cli-output/configMerge-input.json
git commit -m "test(fixtures): define configMerge baseline inputs"
```

---

### Task C0.3: Capture current exit-code matrix

**Files:**

- Create: `tests/fixtures/exit-codes.json`

- [ ] **Step 1: Write the expected matrix from the spec**

Create `tests/fixtures/exit-codes.json`:

```json
{
  "missing_target": 1,
  "unmapped_with_bed": 1,
  "no_ids": 1,
  "help": 0,
  "version": 0,
  "list_success": 0,
  "list_urls_success": 0,
  "download_success": 0,
  "resume_success": 0,
  "per_file_body_failure_one": 0,
  "all_files_body_failure": 0,
  "url_refresh_failure": 1,
  "ensure_index_failure": 1,
  "get_download_links_failure": 1,
  "auth_failure": 1,
  "unhandled_exception": 1
}
```

- [ ] **Step 2: Spot-check three current-code exit codes match**

```bash
node varvis-download.cjs --help; echo "exit: $?"
node varvis-download.cjs --version; echo "exit: $?"
node varvis-download.cjs --target=foo --username=bar --password=baz; echo "exit: $?"
```

Expected: `--help` → 0; `--version` → 0; missing `--analysisIds`/`--sampleIds`/`--limsIds` → 1.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/exit-codes.json
git commit -m "test(fixtures): capture current exit-code matrix for refactor regression"
```

---

## Phase C1 — `cli/` extraction

### Task C1.1: Test for `cli/args.cjs`

**Files:**

- Create: `tests/unit/cli/args.test.js`

- [ ] **Step 1: Create the directory and write the test**

```bash
mkdir -p tests/unit/cli
```

Write `tests/unit/cli/args.test.js`:

```js
const { buildParser } = require('../../../js/cli/args.cjs');

describe('cli/args.buildParser', () => {
  test('parses required CLI options', async () => {
    const parser = buildParser([
      '--target=demo',
      '--username=alice',
      '--password=secret',
      '--analysisIds=A1,A2',
    ]);
    const argv = await parser.argv;
    expect(argv.target).toBe('demo');
    expect(argv.username).toBe('alice');
    expect(argv.password).toBe('secret');
    expect(argv.analysisIds).toEqual(['A1,A2']); // yargs gives raw array; configMerge normalizes
  });

  test('--unmapped defaults to false', async () => {
    const parser = buildParser([
      '--target=demo',
      '--username=u',
      '--password=p',
      '--analysisIds=A',
    ]);
    const argv = await parser.argv;
    expect(argv.unmapped).toBe(false);
  });

  test('--latest defaults to false', async () => {
    const parser = buildParser([
      '--target=demo',
      '--username=u',
      '--password=p',
      '--analysisIds=A',
    ]);
    const argv = await parser.argv;
    expect(argv.latest).toBe(false);
  });

  test('--filter accepts multiple values', async () => {
    const parser = buildParser([
      '--target=demo',
      '--username=u',
      '--password=p',
      '--analysisIds=A',
      '--filter',
      'a=1',
      '--filter',
      'b=2',
    ]);
    const argv = await parser.argv;
    expect(argv.filter).toEqual(['a=1', 'b=2']);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails (module doesn't exist yet)**

```bash
npm test -- --testPathPatterns=cli/args
```

Expected: FAIL — `Cannot find module '../../../js/cli/args.cjs'`.

---

### Task C1.2: Extract `cli/args.cjs`

**Files:**

- Create: `js/cli/args.cjs`
- Modify: `varvis-download.cjs:64-230`

- [ ] **Step 1: Create the extracted module**

```bash
mkdir -p js/cli
```

Write `js/cli/args.cjs`:

```js
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

/**
 * Builds the yargs parser for varvis-download.
 *
 * In production, the entry calls `buildParser(hideBin(process.argv)).argv`.
 * In tests, the entry calls `buildParser(['--target=...']).exitProcess(false).argv`.
 *
 * @param   {string[]} argv - Argument array (typically hideBin(process.argv) or a test fixture).
 * @returns {import('yargs').Argv}     - Configured yargs parser instance.
 */
function buildParser(argv) {
  return yargs(argv)
    .usage('$0 <command> [args]')
    .version(false)
    .option('config', {
      alias: 'c',
      describe: 'Path to the configuration file',
      type: 'string',
      default: '.config.json',
    })
    .option('username', {
      alias: 'u',
      describe: 'Varvis API username',
      type: 'string',
    })
    .option('password', {
      alias: 'p',
      describe: 'Varvis API password',
      type: 'string',
    })
    .option('target', {
      alias: 't',
      describe: 'Target for the Varvis API',
      type: 'string',
    })
    .option('analysisIds', {
      alias: 'a',
      describe: 'Analysis IDs to download files for (comma-separated)',
      type: 'array',
    })
    .option('sampleIds', {
      alias: 's',
      describe: 'Sample IDs to filter analyses (comma-separated)',
      type: 'array',
    })
    .option('limsIds', {
      alias: 'l',
      describe: 'LIMS IDs to filter analyses (comma-separated)',
      type: 'array',
    })
    .option('list', {
      alias: 'L',
      describe: 'List available files for the specified analysis IDs',
      type: 'boolean',
    })
    .option('destination', {
      alias: 'd',
      describe: 'Destination folder for the downloaded files',
      type: 'string',
      default: '.',
    })
    .option('proxy', { alias: 'x', describe: 'Proxy URL', type: 'string' })
    .option('proxyUsername', {
      alias: 'pxu',
      describe: 'Proxy username',
      type: 'string',
    })
    .option('proxyPassword', {
      alias: 'pxp',
      describe: 'Proxy password',
      type: 'string',
    })
    .option('overwrite', {
      alias: 'o',
      describe: 'Overwrite existing files',
      type: 'boolean',
      default: false,
    })
    .option('filetypes', {
      alias: 'f',
      describe: 'File types to download (comma-separated)',
      type: 'array',
      default: ['bam', 'bam.bai'],
    })
    .option('loglevel', {
      alias: 'll',
      describe: 'Logging level (info, warn, error, debug)',
      type: 'string',
      default: 'info',
    })
    .option('logfile', {
      alias: 'lf',
      describe: 'Path to the log file',
      type: 'string',
    })
    .option('reportfile', {
      alias: 'r',
      describe: 'Path to the report file',
      type: 'string',
    })
    .option('filter', {
      alias: 'F',
      describe:
        'Filter expressions. Operators: = != > < >= <= (lexicographic), ~= (contains), ^= (starts with). Multiple filters use AND logic. Examples: "analysisType=SNV", "enrichmentKitName^=TwistExome"',
      type: 'array',
      default: [],
    })
    .option('latest', {
      describe:
        'Keep only the newest analysis per sample (highest analysis ID). Useful when samples have repeat sequencing.',
      type: 'boolean',
      default: false,
    })
    .option('range', {
      alias: 'g',
      describe: 'Genomic range for ranged download (e.g., chr1:1-100000)',
      type: 'string',
    })
    .option('bed', {
      alias: 'b',
      describe: 'Path to BED file containing multiple regions',
      type: 'string',
    })
    .option('unmapped', {
      alias: 'um',
      describe:
        'Extract unmapped reads from BAM files (reads with no reference assignment)',
      type: 'boolean',
      default: false,
    })
    .option('restoreArchived', {
      alias: 'ra',
      describe:
        'Restore archived files. Accepts "no", "ask" (default), "all", or "force".',
      type: 'string',
      default: 'ask',
    })
    .option('restorationFile', {
      alias: 'rf',
      describe:
        'Path and name for the awaiting-restoration JSON file (default: "awaiting-restoration.json")',
      type: 'string',
      default: 'awaiting-restoration.json',
    })
    .option('resumeArchivedDownloads', {
      alias: 'rad',
      describe:
        'Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed.',
      type: 'boolean',
      default: false,
    })
    .option('list-urls', {
      alias: 'U',
      describe:
        'List the direct download URLs for the selected files instead of downloading them. Useful for piping to other tools.',
      type: 'boolean',
      default: false,
    })
    .option('url-file', {
      describe:
        'Path to a file to save the download URLs when using --list-urls.',
      type: 'string',
    })
    .option('version', {
      alias: 'v',
      type: 'boolean',
      description: 'Show version information',
      default: false,
    })
    .help()
    .alias('help', 'h');
}

module.exports = { buildParser };
```

- [ ] **Step 2: Update `tests/unit/cli/args.test.js` to disable yargs's process exit**

Update the test to call `.exitProcess(false)`:

```js
test('parses required CLI options', async () => {
  const parser = buildParser([...]).exitProcess(false);
  // ...
});
```

Apply `.exitProcess(false)` to every test case.

- [ ] **Step 3: Run the test and verify it passes**

```bash
npm test -- --testPathPatterns=cli/args
```

Expected: 4/4 pass.

- [ ] **Step 4: Update `varvis-download.cjs` to use `buildParser`**

Replace `varvis-download.cjs:64-230` (the entire yargs chain plus `.argv` access) with:

```js
const { buildParser } = require('./js/cli/args.cjs');

/** @type {any} */
const argv = buildParser(hideBin(process.argv)).argv;
```

Also remove the now-unused `yargs` and `hideBin` requires from the top of the entry — but keep `hideBin` since it's still used.

- [ ] **Step 5: Run the full local gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

Expected: all pass; entry LOC drops by ~165.

- [ ] **Step 6: Commit**

```bash
git add js/cli/args.cjs tests/unit/cli/args.test.js varvis-download.cjs
git commit -m "refactor(cli): extract yargs setup to js/cli/args.cjs"
```

---

### Task C1.3: Test for `cli/configMerge.cjs`

**Files:**

- Create: `tests/unit/cli/configMerge.test.js`

- [ ] **Step 1: Write the test covering all precedence scenarios**

```js
const path = require('node:path');
const { mergeConfig } = require('../../../js/cli/configMerge.cjs');
const { ConfigurationError } = require('../../../js/errors.cjs');

describe('cli/configMerge.mergeConfig', () => {
  const baseArgv = {
    target: 'demo',
    username: 'alice',
    password: 'secret',
    analysisIds: ['A1'],
    filetypes: ['bam', 'bam.bai'],
    destination: '.',
    filter: [],
    restoreArchived: 'ask',
    restorationFile: 'awaiting-restoration.json',
    overwrite: false,
    unmapped: false,
    latest: false,
  };

  test('argv overrides config file', () => {
    const result = mergeConfig({
      argv: { ...baseArgv, destination: '/from-argv' },
      config: { destination: '/from-config' },
      env: {},
    });
    expect(result.destination).toBe('/from-argv');
  });

  test('env VARVIS_PASSWORD overrides config password', () => {
    const result = mergeConfig({
      argv: { ...baseArgv, password: undefined },
      config: { password: 'from-config' },
      env: { VARVIS_PASSWORD: 'from-env' },
    });
    expect(result.password).toBe('from-env');
  });

  test('argv password beats env password', () => {
    const result = mergeConfig({
      argv: { ...baseArgv, password: 'from-argv' },
      config: {},
      env: { VARVIS_PASSWORD: 'from-env' },
    });
    expect(result.password).toBe('from-argv');
  });

  test('missing target throws ConfigurationError', () => {
    expect(() =>
      mergeConfig({
        argv: { ...baseArgv, target: undefined },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);
  });

  test('missing username throws ConfigurationError', () => {
    expect(() =>
      mergeConfig({
        argv: { ...baseArgv, username: undefined },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);
  });

  test('missing password is allowed (prompt fallback)', () => {
    const result = mergeConfig({
      argv: { ...baseArgv, password: undefined },
      config: {},
      env: {},
    });
    expect(result.password).toBeUndefined();
  });

  test('--unmapped --bed combination throws ConfigurationError', () => {
    expect(() =>
      mergeConfig({
        argv: { ...baseArgv, unmapped: true, bed: '/some/file.bed' },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);
  });

  test('no analysis/sample/lims IDs without resume flag throws ConfigurationError', () => {
    expect(() =>
      mergeConfig({
        argv: { ...baseArgv, analysisIds: [] },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);
  });

  test('resume flag without IDs is allowed', () => {
    const result = mergeConfig({
      argv: { ...baseArgv, analysisIds: [], resumeArchivedDownloads: true },
      config: {},
      env: {},
    });
    expect(result.resumeArchivedDownloads).toBe(true);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
npm test -- --testPathPatterns=cli/configMerge
```

Expected: FAIL — `Cannot find module '.../js/cli/configMerge.cjs'` (and `errors.cjs` — create a stub for now).

- [ ] **Step 3: Create stub `js/errors.cjs` so the import resolves**

Write a minimal `js/errors.cjs` now (full version comes in Task C5.1):

```js
class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.exitCode = 1;
  }
}
class OperationalError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'OperationalError';
    this.exitCode = exitCode;
  }
}
module.exports = { ConfigurationError, OperationalError };
```

---

### Task C1.4: Extract `cli/configMerge.cjs`

**Files:**

- Create: `js/cli/configMerge.cjs`
- Modify: `varvis-download.cjs:247-334`

- [ ] **Step 1: Write the extracted module**

```js
const path = require('node:path');
const { ConfigurationError } = require('../errors.cjs');
const {
  normalizeArrayInput,
  normalizeFiletypes,
  normalizeStringOption,
} = require('../arrayUtils.cjs');
const { loadConfig } = require('../configUtils.cjs');

/**
 * Merges CLI argv, config file, and environment variables into a single FinalConfig.
 *
 * Precedence (highest wins): argv → env → config → undefined.
 * Validation runs AFTER all precedence is resolved. Password is allowed to remain
 * undefined here; downstream commands handle the interactive prompt fallback.
 *
 * @param   {object}                      sources         - Source bag.
 * @param   {object}                      sources.argv    - Parsed yargs argv.
 * @param   {object}                      sources.config  - Loaded config file content.
 * @param   {NodeJS.ProcessEnv|object}    sources.env     - Environment variables (typically process.env).
 * @returns {import('../types').FinalConfig}              - Validated merged config.
 * @throws  {import('../types').ConfigurationError}       - On missing required fields or invalid combinations.
 */
function mergeConfig({ argv, config, env }) {
  const normalizedDestination = normalizeStringOption(argv.destination);
  const normalizedRestorationFile = normalizeStringOption(argv.restorationFile);
  const normalizedUrlFile = normalizeStringOption(argv.urlFile);
  const normalizedRange = normalizeStringOption(argv.range);
  const normalizedBed = normalizeStringOption(argv.bed);

  const merged = {
    ...config,
    ...argv,
    target: argv.target || env.VARVIS_TARGET || config.target,
    username: argv.username || env.VARVIS_USER || config.username,
    password: argv.password || env.VARVIS_PASSWORD || config.password,
    filetypes: normalizeFiletypes(argv.filetypes, config.filetypes),
    analysisIds: normalizeArrayInput(argv.analysisIds, config.analysisIds, []),
    sampleIds: normalizeArrayInput(argv.sampleIds, config.sampleIds, []),
    limsIds: normalizeArrayInput(argv.limsIds, config.limsIds, []),
    filters: (argv.filter || config.filter || []).map((f) => f.trim()),
    destination:
      normalizedDestination !== '.'
        ? normalizedDestination
        : config.destination || '.',
    restoreArchived: argv.restoreArchived || config.restoreArchived || 'ask',
    restorationFile:
      normalizedRestorationFile ||
      config.restorationFile ||
      'awaiting-restoration.json',
    resumeArchivedDownloads:
      argv.resumeArchivedDownloads || config.resumeArchivedDownloads || false,
    listUrls: argv.listUrls || config.listUrls || false,
    urlFile: normalizedUrlFile || config.urlFile || null,
    range: normalizedRange || config.range || null,
    bed: normalizedBed || config.bed || null,
    unmapped: argv.unmapped ?? config.unmapped ?? false,
    latest: argv.latest ?? config.latest ?? false,
  };

  // Required fields (target, username) must be present after all precedence is resolved.
  if (!merged.target)
    throw new ConfigurationError('Missing required argument --target');
  if (!merged.username)
    throw new ConfigurationError('Missing required argument --username');

  // Conflict checks
  if (merged.unmapped && merged.bed) {
    throw new ConfigurationError(
      '--unmapped cannot be combined with --bed. Use --unmapped with --range (-g) instead.',
    );
  }

  // At least one of analysisIds, sampleIds, limsIds, or resumeArchivedDownloads.
  if (
    merged.analysisIds.length === 0 &&
    merged.sampleIds.length === 0 &&
    merged.limsIds.length === 0 &&
    !merged.resumeArchivedDownloads
  ) {
    throw new ConfigurationError(
      'You must provide at least one of: --analysisIds (-a), --sampleIds (-s), --limsIds (-l), or --resumeArchivedDownloads (rad).',
    );
  }

  return merged;
}

/**
 * Convenience wrapper that loads the config file from `argv.config` and merges everything.
 *
 * @param   {object}                      argv  - Parsed yargs argv.
 * @param   {NodeJS.ProcessEnv|object}    env   - Environment variables.
 * @returns {import('../types').FinalConfig}    - Validated merged config.
 */
function mergeFromArgv(argv, env) {
  const configFilePath = path.resolve(normalizeStringOption(argv.config));
  const config = loadConfig(configFilePath);
  return mergeConfig({ argv, config, env });
}

module.exports = { mergeConfig, mergeFromArgv };
```

- [ ] **Step 2: Run the test**

```bash
npm test -- --testPathPatterns=cli/configMerge
```

Expected: 9/9 pass.

- [ ] **Step 3: Update `varvis-download.cjs` to use `mergeFromArgv`**

Replace `varvis-download.cjs:247-334` (the entire config-loading, merging, validation, and destructuring block) with:

```js
const { mergeFromArgv } = require('./js/cli/configMerge.cjs');

/** @type {import('./js/types').FinalConfig} */
let finalConfig;
try {
  finalConfig = mergeFromArgv(argv, process.env);
} catch (error) {
  logger.error(`Error: ${error.message}`);
  process.exit(error.exitCode || 1);
}

const {
  target,
  username: userName,
  password,
  analysisIds,
  sampleIds,
  limsIds,
  destination,
  proxy,
  proxyUsername,
  proxyPassword,
  overwrite,
  filetypes,
  reportfile,
  filters,
  restoreArchived,
  restorationFile,
} = finalConfig;
```

- [ ] **Step 4: Now generate the configMerge JSON fixture (deferred from C0.2)**

Write `tests/unit/cli/configMerge-snapshot.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const { mergeConfig } = require('../../../js/cli/configMerge.cjs');

test('configMerge produces stable output for fixture input', () => {
  const input = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../fixtures/cli-output/configMerge-input.json'),
      'utf8',
    ),
  );
  const argv = {};
  for (const arg of input.argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    argv[key] = value.includes(',') ? value.split(',') : value;
  }
  // Provide required fields explicitly
  argv.analysisIds = argv.analysisIds || [];
  argv.sampleIds = argv.sampleIds || [];
  argv.limsIds = argv.limsIds || [];
  argv.filetypes = argv.filetypes || [];
  argv.filter = argv.filter || [];
  argv.destination = argv.destination || '.';
  argv.restoreArchived = 'ask';
  argv.restorationFile = 'awaiting-restoration.json';

  const merged = mergeConfig({ argv, config: input.configFile, env: {} });
  const snapshotPath = path.join(
    __dirname,
    '../../fixtures/cli-output/configMerge.json',
  );
  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, JSON.stringify(merged, null, 2) + '\n');
  }
  const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  expect(merged).toEqual(expected);
});
```

Run it once to generate the snapshot, then re-run to verify:

```bash
npm test -- --testPathPatterns=cli/configMerge-snapshot
```

- [ ] **Step 5: Commit**

```bash
git add js/cli/configMerge.cjs js/errors.cjs tests/unit/cli/configMerge.test.js tests/unit/cli/configMerge-snapshot.test.js tests/fixtures/cli-output/configMerge.json varvis-download.cjs
git commit -m "refactor(cli): extract config-merge + validation to js/cli/configMerge.cjs with explicit credential precedence"
```

---

### Task C1.5: Test for `cli/versionInfo.cjs`

**Files:**

- Create: `tests/unit/cli/versionInfo.test.js`

- [ ] **Step 1: Write the test**

```js
const { formatVersionInfo } = require('../../../js/cli/versionInfo.cjs');

describe('cli/versionInfo.formatVersionInfo', () => {
  test('returns multi-line string with required fields', () => {
    const out = formatVersionInfo({
      name: 'varvis-download',
      version: '0.31.1',
      author: 'Bernt Popp',
      license: 'GPL-3.0',
      repository: { url: 'git+https://github.com/...' },
      lastModified: '2026-05-26',
      logo: 'LOGO',
    });
    expect(out).toContain('varvis-download');
    expect(out).toContain('Version 0.31.1');
    expect(out).toContain('Author: Bernt Popp');
    expect(out).toContain('Repository: git+https://github.com/...');
    expect(out).toContain('License: GPL-3.0');
    expect(out).toContain('Date Last Modified: 2026-05-26');
    expect(out).toContain('LOGO');
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
npm test -- --testPathPatterns=cli/versionInfo
```

Expected: FAIL — module not found.

---

### Task C1.6: Extract `cli/versionInfo.cjs`

**Files:**

- Create: `js/cli/versionInfo.cjs`
- Modify: `varvis-download.cjs:235-245`

- [ ] **Step 1: Write the extracted module**

```js
/**
 * Formats version output for the --version flag.
 *
 * Side-effect free: callers print the returned string and call process.exit(0).
 *
 * @param   {object} info              - Version info bag.
 * @param   {string} info.name         - Package name.
 * @param   {string} info.version      - Package version.
 * @param   {string} info.author       - Package author.
 * @param   {string} info.license      - SPDX license identifier.
 * @param   {{url: string}} info.repository - package.json repository field.
 * @param   {string} info.lastModified - Result of getLastModifiedDate(__filename).
 * @param   {string} info.logo         - ASCII logo to print first.
 * @returns {string}                   - Multi-line version banner.
 */
function formatVersionInfo({
  name,
  version,
  author,
  license,
  repository,
  lastModified,
  logo,
}) {
  return [
    logo,
    `${name} - Version ${version}`,
    `Date Last Modified: ${lastModified}`,
    `Author: ${author}`,
    `Repository: ${repository.url}`,
    `License: ${license}`,
  ].join('\n');
}

module.exports = { formatVersionInfo };
```

- [ ] **Step 2: Run the test**

```bash
npm test -- --testPathPatterns=cli/versionInfo
```

Expected: 1/1 pass.

- [ ] **Step 3: Update `varvis-download.cjs:235-245`**

Replace the inline version-print block with:

```js
const { formatVersionInfo } = require('./js/cli/versionInfo.cjs');

if (argv.version) {
  const logo = loadLogo();
  const lastModified = getLastModifiedDate(__filename);
  console.log(
    formatVersionInfo({
      name,
      version,
      author,
      license,
      repository,
      lastModified,
      logo,
    }),
  );
  process.exit(0);
}
```

- [ ] **Step 4: Full gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

- [ ] **Step 5: Commit**

```bash
git add js/cli/versionInfo.cjs tests/unit/cli/versionInfo.test.js varvis-download.cjs
git commit -m "refactor(cli): extract --version formatter to js/cli/versionInfo.cjs"
```

---

### Task C1.7: Phase C1 verification

- [ ] **Step 1: Verify entry LOC dropped meaningfully**

```bash
wc -l varvis-download.cjs
```

Expected: ~700 (was 1051). If higher, recheck C1.2/C1.4/C1.6 wiring.

- [ ] **Step 2: Push**

```bash
git push
```

Wait for CI green.

---

## Phase C2 — `net/` + `io/` leaves

### Task C2.1: Test + extract `net/httpAgent.cjs`

**Files:**

- Create: `tests/unit/net/httpAgent.test.js`
- Create: `js/net/httpAgent.cjs`
- Modify: `varvis-download.cjs:336-346`

- [ ] **Step 1: Test first**

```bash
mkdir -p tests/unit/net js/net
```

Write `tests/unit/net/httpAgent.test.js`:

```js
const { createHttpAgent } = require('../../../js/net/httpAgent.cjs');

describe('net/httpAgent.createHttpAgent', () => {
  test('returns an agent without proxy', () => {
    const agent = createHttpAgent({});
    expect(agent).toBeDefined();
    expect(typeof agent.dispatch).toBe('function');
  });

  test('returns a proxy agent when proxy URL provided', () => {
    const agent = createHttpAgent({ proxy: 'http://example.test:8080' });
    expect(agent).toBeDefined();
  });

  test('proxy with credentials does not throw', () => {
    expect(() =>
      createHttpAgent({
        proxy: 'http://example.test:8080',
        proxyUsername: 'u',
        proxyPassword: 'p',
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --testPathPatterns=net/httpAgent
```

- [ ] **Step 3: Write `js/net/httpAgent.cjs`**

```js
const { CookieJar } = require('tough-cookie');
const { cookie } = require('http-cookie-agent/undici');
const { ProxyAgent, Agent } = require('undici');

/**
 * Creates an HTTP agent configured with proxy and cookie support.
 *
 * @param   {object}  opts                - Agent options.
 * @param   {string=} opts.proxy          - Proxy URL (if any).
 * @param   {string=} opts.proxyUsername  - Proxy username.
 * @param   {string=} opts.proxyPassword  - Proxy password.
 * @returns {Agent | ProxyAgent}          - Configured undici agent with cookie support.
 */
function createHttpAgent({ proxy, proxyUsername, proxyPassword }) {
  const jar = new CookieJar();

  if (!proxy) {
    return new Agent().compose(cookie({ jar }));
  }

  /** @type {any} */
  const agentOptions = { uri: proxy };
  if (proxyUsername && proxyPassword) {
    agentOptions.auth = `${proxyUsername}:${proxyPassword}`;
  }
  return new ProxyAgent(agentOptions).compose(cookie({ jar }));
}

module.exports = { createHttpAgent };
```

- [ ] **Step 4: Run test — should pass**

```bash
npm test -- --testPathPatterns=net/httpAgent
```

Expected: 3/3 pass.

- [ ] **Step 5: Update `varvis-download.cjs:336-346`**

Replace the inline agent setup block with:

```js
const { createHttpAgent } = require('./js/net/httpAgent.cjs');

const agent = createHttpAgent({
  proxy: finalConfig.proxy,
  proxyUsername: finalConfig.proxyUsername,
  proxyPassword: finalConfig.proxyPassword,
});
```

Also remove the now-unused `tough-cookie`, `http-cookie-agent/undici`, `ProxyAgent`, `Agent` top-level requires from the entry.

- [ ] **Step 6: Commit**

```bash
git add js/net/httpAgent.cjs tests/unit/net/httpAgent.test.js varvis-download.cjs
git commit -m "refactor(net): extract HTTP agent setup to js/net/httpAgent.cjs"
```

---

### Task C2.2: Test + extract `io/passwordPrompt.cjs`

**Files:**

- Create: `tests/unit/io/passwordPrompt.test.js`
- Create: `js/io/passwordPrompt.cjs`
- Modify: `varvis-download.cjs:478-495` and `527-547` (the two duplicated prompt blocks)

- [ ] **Step 1: Test**

```bash
mkdir -p tests/unit/io js/io
```

Write `tests/unit/io/passwordPrompt.test.js`:

```js
const { promptForPassword } = require('../../../js/io/passwordPrompt.cjs');

describe('io/passwordPrompt.promptForPassword', () => {
  test('exists and is async', () => {
    expect(typeof promptForPassword).toBe('function');
    expect(promptForPassword.constructor.name).toBe('AsyncFunction');
  });

  // Integration of stdin TTY is hard to unit test; verify the signature and
  // that the function awaits a readline question with mock injection.
  test('resolves to the typed string when stdin is provided via deps', async () => {
    const mockRl = {
      question: (prompt, cb) => cb('typed-password'),
      close: () => {},
    };
    const result = await promptForPassword({
      createInterface: () => mockRl,
      stdin: process.stdin,
      stdout: process.stdout,
    });
    expect(result).toBe('typed-password');
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --testPathPatterns=io/passwordPrompt
```

- [ ] **Step 3: Write `js/io/passwordPrompt.cjs`**

```js
const readline = require('node:readline');
const MuteStream = require('mute-stream');

/**
 * Prompts the user for a password on the terminal, with input muted.
 *
 * Dependencies are injectable for testability.
 *
 * @param   {object}            deps                  - Injected dependencies.
 * @param   {Function=}         deps.createInterface  - readline.createInterface factory (defaults to readline.createInterface).
 * @param   {NodeJS.ReadStream=} deps.stdin           - Input stream (defaults to process.stdin).
 * @param   {NodeJS.WriteStream=} deps.stdout         - Output stream (defaults to process.stdout).
 * @returns {Promise<string>}                         - The typed password.
 */
async function promptForPassword(deps = {}) {
  const createInterface = deps.createInterface || readline.createInterface;
  const stdin = deps.stdin || process.stdin;
  const stdout = deps.stdout || process.stdout;

  const mute = new MuteStream();
  mute.pipe(stdout);

  const rl = createInterface({
    input: stdin,
    output: mute,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question('Please enter your Varvis password: ', (input) => {
      rl.close();
      mute.end();
      stdout.write('\n'); // muted input doesn't emit a newline
      resolve(input);
    });
  });
}

module.exports = { promptForPassword };
```

- [ ] **Step 4: Run — should pass**

```bash
npm test -- --testPathPatterns=io/passwordPrompt
```

- [ ] **Step 5: Update both prompt sites in `varvis-download.cjs`**

Replace the two duplicated prompt blocks (lines ~478-495 and ~527-547) with single calls:

```js
const { promptForPassword } = require('./js/io/passwordPrompt.cjs');
// ... later in main():
let finalPassword = password;
if (!finalPassword) {
  finalPassword = await promptForPassword();
}
```

- [ ] **Step 6: Commit**

```bash
git add js/io/passwordPrompt.cjs tests/unit/io/passwordPrompt.test.js varvis-download.cjs
git commit -m "refactor(io): extract password prompt to js/io/passwordPrompt.cjs (deduplicate two call sites)"
```

---

### Task C2.3: Test + extract `io/urlListing.cjs`

**Files:**

- Create: `tests/unit/io/urlListing.test.js`
- Create: `js/io/urlListing.cjs`
- Modify: `varvis-download.cjs:357-385`

- [ ] **Step 1: Test**

Write `tests/unit/io/urlListing.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { handleUrlListing } = require('../../../js/io/urlListing.cjs');

describe('io/urlListing.handleUrlListing', () => {
  const mockLogger = { info: jest.fn(), error: jest.fn() };
  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
  });

  test('logs info when no URLs to list', () => {
    handleUrlListing([], null, mockLogger);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('No files matching'),
    );
  });

  test('prints URLs to stdout and writes to file when path provided', () => {
    const tmpFile = path.join(os.tmpdir(), `urls-${Date.now()}.txt`);
    const urls = ['https://a.example/1', 'https://b.example/2'];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    handleUrlListing(urls, tmpFile, mockLogger);

    expect(consoleSpy).toHaveBeenCalledWith(urls.join('\n'));
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(urls.join('\n') + '\n');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully saved 2 URLs'),
    );

    consoleSpy.mockRestore();
    fs.unlinkSync(tmpFile);
  });

  test('logs error when file write fails', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    handleUrlListing(['x'], '/nonexistent/dir/file.txt', mockLogger);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write URLs'),
    );
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --testPathPatterns=io/urlListing
```

- [ ] **Step 3: Write `js/io/urlListing.cjs` (extract verbatim from entry)**

```js
const fs = require('node:fs');

/**
 * Handles output of download URLs: prints to console, optionally writes to a file.
 *
 * @param {string[]}              urls     - URLs to print/save.
 * @param {string|null}           filePath - Output file path, or null to skip file write.
 * @param {import('winston').Logger} logger - Logger instance.
 * @returns {void}
 */
function handleUrlListing(urls, filePath, logger) {
  if (urls.length === 0) {
    logger.info('No files matching the criteria were found. No URLs to list.');
    return;
  }

  const urlOutput = urls.join('\n');
  console.log(urlOutput);

  if (filePath) {
    try {
      fs.writeFileSync(filePath, urlOutput + '\n');
      logger.info(`Successfully saved ${urls.length} URLs to ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to write URLs to file ${filePath}: ${error.message}`,
      );
    }
  }
}

module.exports = { handleUrlListing };
```

- [ ] **Step 4: Run — should pass; update entry to import from new module**

```bash
npm test -- --testPathPatterns=io/urlListing
```

Remove the inline `handleUrlListing` function from `varvis-download.cjs:357-385`. Add `const { handleUrlListing } = require('./js/io/urlListing.cjs');` to the requires block.

- [ ] **Step 5: Commit**

```bash
git add js/io/urlListing.cjs tests/unit/io/urlListing.test.js varvis-download.cjs
git commit -m "refactor(io): extract handleUrlListing to js/io/urlListing.cjs"
```

---

### Task C2.4: Phase C2 verification

- [ ] **Step 1: Full gate + push**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git push
```

---

## Phase C3 — `io/regionParsing` + `download/urlRefresh`

### Task C3.1: Test + extract `io/regionParsing.cjs`

**Files:**

- Create: `tests/unit/io/regionParsing.test.js`
- Create: `js/io/regionParsing.cjs`
- Modify: `varvis-download.cjs:629-680`

- [ ] **Step 1: Test**

Write `tests/unit/io/regionParsing.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseRegions } = require('../../../js/io/regionParsing.cjs');

describe('io/regionParsing.parseRegions', () => {
  const mockLogger = { info: jest.fn(), error: jest.fn() };
  beforeEach(() => mockLogger.info.mockClear());

  test('returns empty regions when neither --range nor --bed', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: null, bed: null },
      mockLogger,
    );
    expect(regions).toEqual([]);
    expect(tempBedPath).toBeUndefined();
  });

  test('parses --range "chr1:100-200" to regions + writes temp BED', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1:100-200', bed: null },
      mockLogger,
    );
    expect(regions).toEqual(['chr1:100-200']);
    expect(fs.existsSync(tempBedPath)).toBe(true);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toContain('chr1\t100\t200');
    fs.unlinkSync(tempBedPath);
  });

  test('parses chromosome-only --range "chr1" to full-chrom region', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1', bed: null },
      mockLogger,
    );
    expect(regions).toEqual(['chr1']);
    const bed = fs.readFileSync(tempBedPath, 'utf8');
    expect(bed).toContain('chr1\t1\t300000000');
    fs.unlinkSync(tempBedPath);
  });

  test('parses multi-region --range "chr1:1-10 chr2:5-15"', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1:1-10 chr2:5-15', bed: null },
      mockLogger,
    );
    expect(regions).toEqual(['chr1:1-10', 'chr2:5-15']);
    const bed = fs.readFileSync(tempBedPath, 'utf8');
    expect(bed).toContain('chr1\t1\t10');
    expect(bed).toContain('chr2\t5\t15');
    fs.unlinkSync(tempBedPath);
  });

  test('parses --bed file', () => {
    const bedPath = path.join(os.tmpdir(), `input-${Date.now()}.bed`);
    fs.writeFileSync(bedPath, '# comment\nchr1\t10\t20\nchr2\t30\t40\n');
    const { regions, tempBedPath } = parseRegions(
      { range: null, bed: bedPath },
      mockLogger,
    );
    expect(regions).toEqual(['chr1:10-20', 'chr2:30-40']);
    fs.unlinkSync(bedPath);
    fs.unlinkSync(tempBedPath);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=io/regionParsing
```

- [ ] **Step 3: Write `js/io/regionParsing.cjs`**

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OperationalError } = require('../errors.cjs');

/**
 * Parses CLI --range and --bed into a regions list + a temp BED file path.
 *
 * @param   {object}                     opts        - Region options.
 * @param   {string|null}                opts.range  - CLI range string (e.g. "chr1:1-100" or space-separated).
 * @param   {string|null}                opts.bed    - Path to user-provided BED file.
 * @param   {import('winston').Logger}   logger      - Logger.
 * @returns {{regions: string[], tempBedPath?: string}} - Parsed regions and (if any) temp BED file.
 * @throws  {OperationalError}                       - If --bed file cannot be read.
 */
function parseRegions(opts, logger) {
  if (opts.range) {
    const regions = opts.range.split(' ');
    logger.info(`Using regions from command line: ${regions}`);

    const tempBedPath = path.join(os.tmpdir(), 'regions.bed');
    const bedContent = regions
      .map((region) => {
        const [chr, pos] = region.split(':');
        if (!pos) {
          return `${chr}\t1\t300000000`;
        }
        const [start, end] = pos.split('-');
        return `${chr}\t${start}\t${end}`;
      })
      .join('\n');

    fs.writeFileSync(tempBedPath, bedContent);
    logger.info(`Generated temporary BED file: ${tempBedPath}`);
    return { regions, tempBedPath };
  }

  if (opts.bed) {
    let bedFileContent;
    try {
      bedFileContent = fs.readFileSync(opts.bed, 'utf8');
    } catch (error) {
      throw new OperationalError(`Error reading BED file: ${error.message}`, 1);
    }
    const regions = bedFileContent
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [chr, start, end] = line.split('\t');
        return `${chr}:${start}-${end}`;
      });
    logger.info(`Using regions from BED file: ${regions}`);

    const tempBedPath = path.join(os.tmpdir(), 'regions.bed');
    fs.writeFileSync(tempBedPath, bedFileContent);
    logger.info(`Generated temporary BED file: ${tempBedPath}`);
    return { regions, tempBedPath };
  }

  logger.info('No regions provided. Proceeding with full file download.');
  return { regions: [] };
}

module.exports = { parseRegions };
```

- [ ] **Step 4: Run — passes; update entry**

```bash
npm test -- --testPathPatterns=io/regionParsing
```

Replace `varvis-download.cjs:629-680` (the region-parsing block in main) with:

```js
const { parseRegions } = require('./js/io/regionParsing.cjs');
// inside main():
const { regions, tempBedPath } = parseRegions(
  { range: finalConfig.range, bed: finalConfig.bed },
  logger,
);
```

- [ ] **Step 5: Commit**

```bash
git add js/io/regionParsing.cjs tests/unit/io/regionParsing.test.js varvis-download.cjs
git commit -m "refactor(io): extract region parsing to js/io/regionParsing.cjs"
```

---

### Task C3.2: Test + extract `download/urlRefresh.cjs`

**Files:**

- Create: `tests/unit/download/urlRefresh.test.js`
- Create: `js/download/urlRefresh.cjs`
- Modify: `varvis-download.cjs:402-463`

- [ ] **Step 1: Test**

```bash
mkdir -p tests/unit/download js/download
```

Write `tests/unit/download/urlRefresh.test.js`:

```js
const { getValidDownloadUrl } = require('../../../js/download/urlRefresh.cjs');

jest.mock('../../../js/urlUtils.cjs', () => ({
  isUrlExpiringSoon: jest.fn(),
  getUrlRemainingTime: jest.fn(() => 0),
  formatRemainingTime: jest.fn(() => '0s'),
}));
jest.mock('../../../js/fetchUtils.cjs', () => ({
  refreshDownloadUrls: jest.fn(),
}));

const { isUrlExpiringSoon } = require('../../../js/urlUtils.cjs');
const { refreshDownloadUrls } = require('../../../js/fetchUtils.cjs');

describe('download/urlRefresh.getValidDownloadUrl', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    isUrlExpiringSoon.mockReturnValue(false);
  });

  test('returns the existing URL when not expiring', async () => {
    const fileDict = {
      'a.bam': { downloadLink: 'https://valid', analysisId: 'A1' },
    };
    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );
    expect(url).toBe('https://valid');
    expect(refreshDownloadUrls).not.toHaveBeenCalled();
  });

  test('throws when file not in dict', async () => {
    await expect(
      getValidDownloadUrl({}, 'missing.bam', 'demo', 'tok', {}, mockLogger),
    ).rejects.toThrow('No download link found');
  });

  test('refreshes when URL is expiring', async () => {
    isUrlExpiringSoon.mockReturnValue(true);
    refreshDownloadUrls.mockResolvedValue({
      'a.bam': { downloadLink: 'https://fresh' },
    });
    const fileDict = {
      'a.bam': { downloadLink: 'https://stale', analysisId: 'A1' },
    };
    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );
    expect(url).toBe('https://fresh');
    expect(fileDict['a.bam'].downloadLink).toBe('https://fresh');
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=download/urlRefresh
```

- [ ] **Step 3: Write `js/download/urlRefresh.cjs`**

```js
const {
  isUrlExpiringSoon,
  getUrlRemainingTime,
  formatRemainingTime,
} = require('../urlUtils.cjs');
const { refreshDownloadUrls } = require('../fetchUtils.cjs');

/**
 * Returns a valid download URL for the file, refreshing if it's near expiry.
 *
 * @param   {import('../types').FileDict}        fileDict - File dictionary.
 * @param   {string}                             fileName - Name of file to fetch URL for.
 * @param   {string}                             target   - Varvis target.
 * @param   {string}                             token    - CSRF token.
 * @param   {import('undici').Agent}             agent    - HTTP agent.
 * @param   {import('winston').Logger}           logger   - Logger.
 * @returns {Promise<string>}                             - Valid (refreshed if needed) download URL.
 * @throws  {Error}                                       - If the file or its downloadLink is missing.
 */
async function getValidDownloadUrl(
  fileDict,
  fileName,
  target,
  token,
  agent,
  logger,
) {
  const file = fileDict[fileName];
  if (!file || !file.downloadLink) {
    throw new Error(`No download link found for file: ${fileName}`);
  }

  const downloadLink = file.downloadLink;

  if (!isUrlExpiringSoon(downloadLink)) {
    return downloadLink;
  }

  const remainingTime = getUrlRemainingTime(downloadLink);
  const formattedTime =
    remainingTime !== null ? formatRemainingTime(remainingTime) : 'unknown';
  logger.warn(
    `Download URL for ${fileName} is expiring soon (${formattedTime} remaining). Refreshing...`,
  );

  const analysisId = file.analysisId;
  if (!analysisId) {
    logger.warn(
      `No analysisId found for ${fileName}, using potentially expired URL`,
    );
    return downloadLink;
  }

  const freshFileDict = await refreshDownloadUrls(
    analysisId,
    target,
    token,
    agent,
    logger,
  );

  for (const [fname, freshFile] of Object.entries(freshFileDict)) {
    if (fileDict[fname]) {
      fileDict[fname].downloadLink = freshFile.downloadLink;
    }
  }

  if (freshFileDict[fileName]) {
    logger.info(`URL refreshed successfully for ${fileName}`);
    return freshFileDict[fileName].downloadLink;
  }

  logger.warn(
    `Could not find refreshed URL for ${fileName}, using original URL`,
  );
  return downloadLink;
}

module.exports = { getValidDownloadUrl };
```

- [ ] **Step 4: Run — passes; update entry**

```bash
npm test -- --testPathPatterns=download/urlRefresh
```

Remove the inline `getValidDownloadUrl` function from `varvis-download.cjs:402-463`. Add `const { getValidDownloadUrl } = require('./js/download/urlRefresh.cjs');` to the requires block.

- [ ] **Step 5: Commit**

```bash
git add js/download/urlRefresh.cjs tests/unit/download/urlRefresh.test.js varvis-download.cjs
git commit -m "refactor(download): extract URL-refresh logic to js/download/urlRefresh.cjs"
```

---

### Task C3.3: Phase C3 verification

- [ ] **Step 1: Full gate + push**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git push
```

---

## Phase C4 — Download handlers + commonDownload helper

### Task C4.1: Test + create `download/commonDownload.cjs`

**Files:**

- Create: `tests/unit/download/commonDownload.test.js`
- Create: `js/download/commonDownload.cjs`

This module captures the duplicated "download primary file + optionally download index" pattern shared by BAM and VCF full downloads.

- [ ] **Step 1: Test**

Write `tests/unit/download/commonDownload.test.js`:

```js
const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');

jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));
const { downloadFile } = require('../../../js/fileUtils.cjs');

describe('download/commonDownload.fullDownloadWithOptionalIndex', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const mockDeps = {
    agent: {},
    rl: {},
    logger: mockLogger,
    metrics: {
      startTime: 0,
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
    },
  };
  beforeEach(() => jest.clearAllMocks());

  test('downloads primary file when no index URL', async () => {
    await fullDownloadWithOptionalIndex(
      {
        primary: { url: 'https://primary', path: '/tmp/file.bam' },
        index: null,
        overwrite: false,
      },
      mockDeps,
    );
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  test('downloads primary then index when both provided', async () => {
    await fullDownloadWithOptionalIndex(
      {
        primary: { url: 'https://primary', path: '/tmp/file.bam' },
        index: {
          url: 'https://index',
          path: '/tmp/file.bam.bai',
          label: '.bai',
        },
        overwrite: false,
      },
      mockDeps,
    );
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });

  test('logs warning when index download fails', async () => {
    downloadFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('index 404'));
    await fullDownloadWithOptionalIndex(
      {
        primary: { url: 'https://primary', path: '/tmp/file.bam' },
        index: {
          url: 'https://index',
          path: '/tmp/file.bam.bai',
          label: '.bai',
        },
        overwrite: false,
      },
      mockDeps,
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download index'),
    );
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=download/commonDownload
```

- [ ] **Step 3: Write `js/download/commonDownload.cjs`**

```js
const { downloadFile } = require('../fileUtils.cjs');

/**
 * Shared full-download flow: download primary file, then optionally download index.
 * Used by both BAM and VCF full-download paths.
 *
 * Index failures are logged but do not throw — they're recoverable per the spec.
 * Primary failures are thrown by downloadFile and bubble up to the caller's per-file catch.
 *
 * @param   {object}            args                - Args bag.
 * @param   {{url: string, path: string}} args.primary - Primary file URL + output path.
 * @param   {{url: string, path: string, label: string} | null} args.index - Optional index URL + path + label.
 * @param   {boolean}           args.overwrite      - Overwrite existing files.
 * @param   {import('../types').CommandDeps} deps   - Injected deps (agent, rl, logger, metrics).
 * @returns {Promise<void>}
 */
async function fullDownloadWithOptionalIndex(
  { primary, index, overwrite },
  deps,
) {
  const { agent, rl, logger, metrics } = deps;

  await downloadFile(
    primary.url,
    primary.path,
    overwrite,
    agent,
    rl,
    logger,
    metrics,
  );

  if (!index) {
    return;
  }

  logger.info(`Downloading optional index file: ${index.label}`);
  try {
    await downloadFile(
      index.url,
      index.path,
      overwrite,
      agent,
      rl,
      logger,
      metrics,
    );
  } catch (indexError) {
    logger.warn(
      `Failed to download index file ${index.label}: ${indexError.message}`,
    );
  }
}

module.exports = { fullDownloadWithOptionalIndex };
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- --testPathPatterns=download/commonDownload
```

- [ ] **Step 5: Commit**

```bash
git add js/download/commonDownload.cjs tests/unit/download/commonDownload.test.js
git commit -m "refactor(download): create shared full-download + optional-index helper"
```

---

### Task C4.2: Test + extract `download/bamHandler.cjs`

**Files:**

- Create: `tests/unit/download/bamHandler.test.js`
- Create: `js/download/bamHandler.cjs`
- Modify: `varvis-download.cjs:764-897` (the BAM branch of the inner loop)

- [ ] **Step 1: Test (smoke level — full behavioral coverage lives in tests/integration)**

Write `tests/unit/download/bamHandler.test.js`:

```js
const { handleBamFile } = require('../../../js/download/bamHandler.cjs');

jest.mock('../../../js/download/urlRefresh.cjs', () => ({
  getValidDownloadUrl: jest.fn(async (_, name) => `https://${name}`),
}));
jest.mock('../../../js/urlUtils.cjs', () => ({
  isUrlExpiringSoon: jest.fn(() => false),
}));
jest.mock('../../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  unmappedDownloadBAM: jest.fn(),
  indexBAM: jest.fn(),
  generateOutputFileName: jest.fn((name) => `out_${name}`),
}));
jest.mock('../../../js/download/commonDownload.cjs', () => ({
  fullDownloadWithOptionalIndex: jest.fn(),
}));

const {
  rangedDownloadBAM,
  indexBAM,
  ensureIndexFile,
} = require('../../../js/rangedUtils.cjs');
const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');

describe('download/bamHandler.handleBamFile', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const baseDeps = {
    agent: {},
    rl: {},
    logger: mockLogger,
    metrics: {
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
      startTime: 0,
    },
    authService: { token: 'tok' },
  };
  const baseFileDict = {
    'sample.bam': { downloadLink: 'https://primary', analysisId: 'A1' },
    'sample.bam.bai': { downloadLink: 'https://index', analysisId: 'A1' },
  };

  beforeEach(() => jest.clearAllMocks());

  test('ranged download with regions calls rangedDownloadBAM + ensureIndexFile + indexBAM', async () => {
    await handleBamFile(
      {
        fileName: 'sample.bam',
        fileDict: { ...baseFileDict },
        regions: ['chr1:1-100'],
        tempBedPath: '/tmp/regions.bed',
        finalConfig: { unmapped: false, destination: '/tmp', overwrite: false },
        target: 'demo',
      },
      baseDeps,
    );
    expect(ensureIndexFile).toHaveBeenCalled();
    expect(rangedDownloadBAM).toHaveBeenCalled();
    expect(indexBAM).toHaveBeenCalled();
    expect(fullDownloadWithOptionalIndex).not.toHaveBeenCalled();
  });

  test('full download (no regions) calls commonDownload', async () => {
    await handleBamFile(
      {
        fileName: 'sample.bam',
        fileDict: { ...baseFileDict },
        regions: [],
        finalConfig: { unmapped: false, destination: '/tmp', overwrite: false },
        target: 'demo',
      },
      baseDeps,
    );
    expect(fullDownloadWithOptionalIndex).toHaveBeenCalled();
    expect(rangedDownloadBAM).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=download/bamHandler
```

- [ ] **Step 3: Write `js/download/bamHandler.cjs`**

```js
const path = require('node:path');
const { getValidDownloadUrl } = require('./urlRefresh.cjs');
const { isUrlExpiringSoon } = require('../urlUtils.cjs');
const {
  ensureIndexFile,
  rangedDownloadBAM,
  unmappedDownloadBAM,
  indexBAM,
  generateOutputFileName,
} = require('../rangedUtils.cjs');
const { fullDownloadWithOptionalIndex } = require('./commonDownload.cjs');

/**
 * Handles download of a single BAM file: ranged, unmapped-only, or full.
 *
 * Tier-3 (recoverable) errors from rangedDownloadBAM/unmappedDownloadBAM/downloadFile
 * are caught and logged here so the caller can continue with the next file.
 *
 * Tier-2 (fatal) errors from getValidDownloadUrl/ensureIndexFile propagate.
 *
 * @param   {object}                                args                  - Args.
 * @param   {string}                                args.fileName         - BAM file name.
 * @param   {import('../types').FileDict}           args.fileDict         - File dictionary.
 * @param   {string[]}                              args.regions          - Genomic regions.
 * @param   {string=}                               args.tempBedPath      - Temp BED file path.
 * @param   {import('../types').FinalConfig}        args.finalConfig      - Final config.
 * @param   {string}                                args.target           - Varvis target.
 * @param   {import('../types').CommandDeps}        deps                  - Injected deps.
 * @returns {Promise<void>}
 */
async function handleBamFile(args, deps) {
  const { fileName, fileDict, regions, tempBedPath, finalConfig, target } =
    args;
  const { agent, logger, metrics, authService } = deps;
  const { destination, overwrite, unmapped } = finalConfig;

  const downloadLink = await getValidDownloadUrl(
    fileDict,
    fileName,
    target,
    authService.token,
    agent,
    logger,
  );
  const outputFile = path.join(
    destination,
    generateOutputFileName(fileName, regions, logger),
  );

  const indexFileName = `${fileName}.bai`;
  let indexFileUrl = fileDict[indexFileName]?.downloadLink;
  if (indexFileUrl && isUrlExpiringSoon(indexFileUrl)) {
    indexFileUrl = await getValidDownloadUrl(
      fileDict,
      indexFileName,
      target,
      authService.token,
      agent,
      logger,
    );
  }
  const indexFilePath = path.join(destination, indexFileName);

  if (regions.length === 0 && !unmapped) {
    // Full download path
    await fullDownloadWithOptionalIndex(
      {
        primary: { url: downloadLink, path: outputFile },
        index: indexFileUrl
          ? { url: indexFileUrl, path: indexFilePath, label: indexFileName }
          : null,
        overwrite,
      },
      deps,
    );
    try {
      await indexBAM(outputFile, logger, overwrite);
    } catch (error) {
      logger.error(`Error indexing BAM ${outputFile}: ${error.message}`);
    }
    return;
  }

  // Ranged or unmapped paths both require an index file.
  if (!indexFileUrl) {
    logger.error(
      `Index file for BAM (${fileName}) not found. Ranged/unmapped downloads require .bai index. Skipping.`,
    );
    return;
  }
  await ensureIndexFile(
    downloadLink,
    indexFileUrl,
    indexFilePath,
    agent,
    deps.rl,
    logger,
    metrics,
    overwrite,
  );

  if (regions.length > 0) {
    try {
      const modeLabel = unmapped ? 'ranged + unmapped' : 'ranged';
      logger.info(`Performing ${modeLabel} download for BAM file: ${fileName}`);
      await rangedDownloadBAM(
        downloadLink,
        tempBedPath,
        outputFile,
        indexFilePath,
        logger,
        metrics,
        overwrite,
        unmapped,
        regions,
      );
      await indexBAM(outputFile, logger, overwrite);
    } catch (error) {
      logger.error(
        `Error during ranged download for ${fileName}: ${error.message}`,
      );
    }
    return;
  }

  // unmapped-only (no regions)
  const unmappedOutputFile = path.join(
    destination,
    generateOutputFileName(fileName, ['unmapped'], logger),
  );
  try {
    logger.info(`Extracting unmapped reads from BAM file: ${fileName}`);
    await unmappedDownloadBAM(
      downloadLink,
      unmappedOutputFile,
      indexFilePath,
      logger,
      metrics,
      overwrite,
    );
    await indexBAM(unmappedOutputFile, logger, overwrite);
  } catch (error) {
    logger.error(
      `Error extracting unmapped reads from ${fileName}: ${error.message}`,
    );
  }
}

module.exports = { handleBamFile };
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- --testPathPatterns=download/bamHandler
```

- [ ] **Step 5: Commit (entry not yet updated — that lands in C5)**

```bash
git add js/download/bamHandler.cjs tests/unit/download/bamHandler.test.js
git commit -m "refactor(download): extract BAM handler to js/download/bamHandler.cjs"
```

---

### Task C4.3: Test + extract `download/vcfHandler.cjs`

**Files:**

- Create: `tests/unit/download/vcfHandler.test.js`
- Create: `js/download/vcfHandler.cjs`

Mirror Task C4.2 for the VCF branch.

- [ ] **Step 1: Test**

Write `tests/unit/download/vcfHandler.test.js`:

```js
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');

jest.mock('../../../js/download/urlRefresh.cjs', () => ({
  getValidDownloadUrl: jest.fn(async (_, name) => `https://${name}`),
}));
jest.mock('../../../js/urlUtils.cjs', () => ({
  isUrlExpiringSoon: jest.fn(() => false),
}));
jest.mock('../../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  rangedDownloadVCF: jest.fn(),
  indexVCF: jest.fn(),
  generateOutputFileName: jest.fn(
    (name, regions) => `out_${name}_${(regions || []).join('_')}`,
  ),
}));
jest.mock('../../../js/download/commonDownload.cjs', () => ({
  fullDownloadWithOptionalIndex: jest.fn(),
}));

const {
  rangedDownloadVCF,
  indexVCF,
  ensureIndexFile,
} = require('../../../js/rangedUtils.cjs');
const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');

describe('download/vcfHandler.handleVcfFile', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const baseDeps = {
    agent: {},
    rl: {},
    logger: mockLogger,
    metrics: {
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
      startTime: 0,
    },
    authService: { token: 'tok' },
  };

  beforeEach(() => jest.clearAllMocks());

  test('ranged: one rangedDownloadVCF call per region', async () => {
    await handleVcfFile(
      {
        fileName: 'sample.vcf.gz',
        fileDict: {
          'sample.vcf.gz': {
            downloadLink: 'https://primary',
            analysisId: 'A1',
          },
          'sample.vcf.gz.tbi': {
            downloadLink: 'https://index',
            analysisId: 'A1',
          },
        },
        regions: ['chr1:1-10', 'chr2:5-15'],
        finalConfig: { destination: '/tmp', overwrite: false },
        target: 'demo',
      },
      baseDeps,
    );
    expect(rangedDownloadVCF).toHaveBeenCalledTimes(2);
    expect(ensureIndexFile).toHaveBeenCalledTimes(1);
  });

  test('full: calls commonDownload when no regions', async () => {
    await handleVcfFile(
      {
        fileName: 'sample.vcf.gz',
        fileDict: {
          'sample.vcf.gz': { downloadLink: 'https://p', analysisId: 'A1' },
        },
        regions: [],
        finalConfig: { destination: '/tmp', overwrite: false },
        target: 'demo',
      },
      baseDeps,
    );
    expect(fullDownloadWithOptionalIndex).toHaveBeenCalled();
    expect(rangedDownloadVCF).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=download/vcfHandler
```

- [ ] **Step 3: Write `js/download/vcfHandler.cjs`**

```js
const path = require('node:path');
const { getValidDownloadUrl } = require('./urlRefresh.cjs');
const { isUrlExpiringSoon } = require('../urlUtils.cjs');
const {
  ensureIndexFile,
  rangedDownloadVCF,
  indexVCF,
  generateOutputFileName,
} = require('../rangedUtils.cjs');
const { fullDownloadWithOptionalIndex } = require('./commonDownload.cjs');

/**
 * Handles download of a single VCF file: ranged (per-region loop) or full.
 *
 * @param   {object}                                args              - Args.
 * @param   {string}                                args.fileName     - VCF file name.
 * @param   {import('../types').FileDict}           args.fileDict     - File dictionary.
 * @param   {string[]}                              args.regions      - Genomic regions.
 * @param   {import('../types').FinalConfig}        args.finalConfig  - Final config.
 * @param   {string}                                args.target       - Varvis target.
 * @param   {import('../types').CommandDeps}        deps              - Injected deps.
 * @returns {Promise<void>}
 */
async function handleVcfFile(args, deps) {
  const { fileName, fileDict, regions, finalConfig, target } = args;
  const { agent, logger, metrics, authService } = deps;
  const { destination, overwrite } = finalConfig;

  const downloadLink = await getValidDownloadUrl(
    fileDict,
    fileName,
    target,
    authService.token,
    agent,
    logger,
  );
  const indexFileName = `${fileName}.tbi`;
  let indexFileUrl = fileDict[indexFileName]?.downloadLink;
  if (indexFileUrl && isUrlExpiringSoon(indexFileUrl)) {
    indexFileUrl = await getValidDownloadUrl(
      fileDict,
      indexFileName,
      target,
      authService.token,
      agent,
      logger,
    );
  }
  const indexFilePath = path.join(destination, indexFileName);

  if (regions.length === 0) {
    const outputFile = path.join(
      destination,
      generateOutputFileName(fileName, regions, logger),
    );
    await fullDownloadWithOptionalIndex(
      {
        primary: { url: downloadLink, path: outputFile },
        index: indexFileUrl
          ? { url: indexFileUrl, path: indexFilePath, label: indexFileName }
          : null,
        overwrite,
      },
      deps,
    );
    try {
      await indexVCF(outputFile, logger, overwrite);
    } catch (error) {
      logger.error(`Error indexing VCF ${outputFile}: ${error.message}`);
    }
    return;
  }

  // Ranged download: index required, per-region loop
  if (!indexFileUrl) {
    logger.error(
      `Index file for VCF (${fileName}) not found. Ranged download requires .tbi index. Skipping ranged download.`,
    );
    return;
  }
  await ensureIndexFile(
    downloadLink,
    indexFileUrl,
    indexFilePath,
    agent,
    deps.rl,
    logger,
    metrics,
    overwrite,
  );

  for (const region of regions) {
    const regionOutputFile = path.join(
      destination,
      generateOutputFileName(fileName, [region], logger),
    );
    try {
      logger.info(
        `Performing ranged download for VCF file: ${fileName} with region: ${region}`,
      );
      await rangedDownloadVCF(
        downloadLink,
        region,
        regionOutputFile,
        indexFilePath,
        logger,
        metrics,
        overwrite,
      );
      await indexVCF(regionOutputFile, logger, overwrite);
    } catch (error) {
      logger.error(
        `Error during ranged download for ${fileName} on region ${region}: ${error.message}`,
      );
    }
  }
}

module.exports = { handleVcfFile };
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- --testPathPatterns=download/vcfHandler
```

- [ ] **Step 5: Commit**

```bash
git add js/download/vcfHandler.cjs tests/unit/download/vcfHandler.test.js
git commit -m "refactor(download): extract VCF handler to js/download/vcfHandler.cjs"
```

---

### Task C4.4: Phase C4 verification

- [ ] **Step 1: Full gate + push**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git push
```

---

## Phase C5 — errors.cjs + commands/ + circular-require fix

### Task C5.1: Replace stub `js/errors.cjs` and test it

**Files:**

- Modify: `js/errors.cjs` (replaces stub created in C1.3)
- Create: `tests/unit/errors.test.js`

- [ ] **Step 1: Test**

Write `tests/unit/errors.test.js`:

```js
const { ConfigurationError, OperationalError } = require('../../js/errors.cjs');

describe('errors.cjs', () => {
  test('ConfigurationError carries exitCode 1', () => {
    const e = new ConfigurationError('bad config');
    expect(e).toBeInstanceOf(Error);
    expect(e.exitCode).toBe(1);
    expect(e.name).toBe('ConfigurationError');
    expect(e.message).toBe('bad config');
  });

  test('OperationalError defaults exitCode 1', () => {
    const e = new OperationalError('runtime fail');
    expect(e.exitCode).toBe(1);
    expect(e.name).toBe('OperationalError');
  });

  test('OperationalError accepts custom exitCode', () => {
    const e = new OperationalError('runtime fail', 42);
    expect(e.exitCode).toBe(42);
  });

  test('both are instanceof Error and catchable', () => {
    try {
      throw new ConfigurationError('x');
    } catch (e) {
      expect(e instanceof Error).toBe(true);
      expect(e instanceof ConfigurationError).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run — should already pass (stub from C1.3 satisfies these)**

```bash
npm test -- --testPathPatterns=errors
```

If any test fails, harden the stub in `js/errors.cjs`. The expected final form matches what was written in Task C1.3 Step 3.

- [ ] **Step 3: Commit the test**

```bash
git add tests/unit/errors.test.js
git commit -m "test(errors): cover ConfigurationError and OperationalError"
```

---

### Task C5.2: Break the archiveUtils↔fetchUtils cycle — move `resumeArchivedDownloads` to `commands/resume.cjs`

**Files:**

- Create: `js/commands/resume.cjs`
- Create: `tests/unit/commands/resume.test.js`
- Modify: `js/archiveUtils.cjs` (remove `resumeArchivedDownloads` function + the lazy requires at line 119)
- Modify: `varvis-download.cjs` (update import and call sites)

- [ ] **Step 1: Test the new home**

```bash
mkdir -p tests/unit/commands js/commands
```

Write `tests/unit/commands/resume.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resumeArchivedDownloads } = require('../../../js/commands/resume.cjs');

jest.mock('../../../js/fetchUtils.cjs', () => ({
  getDownloadLinks: jest.fn(),
  metrics: {
    startTime: 0,
    totalFilesDownloaded: 0,
    totalFilesSkipped: 0,
    totalBytesDownloaded: 0,
    downloadSpeeds: [],
  },
}));
jest.mock('../../../js/restorationState.cjs', () => ({
  readRestorationState: jest.fn(),
  writeRestorationState: jest.fn(),
}));
jest.mock('../../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  generateOutputFileName: jest.fn(),
  indexBAM: jest.fn(),
  indexVCF: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  rangedDownloadVCF: jest.fn(),
}));
jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));

const { readRestorationState } = require('../../../js/restorationState.cjs');

describe('commands/resume.resumeArchivedDownloads', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  test('logs and returns when restoration file empty', async () => {
    readRestorationState.mockReturnValue(null);
    await resumeArchivedDownloads(
      'any.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to resume'),
    );
  });

  test('skips entries whose restoration time has not passed', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    readRestorationState.mockReturnValue([
      { fileName: 'a.bam', restoreEstimation: future },
    ]);
    await resumeArchivedDownloads(
      'any.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — should fail (module not yet present)**

```bash
npm test -- --testPathPatterns=commands/resume
```

- [ ] **Step 3: Move `resumeArchivedDownloads` body to `js/commands/resume.cjs`**

The source function is `js/archiveUtils.cjs` lines **101-457**. It has **two** sets of lazy `require()` calls to hoist:

1. Lines 119-129: `getDownloadLinks`, `ensureIndexFile`, `generateOutputFileName`, `indexBAM`, `indexVCF`, `rangedDownloadBAM`, `rangedDownloadVCF`, `downloadFile`, and `metrics` (re-required at 129).
2. Line 250: `const os = require('node:os')` inline inside the BAM ranged branch.

Both move to the top of `js/commands/resume.cjs`. Also: `fs` and `path` are used inside the function body but currently come from the top-of-file requires in `archiveUtils.cjs` — those must be added at the top of the new file too.

Write `js/commands/resume.cjs`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDownloadLinks, metrics } = require('../fetchUtils.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../restorationState.cjs');
const {
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  indexVCF,
  rangedDownloadBAM,
  rangedDownloadVCF,
} = require('../rangedUtils.cjs');
const { downloadFile } = require('../fileUtils.cjs');

/**
 * Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
 *
 * @param   {string}                          restorationFile - Path to awaiting-restoration JSON file.
 * @param   {string}                          destination     - Output directory.
 * @param   {string}                          target          - Varvis target.
 * @param   {string}                          token           - CSRF token.
 * @param   {import('undici').Agent}          agent           - HTTP agent.
 * @param   {import('winston').Logger}        logger          - Logger.
 * @param   {boolean}                         overwrite       - Overwrite existing files.
 * @returns {Promise<void>}
 */
async function resumeArchivedDownloads(
  restorationFile,
  destination,
  target,
  token,
  agent,
  logger,
  overwrite,
) {
  // BODY: copy lines 110-457 from js/archiveUtils.cjs verbatim, with these
  // three deletions only:
  //   - Lines 118-130 (the lazy require block + the "Lazy-require..." comment)
  //   - Line 250 (`const os = require('node:os');`)
  // No other lines change. No logic edits.
}

module.exports = { resumeArchivedDownloads };
```

**Important:** The function body is too long to embed inline here (~340 lines). Use `git show HEAD:js/archiveUtils.cjs | sed -n '110,457p'` to retrieve it, then delete the three lines noted above. A correct copy passes `tests/integration/archive.test.js` unchanged. If integration tests fail after this step, the most likely cause is a missed line or a mis-located lazy require.

- [ ] **Step 4: Remove the function from `js/archiveUtils.cjs`**

In `js/archiveUtils.cjs`:

- Delete the `resumeArchivedDownloads` function (lines 88-457, including the JSDoc block).
- Edit `module.exports` (lines 459-464). Change from:
  ```js
  module.exports = {
    triggerRestoreArchivedFile,
    appendToAwaitingRestoration,
    resumeArchivedDownloads,
  };
  ```
  to:
  ```js
  module.exports = {
    triggerRestoreArchivedFile,
    appendToAwaitingRestoration,
  };
  ```
- Verify `archiveUtils.cjs` is now ~95 LOC (down from 464).

- [ ] **Step 5: Update `varvis-download.cjs` imports**

Change from:

```js
const {
  resumeArchivedDownloads: resumeArchivedDownloadsFunc,
} = require('./js/archiveUtils.cjs');
```

to:

```js
const {
  resumeArchivedDownloads: resumeArchivedDownloadsFunc,
} = require('./js/commands/resume.cjs');
```

- [ ] **Step 6: Run all tests — verify nothing regressed**

```bash
npm test
```

Critical: `tests/integration/archive.test.js` must still pass unchanged. If it doesn't, the function body copy is incomplete — diff against the original carefully.

- [ ] **Step 7: Verify no `require()` calls remain inside function bodies**

```bash
grep -n "  const.*require(" js/*.cjs js/**/*.cjs
```

Expected: zero hits (or one documented exception).

- [ ] **Step 8: Commit**

```bash
git add js/commands/resume.cjs tests/unit/commands/resume.test.js js/archiveUtils.cjs varvis-download.cjs
git commit -m "refactor(commands): move resumeArchivedDownloads to commands/resume.cjs to break archiveUtils↔fetchUtils cycle"
```

---

### Task C5.3: Test + extract `commands/list.cjs`

**Files:**

- Create: `tests/unit/commands/list.test.js`
- Create: `js/commands/list.cjs`
- Modify: `varvis-download.cjs:556-585` (the `if (finalConfig.list)` branch)

- [ ] **Step 1: Test**

Write `tests/unit/commands/list.test.js`:

```js
const { runListCommand } = require('../../../js/commands/list.cjs');

jest.mock('../../../js/fetchUtils.cjs', () => ({
  fetchAnalysisIds: jest.fn(async () => ['fetched-1']),
  listAvailableFiles: jest.fn(),
}));

const {
  fetchAnalysisIds,
  listAvailableFiles,
} = require('../../../js/fetchUtils.cjs');

describe('commands/list.runListCommand', () => {
  const mockLogger = { info: jest.fn(), error: jest.fn() };
  const baseDeps = {
    agent: {},
    logger: mockLogger,
    authService: { token: 'tok' },
  };
  beforeEach(() => jest.clearAllMocks());

  test('uses provided analysisIds when present', async () => {
    await runListCommand(
      {
        finalConfig: {
          analysisIds: ['A1', 'A2'],
          sampleIds: [],
          limsIds: [],
          filters: [],
          latest: false,
          target: 'demo',
        },
      },
      baseDeps,
    );
    expect(fetchAnalysisIds).not.toHaveBeenCalled();
    expect(listAvailableFiles).toHaveBeenCalledTimes(2);
  });

  test('falls back to fetchAnalysisIds when no analysisIds', async () => {
    await runListCommand(
      {
        finalConfig: {
          analysisIds: [],
          sampleIds: ['S1'],
          limsIds: [],
          filters: [],
          latest: false,
          target: 'demo',
        },
      },
      baseDeps,
    );
    expect(fetchAnalysisIds).toHaveBeenCalled();
    expect(listAvailableFiles).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=commands/list
```

- [ ] **Step 3: Write `js/commands/list.cjs`**

```js
const { fetchAnalysisIds, listAvailableFiles } = require('../fetchUtils.cjs');

/**
 * Runs the --list command: enumerates available files for the resolved analysis IDs.
 *
 * @param   {object}                                args              - Args.
 * @param   {import('../types').FinalConfig}        args.finalConfig  - Final config.
 * @param   {import('../types').CommandDeps}        deps              - Injected deps.
 * @returns {Promise<void>}
 */
async function runListCommand({ finalConfig }, deps) {
  const { agent, logger, authService } = deps;
  const { analysisIds, sampleIds, limsIds, filters, latest, target } =
    finalConfig;

  const ids =
    analysisIds.length > 0
      ? analysisIds
      : await fetchAnalysisIds(
          target,
          authService.token,
          agent,
          sampleIds,
          limsIds,
          filters,
          logger,
          latest,
        );

  logger.info(`Fetched analysis IDs: ${ids}`);
  for (const analysisId of ids) {
    await listAvailableFiles(
      analysisId,
      target,
      authService.token,
      agent,
      logger,
    );
  }
  logger.info('Listing complete.');
}

module.exports = { runListCommand };
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- --testPathPatterns=commands/list
```

- [ ] **Step 5: Commit (entry update happens in C5.4 together with download command)**

```bash
git add js/commands/list.cjs tests/unit/commands/list.test.js
git commit -m "refactor(commands): extract --list command to commands/list.cjs"
```

---

### Task C5.4: Test + extract `commands/download.cjs`, finalize entry

**Files:**

- Create: `tests/unit/commands/download.test.js`
- Create: `js/commands/download.cjs`
- Modify: `varvis-download.cjs` (extensive — final state should be ~80 LOC)

- [ ] **Step 1: Test (smoke)**

Write `tests/unit/commands/download.test.js`:

```js
const { runDownloadCommand } = require('../../../js/commands/download.cjs');

jest.mock('../../../js/fetchUtils.cjs', () => ({
  fetchAnalysisIds: jest.fn(async () => ['A1']),
  getDownloadLinks: jest.fn(async () => ({
    'sample.bam': { downloadLink: 'https://primary', analysisId: 'A1' },
  })),
  generateReport: jest.fn(),
  metrics: {
    startTime: 0,
    totalFilesDownloaded: 0,
    totalFilesSkipped: 0,
    totalBytesDownloaded: 0,
    downloadSpeeds: [],
  },
}));
jest.mock('../../../js/download/bamHandler.cjs', () => ({
  handleBamFile: jest.fn(),
}));
jest.mock('../../../js/download/vcfHandler.cjs', () => ({
  handleVcfFile: jest.fn(),
}));
jest.mock('../../../js/toolChecks.cjs', () => ({
  checkToolAvailability: jest.fn(async () => true),
}));

const { handleBamFile } = require('../../../js/download/bamHandler.cjs');

describe('commands/download.runDownloadCommand', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const baseDeps = {
    agent: {},
    rl: {},
    logger: mockLogger,
    metrics: {
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
      startTime: 0,
    },
    authService: { token: 'tok' },
  };
  beforeEach(() => jest.clearAllMocks());

  test('dispatches BAM files to handleBamFile', async () => {
    await runDownloadCommand(
      {
        finalConfig: {
          analysisIds: ['A1'],
          sampleIds: [],
          limsIds: [],
          filters: [],
          filetypes: ['bam'],
          target: 'demo',
          destination: '/tmp',
          overwrite: false,
          unmapped: false,
          range: null,
          bed: null,
          listUrls: false,
          restoreArchived: 'ask',
          restorationFile: 'awaiting-restoration.json',
        },
        regions: [],
      },
      baseDeps,
    );
    expect(handleBamFile).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- --testPathPatterns=commands/download
```

- [ ] **Step 3: Write `js/commands/download.cjs`**

```js
const {
  fetchAnalysisIds,
  getDownloadLinks,
  generateReport,
  metrics,
} = require('../fetchUtils.cjs');
const { checkToolAvailability } = require('../toolChecks.cjs');
const { handleBamFile } = require('../download/bamHandler.cjs');
const { handleVcfFile } = require('../download/vcfHandler.cjs');
const { handleUrlListing } = require('../io/urlListing.cjs');
const { OperationalError } = require('../errors.cjs');

/**
 * Runs the main download command: discover analyses, fetch download links, dispatch
 * BAM/VCF handlers per file. Optionally lists URLs instead of downloading.
 *
 * @param   {object}                                args                  - Args.
 * @param   {import('../types').FinalConfig}        args.finalConfig      - Final config.
 * @param   {string[]}                              args.regions          - Parsed regions.
 * @param   {string=}                               args.tempBedPath      - Temp BED file path (if regions present).
 * @param   {import('../types').CommandDeps}        deps                  - Injected deps.
 * @returns {Promise<void>}
 */
async function runDownloadCommand(args, deps) {
  const { finalConfig, regions, tempBedPath } = args;
  const { agent, logger, authService, rl } = deps;
  const {
    target,
    analysisIds,
    sampleIds,
    limsIds,
    filters,
    filetypes,
    restoreArchived,
    restorationFile,
    listUrls,
    urlFile,
    reportfile,
  } = finalConfig;

  // Tier 2: tool availability check
  if (finalConfig.range || finalConfig.bed || finalConfig.unmapped) {
    const samtoolsOK = await checkToolAvailability(
      'samtools',
      'samtools --version',
      '1.17',
      logger,
    );
    if (!samtoolsOK) {
      throw new OperationalError(
        'samtools is missing or outdated. Please install/update it and try again.',
        1,
      );
    }
    if (finalConfig.range || finalConfig.bed) {
      const tabixOK = await checkToolAvailability(
        'tabix',
        'tabix --version',
        '1.7',
        logger,
      );
      const bgzipOK = await checkToolAvailability(
        'bgzip',
        'bgzip --version',
        '1.7',
        logger,
      );
      if (!tabixOK || !bgzipOK) {
        throw new OperationalError(
          'One or more required external tools (tabix, bgzip) are missing or outdated.',
          1,
        );
      }
    }
  }

  const ids =
    analysisIds.length > 0
      ? analysisIds
      : await fetchAnalysisIds(
          target,
          authService.token,
          agent,
          sampleIds,
          limsIds,
          filters,
          logger,
          finalConfig.latest,
        );
  logger.info(`Fetched analysis IDs: ${ids}`);

  const optionsForRestoration = {
    destination: finalConfig.destination,
    overwrite: finalConfig.overwrite,
    range: finalConfig.range,
    bed: finalConfig.bed,
    unmapped: finalConfig.unmapped,
    restorationFile,
    filetypes,
  };

  /** @type {string[]} */
  const allUrls = [];

  for (const analysisId of ids) {
    logger.info(`Processing analysis ID: ${analysisId}`);
    const fileDict = await getDownloadLinks(
      analysisId,
      filetypes,
      target,
      authService.token,
      agent,
      logger,
      restoreArchived,
      rl,
      restorationFile,
      optionsForRestoration,
    );
    logger.debug(`Fetched download links for analysis ID ${analysisId}`);

    if (listUrls) {
      for (const file of Object.values(fileDict)) {
        if (file.downloadLink) allUrls.push(file.downloadLink);
      }
      continue;
    }

    const primaryFiles = Object.entries(fileDict).filter(
      ([fname]) => fname.endsWith('.bam') || fname.endsWith('.vcf.gz'),
    );

    for (const [fileName] of primaryFiles) {
      if (fileName.endsWith('.bam')) {
        await handleBamFile(
          { fileName, fileDict, regions, tempBedPath, finalConfig, target },
          deps,
        );
      } else if (fileName.endsWith('.vcf.gz')) {
        if (finalConfig.unmapped) {
          logger.info(
            `Skipping VCF file ${fileName} - unmapped read extraction only applies to BAM files.`,
          );
          continue;
        }
        await handleVcfFile(
          { fileName, fileDict, regions, finalConfig, target },
          deps,
        );
      }
    }
  }

  if (listUrls) {
    handleUrlListing(allUrls, urlFile, logger);
    return;
  }

  logger.info('Download complete.');
  generateReport(reportfile, logger);
}

module.exports = { runDownloadCommand };
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- --testPathPatterns=commands/download
```

- [ ] **Step 5: Rewrite `varvis-download.cjs` as a thin dispatcher**

Replace the entire body of `varvis-download.cjs` (after the initial requires and the version-check stays as-is) with:

```js
#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const readline = require('node:readline');
const { hideBin } = require('yargs/helpers');
const {
  version,
  name,
  author,
  license,
  repository,
} = require('./package.json');

const {
  loadConfig,
  loadLogo,
  getLastModifiedDate,
} = require('./js/configUtils.cjs');
const createLogger = require('./js/logger.cjs');
const AuthService = require('./js/authService.cjs');

const { buildParser } = require('./js/cli/args.cjs');
const { mergeFromArgv } = require('./js/cli/configMerge.cjs');
const { formatVersionInfo } = require('./js/cli/versionInfo.cjs');
const { createHttpAgent } = require('./js/net/httpAgent.cjs');
const { promptForPassword } = require('./js/io/passwordPrompt.cjs');
const { parseRegions } = require('./js/io/regionParsing.cjs');
const { runListCommand } = require('./js/commands/list.cjs');
const { runDownloadCommand } = require('./js/commands/download.cjs');
const { resumeArchivedDownloads } = require('./js/commands/resume.cjs');
const { ConfigurationError, OperationalError } = require('./js/errors.cjs');

async function main() {
  const argv = await buildParser(hideBin(process.argv)).argv;
  const logger = createLogger(argv);

  if (argv.version) {
    console.log(
      formatVersionInfo({
        name,
        version,
        author,
        license,
        repository,
        lastModified: getLastModifiedDate(__filename),
        logo: loadLogo(),
      }),
    );
    return;
  }

  const finalConfig = mergeFromArgv(argv, process.env);
  const agent = createHttpAgent({
    proxy: finalConfig.proxy,
    proxyUsername: finalConfig.proxyUsername,
    proxyPassword: finalConfig.proxyPassword,
  });
  const authService = new AuthService(logger, agent);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let password = finalConfig.password;
    if (!password && process.stdin.isTTY) {
      password = await promptForPassword();
    }
    if (!password) {
      throw new ConfigurationError(
        'Password is required (provide via --password, VARVIS_PASSWORD, config file, or interactive prompt).',
      );
    }
    await authService.login(
      { username: finalConfig.username, password },
      finalConfig.target,
    );

    const deps = {
      agent,
      rl,
      logger,
      metrics: require('./js/fetchUtils.cjs').metrics,
      authService,
    };

    if (finalConfig.resumeArchivedDownloads) {
      await resumeArchivedDownloads(
        finalConfig.restorationFile,
        finalConfig.destination,
        finalConfig.target,
        authService.token,
        agent,
        logger,
        finalConfig.overwrite,
      );
      return;
    }

    if (!fs.existsSync(finalConfig.destination)) {
      fs.mkdirSync(finalConfig.destination, { recursive: true });
    }

    if (finalConfig.list) {
      await runListCommand({ finalConfig }, deps);
      return;
    }

    const { regions, tempBedPath } = parseRegions(
      { range: finalConfig.range, bed: finalConfig.bed },
      logger,
    );
    await runDownloadCommand({ finalConfig, regions, tempBedPath }, deps);

    if (tempBedPath) {
      fs.unlinkSync(tempBedPath);
      logger.info(`Deleted temporary BED file: ${tempBedPath}`);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  const logger = createLogger({});
  if (
    error instanceof ConfigurationError ||
    error instanceof OperationalError
  ) {
    logger.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }
  logger.error('An unexpected error occurred:', error.message);
  logger.debug(error.stack);
  process.exit(1);
});
```

- [ ] **Step 6: Verify entry LOC**

```bash
wc -l varvis-download.cjs
```

Expected: ~80-100. If higher, scrutinize for inline logic that should have been extracted.

- [ ] **Step 7: Full gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

- [ ] **Step 8: Commit**

```bash
git add js/commands/download.cjs tests/unit/commands/download.test.js varvis-download.cjs
git commit -m "refactor(commands): extract main download orchestration; varvis-download.cjs now ~80 LOC dispatcher"
```

---

### Task C5.5: Phase C5 verification

- [ ] **Step 1: Run integration suite**

```bash
npm run test:integration
```

Expected: all pass. If `tests/integration/archive.test.js` fails, the cycle-break (C5.2) is wrong — diff `commands/resume.cjs` against the original `archiveUtils.cjs` function carefully.

- [ ] **Step 2: Push**

```bash
git push
```

Wait for CI green.

---

## Phase C6 — Cleanup

### Task C6.1: Remove `varvis-download.cjs` from `KNOWN_OVERSIZED_FILES`

**Files:**

- Modify: `scripts/check-architecture-budget.mjs`

- [ ] **Step 1: Edit the list**

In `scripts/check-architecture-budget.mjs`, find `KNOWN_OVERSIZED_FILES` and remove `'varvis-download.cjs'`. The other entries stay (per Non-Goals).

- [ ] **Step 2: Verify**

```bash
npm run architecture:check
```

Expected: still passes — `varvis-download.cjs` is now under 500 LOC.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-architecture-budget.mjs
git commit -m "chore(arch): remove varvis-download.cjs from KNOWN_OVERSIZED_FILES"
```

---

### Task C6.2: Final integration pass

- [ ] **Step 1: Full local gate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

- [ ] **Step 2: Sanity check exit codes against the matrix**

```bash
# A few representative checks. Replace `<arg>` with real values from your env.
node varvis-download.cjs --help; echo "help exit: $?"
node varvis-download.cjs --version; echo "version exit: $?"
node varvis-download.cjs --target=demo --username=u --password=p; echo "missing IDs exit: $?"
```

Expected: 0, 0, 1.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Phase D — ADR

### Task D1: Write `docs/adr/0001-defer-typescript-conversion.md`

**Files:**

- Create: `docs/adr/0001-defer-typescript-conversion.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0001: Defer full TypeScript conversion

**Status:** Accepted (2026-05-26)
**Context spec:** docs/superpowers/specs/2026-05-26-typescript-readiness-design.md

## Context

`varvis-download` ships as JavaScript (CommonJS `.cjs`) with JSDoc annotations. TypeScript already runs against the codebase in `checkJs` / `noEmit` mode via `tsconfig.json`, gated by `npm run type-check` in CI. The repository captures ~70% of TypeScript's value through this pattern.

In May 2026, we considered renaming all `.cjs` files to `.ts` and adopting native TypeScript across the project.

## Decision

We defer the full `.cjs` → `.ts` conversion until one of the explicit triggers below fires. Instead, we land the TypeScript-readiness refactor (this ADR's context spec) to ensure the eventual conversion is mechanical.

## Rationale

1. **TypeScript 7 (`tsgo`) is still settling.** Native Go-based compilation went stable Jan 2026 with 99.6% test parity, but the ecosystem (yargs, undici, winston) is still rolling toward tsgo-friendly type packaging. Migrating onto a moving target trades current stability for marginal benefit.
2. **The build step is real cost.** Today `node varvis-download.cjs` runs directly. Converting introduces a compile pipeline (`tsx` for dev, compiled `dist/` for production), a more complex `bin` entry, and shim management for Windows.
3. **Marginal benefit is small with the readiness work done.** With strict flags on (Phase B of the context spec), typed JSDoc + `tsc --noEmit` catches the same null-safety and implicit-any issues TS would catch. The remaining win — generic syntax convenience, `.d.ts` emission — does not justify weeks of churn.
4. **Tooling support for JSDoc-typed JS is mature.** ESLint, jest, prettier, IDE rename, and refactoring all work today.

## Triggers that re-open this decision

This ADR should be revisited if any of the following becomes true:

- TypeScript 7 (`tsgo`) is the documented default for new Node CLI projects in mainstream tooling.
- A contributor reports concrete friction caused by JSDoc syntax (not aesthetics) and the friction can be enumerated.
- A generic or discriminated-union pattern is needed that JSDoc cannot express cleanly.
- We decide to publish `varvis-download` as a library (not just a `bin`), requiring `.d.ts` emission for downstream consumers.
- The next major refactor would touch >50% of source files, making the conversion essentially free to bolt on.

## Migration recipe (for when a trigger fires)

The TypeScript-readiness refactor (context spec, Phase C5) eliminated circular requires, so the conversion is purely mechanical:

1. `git checkout -b refactor/typescript-conversion` off `main`.
2. For each `.cjs` file: `git mv path/to.cjs path/to.ts`.
3. Rewrite `require()` → `import` and `module.exports = {a, b}` → `export {a, b}`. All requires are top-level post-readiness, so this is search-and-replace.
4. Inline JSDoc types as TS annotations. Delete `@param`/`@returns` lines (descriptions stay as block comments where useful).
5. `types.d.ts` → `types.ts`, with the runtime class re-export pattern flipped to a regular export.
6. Configure `@swc/jest` for `.ts` test execution. Keep `tsc --noEmit` as the type gate.
7. Add a `dist/` build step (`tsc` or `tsgo`). Update `bin` in `package.json` to point at the compiled JS.
8. Ship as one squash-merge PR off `main`.

Estimated effort post-readiness: **5–7 days**. Without readiness work: **12–18 days**.

## Consequences

- **Positive:** Repository stays simple to operate (no build step). Contributor onboarding stays unchanged. Future migration is straightforward.
- **Negative:** Some advanced TS patterns (generics, conditional types) remain awkward in JSDoc. Type-checking errors sometimes have less precise locations than native TS errors.
- **Neutral:** This ADR explicitly endorses JSDoc-with-strict as a long-term equilibrium, not a transition state.

## References

- [TypeScript: documentation — Migrating from JavaScript](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Progress on TypeScript 7 — Microsoft Dev Blog, Dec 2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/)
- Context spec: `docs/superpowers/specs/2026-05-26-typescript-readiness-design.md`
```

- [ ] **Step 2: Run prettier**

```bash
npx prettier --write docs/adr/0001-defer-typescript-conversion.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-defer-typescript-conversion.md
git commit -m "docs(adr): document deferral of full TypeScript conversion (ADR-0001)"
```

---

## Final: Pre-merge gate

### Task F1: Full local gate

- [ ] **Step 1: Run the aggregate**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
```

Expected: all pass. If anything fails, fix it on the branch before flipping the PR.

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: all pass. Requires `VARVIS_PLAYGROUND_USER`/`VARVIS_PLAYGROUND_PASS` env vars.

- [ ] **Step 3: Push final state**

```bash
git push
```

Wait for CI green on the draft PR.

---

### Task F2: Flip draft PR to ready and request review

- [ ] **Step 1: Verify branch is up to date with main**

```bash
git fetch origin main
git rebase origin/main
```

If conflicts: resolve, then `git push --force-with-lease`.

- [ ] **Step 2: Convert draft to ready**

```bash
gh pr ready
```

- [ ] **Step 3: Update PR description with final status**

```bash
gh pr edit --body "$(cat <<'EOF'
TypeScript-readiness refactor — all phases complete.

- [x] A — Domain types + shims + tsconfig include
- [x] B — Strict flags + JSDoc fixes
- [x] C1 — cli/ extraction
- [x] C2 — net/ + io/ leaves
- [x] C3 — io/regionParsing + download/urlRefresh
- [x] C4 — download handlers + commonDownload helper
- [x] C5 — errors.cjs + commands/ + circular-require fix
- [x] C6 — KNOWN_OVERSIZED_FILES cleanup
- [x] D — ADR

## Behavior changes

- **Intentional:** Credential precedence fixed (env vars and prompt now work as documented). See spec § "Credential Precedence Contract".
- **No-op:** Error-log lines consolidated; exit codes preserved across all scenarios in `tests/fixtures/exit-codes.json`.

## Spec

`docs/superpowers/specs/2026-05-26-typescript-readiness-design.md`

## Future work

`docs/adr/0001-defer-typescript-conversion.md` documents the deferred TypeScript conversion and the triggers that re-open it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge with merge-commit (preserve phase history)**

```bash
gh pr merge --merge
```

Expected: PR closes; branch is preserved on origin for history. Delete locally after CI on `main` is green:

```bash
git checkout main
git pull origin main
git branch -d refactor/typescript-readiness
```

---

## Done

Branch merged to `main`. ~7-10 dev-days of work delivered as one cohesive refactor.

Future TypeScript conversion is now a 5-7 day mechanical pass — recipe documented in ADR-0001.
