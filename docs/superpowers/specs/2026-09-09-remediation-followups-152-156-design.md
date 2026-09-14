# Design: Audit Follow-Up Remediation (#152, #153, #154, #155, #156)

- **Date:** 2026-09-09
- **Status:** Approved (Incorporated Adversarial Review Findings from Codex GPT-6 Astra)
- **GitHub Issues:**
  - [#152](https://github.com/LaborBerlin/varvis-download/issues/152): `perf(net): configure explicit Undici timeouts and retry backoff jitter`
  - [#153](https://github.com/LaborBerlin/varvis-download/issues/153): `perf(archive): batch restoration-state updates in production restore flow`
  - [#154](https://github.com/LaborBerlin/varvis-download/issues/154): `refactor(file): remove or integrate unused confirmOverwrite helper`
  - [#155](https://github.com/LaborBerlin/varvis-download/issues/155): `fix(download): make final .part replacement failure-safe on overwrite`
  - [#156](https://github.com/LaborBerlin/varvis-download/issues/156): `docs: align remediation traceability across #147, #148, #149 and PR #151`
- **Scope:** Five verified follow-up defects, performance enhancements, code cleanup items, and documentation traceability fixes following the merge of PR #151.
- **Public Hygiene Note:** This repository is public/open source. All examples, tests, and documentation use synthetic identifiers (`AN00001`, `sample.bam`, `chr1:100-200`). No internal hospital identifiers, patient credentials, or sensitive data appear anywhere.

---

## 1. Executive Summary & Review Synthesis

Following the adversarial review by Codex GPT-6 Astra, this specification addresses the systemic edge cases, resource cleanup guarantees, lifecycle gaps, and CLI error propagation across the five issues:
1. **Failure-Safe Replacement (#155):** A robust transaction lifecycle (Stage → Commit → Rollback / Cleanup) with early stream error binding, destination backup rollback on Windows/POSIX, prevention of double-deletion, and failure status propagation to the CLI caller.
2. **Dead Code Elimination (#154):** Removal of `confirmOverwrite` and its tests/docs, updating `downloadFile`'s signature to `_rl`, with clear documentation of the public export removal.
3. **Archive Restoration Batching & Idempotency (#153):** Grouping restoration requests by `analysisId` in `js/fetchUtils.cjs` so that the Varvis `/archive/analysis/restore` endpoint is invoked once per analysis rather than once per file, collecting all file intents and persisting them via `appendBatchToAwaitingRestoration` in a single synchronous disk write.
4. **Network Resilience & Timeout Contracts (#152):**
   - Explicit Undici Agent options: `connectTimeout: 15_000`, `keepAliveTimeout: 30_000`, `keepAliveMaxTimeout: 60_000`.
   - Fresh per-attempt `AbortSignal.timeout(...)` for API requests to prevent subsequent retry starvation.
   - Clean separation of caller-abort (fail fast, no retry) vs timeout-abort (retryable).
   - Response body consumption/cancellation (`response.body.dump()`) on failed HTTP attempts before backoff to avoid Undici socket leaks.
   - Enforce request deadlines on authentication requests in `js/authService.cjs`.
   - Dedicated streaming contract: streaming downloads in `js/fileUtils.cjs` use `timeout: 0` (no total deadline), relying on Undici's connection timeout, while JSON API requests enforce per-attempt deadlines.
   - Jittered retry backoff with AWS decorrelated jitter (50%–100% of nominal delay), configurable via `options.jitter`.
5. **Traceability (#156):** Full reconciliation in `CHANGELOG.md` and PR #151 metadata between #147 (security), #148 (pipeline reliability), #149 (audit origin), and follow-ups #152–#156.

---

## 2. Detailed Technical Specifications

### Unit 1: Documentation Traceability Alignment (Issue #156)

**Files:** `CHANGELOG.md`, `docs/superpowers/specs/2026-09-08-audit-remediation-design.md`, `docs/superpowers/plans/2026-09-08-audit-remediation-plan.md`, PR #151 description.

**Reconciliation Mapping:**
- **Issue #147 (Security):**
  - Subdomain validation in `configMerge.cjs`
  - Remote filename sanitization against path traversal in `generateOutputFileName`
  - Move `dotenv` from devDependencies to production dependencies in `package.json`
  - Restrict temporary BED file permissions to `0600` in `regionParsing.cjs`
- **Issue #148 (Pipeline Reliability):**
  - Child process pipe deadlock resolution and immediate process kill on stream error in `rangedDownloadVCF`
  - Index-first BAM/BAI download sequence to prevent presigned S3 URL expiration
  - Skip redundant `samtools index` when official index was downloaded
  - Safe resume error handling (no silent full 100GB download on missing BED)
  - Streaming `.part` download mechanism
  - Bounded stderr buffer (64KB cap) on tabix/bgzip accumulators
- **Issue #149 (Audit Origin for Performance & Hygiene):**
  - Origin for restoration state batching, Undici socket tuning, request timeouts, and `confirmOverwrite` cleanup.
  - Closed in favor of dedicated, atomic tracking issues: #152 (network), #153 (restoration batching), #154 (dead code), #155 (failure-safe overwrite), #156 (traceability).
- **Follow-up Scope (#152–#156):**
  - #152: Undici connection/keepalive timeouts, fresh per-attempt request deadlines, Undici body drain on retry, retry jitter.
  - #153: Production caller batching for archive restoration state and analysis-level endpoint deduplication.
  - #154: Remove `confirmOverwrite` dead code.
  - #155: Transactional backup/rollback for `.part` overwrite replacement, early writer error trapping, and CLI failure propagation.
  - #156: Traceability alignment across specs, changelog, and PRs.

---

### Unit 2: Failure-Safe Atomic Replacement on Overwrite (Issue #155)

**Files:** `js/fileUtils.cjs`, `js/commands/download.cjs`, `tests/unit/fileUtils.test.js`, `tests/unit/commands/download.enhanced.test.js`

**Lifecycle Architecture:**
1. **Immediate Writer Error Observation:**
   - Create write stream: `const writer = fs.createWriteStream(partPath);`
   - Immediately attach a one-time error listener or promise:
     ```javascript
     let writerError = null;
     const onWriterError = (err) => { writerError = err; };
     writer.on('error', onWriterError);
     ```
   - If an error occurs during pending fetch or initial stream setup, reject cleanly without unhandled rejections.
2. **Download Completion Barrier:**
   - Consume response body chunks with backpressure.
   - Call `writer.end()` and wait for `await finished(writer);`.
   - Mark `downloadCompleted = true;`.
3. **Transactional Replacement (`atomicReplace`):**
   - If `!fs.existsSync(outputPath)`:
     - Execute `fs.renameSync(partPath, outputPath);`
   - If `fs.existsSync(outputPath)`:
     - Generate unique backup path in the same folder:
       `const backupPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.bak`;`
     - **Stage:** `fs.renameSync(outputPath, backupPath);`
       - If Stage fails, `outputPath` was untouched. Throw error.
     - **Commit:**
       - Try `fs.renameSync(partPath, outputPath);`
     - **Rollback (if Commit fails):**
       - If Commit throws `commitError`:
         - Try `fs.renameSync(backupPath, outputPath);`
         - If rollback succeeds: log `Original file restored after failed replacement. Partial download preserved at ${partPath}.`
         - If rollback fails: log `CRITICAL: Both backup ${backupPath} and new file ${partPath} exist; manual inspection required.`
         - Re-throw `commitError`.
     - **Cleanup (if Commit succeeds):**
       - Try `fs.unlinkSync(backupPath);`
       - If unlink fails (e.g. temporary Windows lock), log debug/warn; primary operation succeeded.
4. **Cleanup Invariant in `catch (error)`:**
   - If `!downloadCompleted`:
     - Clean up incomplete `.part` file: `if (fs.existsSync(partPath)) { try { fs.unlinkSync(partPath); } catch {} }`
   - If `downloadCompleted === true`:
     - **DO NOT UNLINK `partPath`!** The download succeeded; the failure occurred during the filesystem replace phase. Log the exact location of `partPath` so the user can manually inspect or recover the file without having to re-download 50GB.
5. **CLI Failure Reporting:**
   - In `js/commands/download.cjs`: Ensure that when downloads fail or return `{ ok: false }`, `metrics.totalFilesFailed` is incremented and the command records a non-zero exit state, preventing scripts from treating failed downloads as successful completions.

---

### Unit 3: Dead Code Elimination — Remove `confirmOverwrite` (Issue #154)

**Files:** `js/fileUtils.cjs`, `tests/unit/fileUtils.test.js`, `docs/api/fileUtils.md`, `js/README.md`

**Changes:**
1. Remove `confirmOverwrite` function from `js/fileUtils.cjs`.
2. Remove `confirmOverwrite` from `module.exports` in `js/fileUtils.cjs`.
3. In `downloadFile(url, outputPath, overwrite, agent, _rl, logger, metrics)`:
   - Mark `_rl` as unused in JSDoc (`@param {import('node:readline').Interface|null} [_rl] - Unused; retained for signature compatibility.`).
4. Remove obsolete test block `describe('confirmOverwrite', ...)` from `tests/unit/fileUtils.test.js`.
5. Remove `confirmOverwrite` entry from `docs/api/fileUtils.md` and `js/README.md`.

---

### Unit 4: Batch Restoration-State Updates & Endpoint Deduplication (Issue #153)

**Files:** `js/archiveUtils.cjs`, `js/fetchUtils.cjs`, `tests/unit/archiveUtils.enhanced.test.js`, `tests/unit/fetchUtils.new.test.js`

**Problem Identified by Codex Review:**
In `js/fetchUtils.cjs`, iterating over 100 archived files of the same analysis currently calls `/archive/analysis/restore` 100 times with the same `analysisIds: analysisId` POST body, because the endpoint operates on the analysis, not individual files!
Furthermore, calling `appendToAwaitingRestoration` per file executes 100 synchronous disk writes.

**Specification:**
1. In `js/archiveUtils.cjs`:
   - Keep `triggerRestoreArchivedFile` backward compatible for standalone calls:
     ```javascript
     async function triggerRestoreArchivedFile(
       analysisId,
       file,
       target,
       token,
       agent,
       logger,
       restorationFile = 'awaiting-restoration.json',
       options = {},
       persistState = true,
     )
     ```
   - When `persistState === true`, it calls `appendToAwaitingRestoration(...)`.
   - It returns the created `RestorationEntry` (`{ analysisId, fileName: file.fileName, restoreEstimation, options }`) or `null` if the API call failed.
2. In `js/fetchUtils.cjs` (`getDownloadLinks`):
   - Group archived files by `analysisId` that need restoration:
     ```javascript
     const archivedFilesToRestore = [];
     ```
   - In the file loop, if `shouldRestore` is true, collect `archivedFilesToRestore.push(file)`.
   - When processing files for an analysis:
     - If `archivedFilesToRestore.length > 0`:
       - Call `/archive/analysis/restore` **once** for the `analysisId` (or call `triggerRestoreArchivedFile` for the first file with `persistState: false` to get the `restoreEstimation`).
       - If restore is successfully initiated:
         - Map all `archivedFilesToRestore` into `RestorationEntry` objects sharing that estimation.
         - Call `await appendBatchToAwaitingRestoration(entries, logger, restorationFile)` **once** for the entire batch.
     - Reduces both network requests to `/archive/analysis/restore` AND disk writes on `awaiting-restoration.json` to exactly 1 per analysis!
3. Handling Missing/Unknown ETA:
   - If `restoreEstimation` is null or missing, still record the entry in `awaiting-restoration.json`. `resume.cjs` will check if files are ready when resumed.

---

### Unit 5: Explicit Undici Timeouts and Retry Backoff Jitter (Issue #152)

**Files:** `js/net/httpAgent.cjs`, `js/apiClient.cjs`, `js/authService.cjs`, `js/fileUtils.cjs`, `js/types.d.ts`, `tests/unit/net/httpAgent.enhanced.test.js`, `tests/unit/apiClient.test.js`

**Undici Agent Configuration:**
```javascript
const DEFAULT_AGENT_OPTIONS = {
  connectTimeout: 15_000,      // 15 seconds to connect
  keepAliveTimeout: 30_000,    // 30 seconds idle keep-alive
  keepAliveMaxTimeout: 60_000, // 60 seconds maximum socket lifetime
};
```
Apply to both `new Agent(DEFAULT_AGENT_OPTIONS)` and `new ProxyAgent({ ...agentOptions, ...DEFAULT_AGENT_OPTIONS })`.

**Request Deadlines & Retry Policy in `js/apiClient.cjs`:**
1. **Types & Options Validation:**
   - Update `UndiciRequestOptions` in `js/types.d.ts` to include:
     - `timeout?: number | null;`
     - `jitter?: boolean;`
2. **Fresh Per-Attempt Timeout Signal:**
   - Do NOT reuse a single `AbortSignal.timeout` across all retry attempts. If attempt 1 fails at T=28s, a 30s shared signal would abort attempt 2 immediately after 2 seconds.
   - On each attempt `1..retries`:
     - If `options.timeout === 0 || options.timeout === null`: no timeout signal created (streaming mode).
     - If `options.timeout !== 0 && options.timeout !== null`:
       - `const timeoutMs = typeof options.timeout === 'number' ? options.timeout : DEFAULT_REQUEST_TIMEOUT_MS;`
       - `const attemptTimeoutSignal = AbortSignal.timeout(timeoutMs);`
       - Combine with caller `options.signal` if present:
         `const effectiveSignal = options.signal ? AbortSignal.any([options.signal, attemptTimeoutSignal]) : attemptTimeoutSignal;`
3. **Response Body Consumption on Error:**
   - If `!response.ok`:
     - Before retrying or throwing, drain/cancel the response body:
       `try { await response.body?.dump(); } catch {}`
     - This releases the Undici socket back to the pool immediately instead of leaving it hung in memory.
4. **Caller-Cancellation vs Timeout Classification:**
   - If `options.signal?.aborted`:
     - The caller explicitly requested cancellation. **Do not retry!** Throw caller abort immediately.
   - If `error.name === 'TimeoutError' || (error.name === 'AbortError' && attemptTimeoutSignal?.aborted)`:
     - This is a transient network timeout. It is retryable!
5. **Jittered Backoff:**
   - `const nominalBackoff = 2 ** (attempt - 1) * BASE_DELAY_MS;`
   - If `options.jitter === false`: `delay = nominalBackoff;` (for deterministic tests).
   - If `options.jitter !== false`:
     - Decorrelated Equal Jitter: `delay = Math.round(nominalBackoff * 0.5 + Math.random() * (nominalBackoff * 0.5));` (50%–100% of nominal backoff).
6. **Authentication Request Deadlines (`js/authService.cjs`):**
   - Apply explicit 30s timeout signal (`AbortSignal.timeout(30_000)`) on all three auth calls (pre-login CSRF, POST login, post-login CSRF).
7. **Streaming File Downloads (`js/fileUtils.cjs`):**
   - `downloadFile` passes `{ timeout: 0 }` to `fetchWithRetry`. Initial connection establishment is protected by Undici Agent's `connectTimeout: 15_000`, while the multi-hour streaming transfer is not prematurely aborted.

---

## 3. Verification & Acceptance Criteria

1. **Architecture & Lint Gates:**
   - `npm run lint` passes (0 errors, 0 warnings).
   - `npx prettier --check .` passes.
   - `npm run type-check` passes (`tsc --noEmit`).
   - `npm run architecture:check` passes (all files strictly under 600 lines).
2. **Test Suite:**
   - All 45 test suites passing (100% green).
   - Dedicated unit tests covering:
     - Writer error during initial fetch setup.
     - Rollback on failed destination rename.
     - Preserving `.part` on commit failure.
     - Single restore call and single state write for multi-file archive restoration.
     - Per-attempt fresh timeout signals.
     - Caller cancellation stopping retries immediately.
     - Response body dump on HTTP non-2xx retry.
     - Jittered retry delays within bounds.
3. **Clinical Grade Validation:**
   - Zero unhandled rejections.
   - Zero socket leaks.
   - Zero data loss on overwrite failure.
