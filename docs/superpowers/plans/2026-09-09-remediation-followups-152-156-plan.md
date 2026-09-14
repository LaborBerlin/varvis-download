# Implementation Plan: Audit Follow-Up Remediation (#152, #153, #154, #155, #156)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver clinical-grade fixes for issues #152, #153, #154, #155, and #156 with failure-safe file replacement, request deadlines with fresh per-attempt timeouts, socket-safe retry drains via `response.body.cancel()`, batch archive restoration deduplication, dead code removal, and comprehensive traceability alignment.

**GitHub Issues:**
- [#152](https://github.com/LaborBerlin/varvis-download/issues/152): `perf(net): configure explicit Undici timeouts and retry backoff jitter`
- [#153](https://github.com/LaborBerlin/varvis-download/issues/153): `perf(archive): batch restoration-state updates in production restore flow`
- [#154](https://github.com/LaborBerlin/varvis-download/issues/154): `refactor(file): remove or integrate unused confirmOverwrite helper`
- [#155](https://github.com/LaborBerlin/varvis-download/issues/155): `fix(download): make final .part replacement failure-safe on overwrite`
- [#156](https://github.com/LaborBerlin/varvis-download/issues/156): `docs: align remediation traceability across #147, #148, #149 and PR #151`

**Spec Reference:** [`docs/superpowers/specs/2026-09-09-remediation-followups-152-156-design.md`](../specs/2026-09-09-remediation-followups-152-156-design.md)

---

## Global Constraints & Standards

- File budget: All source and test files must remain strictly under 600 lines (`npm run architecture:check`). Add dedicated new test files rather than expanding existing oversized files.
- Node imports: Built-ins use `node:` protocol (`node:fs`, `node:path`, `node:events`).
- JSDoc: Every exported function must maintain strict JSDoc type definitions (`npm run type-check`).
- Hygiene: No real credentials or customer identifiers in code, tests, or documentation.
- Test commands: Run focused tests during development (`npm test -- --testPathPatterns=<name>`), full gate on completion (`npm run check`).

---

### Task 1: Prerequisite Types & Metrics Foundation

**Files:**
- Modify: `js/types.d.ts`
- Modify: `varvis-download.cjs` (metrics initialization)

- [ ] **Step 1: Update type definitions**
  In `js/types.d.ts`:
  - Add `totalFilesFailed: number;` to `Metrics` interface.
  - Add `timeout?: number | null;` and `jitter?: boolean;` to `UndiciRequestOptions`.
  - Add `RestorationEntry` return type to `triggerRestoreArchivedFile` JSDoc types if applicable.

- [ ] **Step 2: Initialize `totalFilesFailed` in `varvis-download.cjs`**
  Ensure the `metrics` object includes `totalFilesFailed: 0`.

- [ ] **Step 3: Verify types**
  Run: `npm run type-check`
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add js/types.d.ts varvis-download.cjs
  git commit -m "chore(types): add totalFilesFailed to Metrics and network options to UndiciRequestOptions"
  ```

---

### Task 2: Documentation & Traceability Alignment (Issue #156)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-09-08-audit-remediation-design.md`
- Modify: `docs/superpowers/plans/2026-09-08-audit-remediation-plan.md`
- Edit: PR #151 description (via GitHub API `gh pr edit 151`)

- [ ] **Step 1: Update CHANGELOG.md**
  Reorganize `[0.34.0]` entry so items trace cleanly to their true originating issues:
  - Security items map to #147.
  - Pipeline stability items (VCF deadlock, index-first BAM, skip redundant index, safe resume missing BED, `.part` download, 64KB bounded stderr) map to #148.
  - Performance foundation (`appendBatchToAwaitingRestoration`) maps to #149, explicitly noting that caller batching was deferred to #153, timeouts/jitter to #152, dead code to #154, and replacement safety to #155.
  Under `Unreleased`, document the upcoming follow-up fixes for #152, #153, #154, #155, and #156, noting the removal of the exported `confirmOverwrite` helper.

- [ ] **Step 2: Reconcile 2026-09-08 Audit Design & Plan Documents**
  In `docs/superpowers/specs/2026-09-08-audit-remediation-design.md` and `docs/superpowers/plans/2026-09-08-audit-remediation-plan.md`, update task mappings and notes so future audits see unambiguous traceability to #147, #148, #149, and the follow-ups.

- [ ] **Step 3: Update PR #151 Description**
  Use `gh pr edit 151` to update the PR description to explicitly reflect which items were delivered under #147 and #148, that #149 was partially addressed and succeeded by #152–#154, and link to follow-ups #152, #153, #154, #155, #156.

- [ ] **Step 4: Commit documentation updates**
  ```bash
  git add CHANGELOG.md docs/superpowers/specs/2026-09-08-audit-remediation-design.md docs/superpowers/plans/2026-09-08-audit-remediation-plan.md
  git commit -m "docs(traceability): align remediation item origins across #147, #148, #149 and PR #151 (#156)"
  ```

---

### Task 3: Dead Code Elimination — Remove `confirmOverwrite` (Issue #154)

**Files:**
- Modify: `js/fileUtils.cjs`
- Modify: `tests/unit/fileUtils.test.js`
- Modify: `docs/api/fileUtils.md`
- Modify: `js/README.md`

- [ ] **Step 1: Write failing test verifying `confirmOverwrite` is removed**
  In `tests/unit/fileUtils.test.js`:
  Import `const fileUtils = require('../../js/fileUtils.cjs');`.
  Add test: `expect(fileUtils.confirmOverwrite).toBeUndefined();`.
  Remove the obsolete `describe('confirmOverwrite', ...)` suite.

- [ ] **Step 2: Run test to observe failure (RED)**
  `npm test -- --testPathPatterns=fileUtils.test.js`
  Expected: FAIL with "Received: [Function confirmOverwrite]".

- [ ] **Step 3: Remove `confirmOverwrite` from `js/fileUtils.cjs`**
  Remove `confirmOverwrite` function definition.
  Remove `confirmOverwrite` from `module.exports`.
  In `downloadFile`, mark `_rl` as unused in JSDoc (`@param {import('node:readline').Interface|null} [_rl] - Unused parameter retained for positional signature compatibility.`).

- [ ] **Step 4: Update documentation**
  Remove `confirmOverwrite` section from `docs/api/fileUtils.md` and `js/README.md`.

- [ ] **Step 5: Run tests and type-check (GREEN)**
  `npm test -- --testPathPatterns=fileUtils.test.js` passes.
  `npm run type-check` passes.

- [ ] **Step 6: Commit**
  ```bash
  git add js/fileUtils.cjs tests/unit/fileUtils.test.js docs/api/fileUtils.md js/README.md
  git commit -m "refactor(file): remove unused confirmOverwrite helper and documentation (#154)"
  ```

---

### Task 4: Failure-Safe Atomic Replacement on Overwrite & Error Propagation (Issue #155)

**Files:**
- Modify: `js/fileUtils.cjs`
- Modify: `js/commands/download.cjs`
- Create: `tests/unit/fileUtils.atomicReplace.test.js` (keeps file under 600 line budget)
- Test: `tests/unit/commands/download.enhanced.test.js`

- [ ] **Step 1: Write failing tests in `tests/unit/fileUtils.atomicReplace.test.js`**
  1. Test: Destination exists, overwrite enabled. If rename of `.part` to destination throws `EPERM`, destination is rolled back from backup, `.part` is preserved, and error is thrown.
  2. Test: Destination exists, overwrite enabled. If rename succeeds, backup is unlinked, and destination contains updated content.
  3. Test: Writer emits error immediately upon creation (before network completes); error is caught cleanly without unhandled rejection.
  4. Test: Network fails mid-download (`downloadCompleted === false`); partial `.part` file is cleaned up.
  5. Test: Download fails in `downloadFile`; in `js/commands/download.cjs`, `metrics.totalFilesFailed` increments and command fails with `OperationalError`.

- [ ] **Step 2: Run test to observe failure (RED)**
  `npm test -- --testPathPatterns=fileUtils.atomicReplace.test.js`

- [ ] **Step 3: Implement failure-safe atomic replacement and error handling**
  In `js/fileUtils.cjs`:
  - Attach immediate error listener to `writer`:
    ```javascript
    let writerError = null;
    const onWriterError = (err) => { writerError = err; };
    writer.on('error', onWriterError);
    ```
  - Introduce `downloadCompleted = false;` set after `await finished(writer);`.
  - Transactional replacement on overwrite:
    - If `fs.existsSync(outputPath)`:
      - `const backupPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.bak`;`
      - Stage: `fs.renameSync(outputPath, backupPath);`
      - Commit: try `fs.renameSync(partPath, outputPath);`
      - Rollback: if Commit throws, attempt `fs.renameSync(backupPath, outputPath);` and re-throw.
      - Cleanup: if Commit succeeds, try `fs.unlinkSync(backupPath);`.
    - If `!fs.existsSync(outputPath)`:
      - `fs.renameSync(partPath, outputPath);`
  - In `catch (error)`:
    - If `!downloadCompleted`: clean up incomplete `.part` file.
    - If `downloadCompleted === true`: **do not unlink `.part`**; log recovery location.
  In `js/commands/download.cjs`:
  - When download handler returns `{ ok: false }` or throws:
    - Increment `metrics.totalFilesFailed += 1;`
    - Throw `OperationalError` or record failure so the CLI exits with non-zero status when any download fails.

- [ ] **Step 4: Run tests to verify pass (GREEN)**
  `npm test -- --testPathPatterns=fileUtils.atomicReplace.test.js` passes.
  `npm test -- --testPathPatterns=commands/download.enhanced.test.js` passes.

- [ ] **Step 5: Commit**
  ```bash
  git add js/fileUtils.cjs js/commands/download.cjs tests/unit/fileUtils.atomicReplace.test.js tests/unit/commands/download.enhanced.test.js
  git commit -m "fix(download): failure-safe destination backup/rollback on overwrite and failure tracking (#155)"
  ```

---

### Task 5: Batch Restoration State Updates & Unknown ETA Reconciliation (Issue #153)

**Files:**
- Modify: `js/archiveUtils.cjs`
- Modify: `js/fetchUtils.cjs`
- Modify: `js/commands/resume.cjs`
- Modify: `js/restorationState.cjs`
- Create: `tests/unit/fetchUtils.batchRestore.test.js` (keeps tests under 600 line budget)
- Test: `tests/unit/archiveUtils.enhanced.test.js`
- Test: `tests/unit/commands/resume.test.js`

- [ ] **Step 1: Write failing tests in `tests/unit/fetchUtils.batchRestore.test.js` & `resume.test.js`**
  1. Test: In `fetchUtils`, an analysis with multiple archived files invokes `/archive/analysis/restore` once for the analysis, and calls `appendBatchToAwaitingRestoration` once with all restored entries.
  2. Test: `triggerRestoreArchivedFile` returns `{ analysisId, fileName, restoreEstimation, options }` and supports `persistState = false`.
  3. Test: In `resume.cjs`, an entry with `restoreEstimation: null` triggers link availability checking rather than being permanently skipped.

- [ ] **Step 2: Run tests to observe failure (RED)**
  `npm test -- --testPathPatterns=fetchUtils.batchRestore.test.js`

- [ ] **Step 3: Implement batch restoration and ETA handling**
  In `js/archiveUtils.cjs`:
  - Add `persistState = true` parameter to `triggerRestoreArchivedFile`.
  - Return `RestorationEntry` on success, `null` on failure.
  - Only call `appendToAwaitingRestoration` if `persistState === true`.
  In `js/fetchUtils.cjs` (`getDownloadLinks`):
  - Collect archived files to restore for each analysis.
  - Trigger restore once per analysis (or for the batch).
  - Map restored files to `RestorationEntry` array.
  - Persist via `appendBatchToAwaitingRestoration` in one call.
  In `js/commands/resume.cjs`:
  - Align readiness check: if `!entry.restoreEstimation || new Date(entry.restoreEstimation) <= now`, proceed with checking/resuming rather than unconditionally requeueing.

- [ ] **Step 4: Run tests to verify pass (GREEN)**
  `npm test -- --testPathPatterns=fetchUtils.batchRestore.test.js` passes.
  `npm test -- --testPathPatterns=archiveUtils.enhanced.test.js` passes.
  `npm test -- --testPathPatterns=commands/resume.test.js` passes.

- [ ] **Step 5: Commit**
  ```bash
  git add js/archiveUtils.cjs js/fetchUtils.cjs js/commands/resume.cjs js/restorationState.cjs tests/unit/fetchUtils.batchRestore.test.js
  git commit -m "perf(archive): batch restoration-state updates, single analysis restore trigger, and ETA reconciliation (#153)"
  ```

---

### Task 6: Configure Undici Agent Pool Timeouts (Issue #152 - Part 1)

**Files:**
- Modify: `js/net/httpAgent.cjs`
- Modify: `tests/unit/net/httpAgent.enhanced.test.js`

- [ ] **Step 1: Update tests in `tests/unit/net/httpAgent.enhanced.test.js`**
  Assert `Agent` is called with `{ connectTimeout: 15000, keepAliveTimeout: 30000, keepAliveMaxTimeout: 60000 }`.
  Assert `ProxyAgent` is called with `{ uri: ..., connectTimeout: 15000, keepAliveTimeout: 30000, keepAliveMaxTimeout: 60000 }`.

- [ ] **Step 2: Run test to observe failure (RED)**
  `npm test -- --testPathPatterns=httpAgent.enhanced.test.js`

- [ ] **Step 3: Implement agent pool timeouts**
  In `js/net/httpAgent.cjs`:
  Define `DEFAULT_AGENT_OPTIONS = { connectTimeout: 15_000, keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000 }`.
  Pass to `Agent` and `ProxyAgent`.

- [ ] **Step 4: Run test to verify pass (GREEN)**
  `npm test -- --testPathPatterns=httpAgent.enhanced.test.js` passes.

- [ ] **Step 5: Commit**
  ```bash
  git add js/net/httpAgent.cjs tests/unit/net/httpAgent.enhanced.test.js
  git commit -m "perf(net): configure explicit Undici connect and keep-alive pool timeouts (#152)"
  ```

---

### Task 7: Request Deadlines, Fresh Per-Attempt Signals, Socket Body Drain, and Jitter (Issue #152 - Part 2)

**Files:**
- Modify: `js/apiClient.cjs`
- Modify: `js/authService.cjs`
- Modify: `js/fileUtils.cjs`
- Modify: `tests/unit/apiClient.test.js`

- [ ] **Step 1: Write failing tests in `tests/unit/apiClient.test.js`**
  1. Test: Fresh per-attempt timeout signal is attached to each fetch attempt.
  2. Test: Caller explicit abort (`signal.aborted`) terminates retries immediately without exponential delay.
  3. Test: On non-ok response, `response.body?.cancel()` is called before retrying and before terminal throw.
  4. Test: When `timeout: 0`, no timeout signal is attached.
  5. Test: When `jitter: true`, delays adhere to Equal Jitter formula `[0.5 * backoff, 1.0 * backoff]`; when `jitter: false`, delays are exact nominal backoff.
  6. Test: In `js/fileUtils.cjs`, `downloadFile` passes `{ timeout: 0 }`.

- [ ] **Step 2: Run tests to observe failure (RED)**
  `npm test -- --testPathPatterns=apiClient.test.js`

- [ ] **Step 3: Implement request timeouts, body cancellation, and jitter**
  In `js/apiClient.cjs`:
  - Strip wrapper options (`timeout`, `jitter`) before delegating to `fetch`.
  - In retry loop:
    - Create fresh `AbortSignal.timeout(...)` for each attempt unless `timeout === 0 || timeout === null`.
    - If `options.signal` is provided, combine via `AbortSignal.any([options.signal, attemptTimeout])`.
    - If `response && !response.ok`: call `try { await response.body?.cancel(); } catch {}` before backoff and before throwing.
    - If caller aborted (`options.signal?.aborted`): throw immediately, do not retry.
    - Backoff sleep: make interruptible if signal aborts.
    - Equal Jitter formula: `const delay = Math.round(nominalBackoff * 0.5 + Math.random() * (nominalBackoff * 0.5));`.
  In `js/authService.cjs`:
  - Apply 30s request deadline to authentication calls.
  In `js/fileUtils.cjs`:
  - Pass `{ timeout: 0 }` in `fetchWithRetry` to preserve long streaming transfers.

- [ ] **Step 4: Run tests to verify pass (GREEN)**
  `npm test -- --testPathPatterns=apiClient.test.js` passes.
  `npm test -- --testPathPatterns=authService.test.js` passes.
  `npm test -- --testPathPatterns=fileUtils.atomicReplace.test.js` passes.

- [ ] **Step 5: Commit**
  ```bash
  git add js/apiClient.cjs js/authService.cjs js/fileUtils.cjs tests/unit/apiClient.test.js
  git commit -m "perf(net): add fresh per-attempt request deadlines, socket body cancellation, and retry jitter (#152)"
  ```

---

### Task 8: Full Verification Gate, Draft PR & Adversarial Review

- [ ] **Step 1: Run full gate**
  ```bash
  npm run check
  ```
  Verify 100% pass:
  - `npm run lint`
  - `npx prettier --check .`
  - `npm run type-check`
  - `npm test` (all 45 test suites pass)
  - `npm run architecture:check`

- [ ] **Step 2: Push branch and create draft PR**
  Push branch `fix/remediation-followups-152-156` to origin.
  Create draft PR linking issues #152, #153, #154, #155, #156.

- [ ] **Step 3: Adversarial Code Review via Codex CLI (`gpt-6-astra`)**
  Run `codex exec -m gpt-6-astra` against the git diff.
  Address any review findings until pristine.
  Re-run `npm run check`.
