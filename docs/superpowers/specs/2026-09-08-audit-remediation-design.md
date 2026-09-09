# Design: Security, Performance, and Stability Remediation (#147, #148, #149)

- **Date:** 2026-09-08
- **Status:** Approved (Adversarially reviewed by Codex GPT-6 Astra)
- **GitHub Issues:** [#147](https://github.com/LaborBerlin/varvis-download/issues/147), [#148](https://github.com/LaborBerlin/varvis-download/issues/148), [#149](https://github.com/LaborBerlin/varvis-download/issues/149)
- **Scope:** Ten verified, module-local defects and architectural improvements identified during the security, performance, and concurrency audit of `varvis-download`.
- **Traceability Note (Post-PR #151):** Follow-up items from #149 and PR #151 are tracked and implemented in dedicated issues: #152 (network timeouts/jitter), #153 (production restoration batching), #154 (confirmOverwrite cleanup), #155 (failure-safe .part overwrite replacement), and #156 (traceability alignment). Tasks 9 & 10 (safe resume fallback, atomic .part downloads, capped stderr buffer) originated from pipeline reliability issue #148.
- **Public Hygiene Note:** This repository is public/open source. All examples, tests, and documentation use synthetic identifiers (`AN00001`, `sample.bam`, `chr1:100-200`). No internal identifiers, customer identifiers, patient data, or environment credentials appear anywhere in this design.

---

## Goal

Resolve the 10 prioritized security vulnerabilities, process deadlocks, race conditions, and performance bottlenecks identified during the audit across Issues #147, #148, and #149 end-to-end with focused unit tests, strict backwards compatibility, and a passing CI gate (`npm run check`).

## Non-goals

- No rewrite of the fundamental CLI structure or command interface.
- No new external binary dependencies beyond `samtools`, `tabix`, and `bgzip`.
- No modification of the Varvis backend API schema or authentication contract.
- Broader undici connection pool tuning and request backoff jitter are deferred to a dedicated follow-up PR to keep this remediation focused on verified defect fixes.

---

## Remediation Units

### D1 — Target Subdomain Format Validation (`configMerge.cjs`)

**Files:** `js/cli/configMerge.cjs`, `js/errors.cjs`, `tests/unit/cli/configMerge.test.js`

**Problem.** In `js/authService.cjs`, the target parameter is directly concatenated into `https://${target}.varvis.com/login`. If a user supplies `--target "attacker.com#"`, the WHATWG URL standard treats `#` as a fragment delimiter, resolving the hostname to `attacker.com`. In `AuthService.login`, the plaintext username and password are submitted directly to the attacker-controlled host via POST.

**Fix.** In `js/cli/configMerge.cjs` (`mergeConfig`), validate that `merged.target` is a strictly alphanumeric subdomain (with hyphens allowed, but no leading/trailing hyphens, no dots, slashes, or URL metacharacters). Reject invalid targets immediately with `ConfigurationError`.

```javascript
const VALID_TARGET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

if (merged.target && !VALID_TARGET_PATTERN.test(merged.target)) {
  throw new ConfigurationError(
    `Invalid --target "${merged.target}": must be a valid alphanumeric subdomain.`,
  );
}
```

**Testing.** Add unit tests in `tests/unit/cli/configMerge.test.js` verifying that valid subdomains (`demo`, `prod-01`, `my-env`) pass, while malicious payloads (`attacker.com#`, `evil.com/path`, `target?query`, `target@attacker`) throw `ConfigurationError`.

---

### D2 — Remote API Filename Sanitization (`generateOutputFileName`)

**Files:** `js/rangedUtils.cjs`, `tests/unit/rangedUtils.test.js`

**Problem.** `generateOutputFileName` in `js/rangedUtils.cjs` returns `fileName` directly when `regions.length === 0`. The caller passes this to `path.join(destination, fileName)`. If an API response returns a path traversal payload such as `../../etc/cron.d/job`, `path.join` resolves outside the target destination folder.

**Fix.** In `generateOutputFileName`, normalize directory separators (`\\` to `/`) before extracting `path.basename(normalized)` to prevent cross-platform traversal (e.g. Windows-style paths passed on POSIX systems).

```javascript
function generateOutputFileName(fileName, regions, logger) {
  // Normalize both POSIX and Windows separators before basename
  const safeFileName = path.basename(fileName.replace(/\\/g, '/'));
  if (
    !regions ||
    regions.length === 0 ||
    (regions.length === 1 && regions[0] === '')
  ) {
    logger.debug(`No regions provided. Returning sanitized filename: ${safeFileName}`);
    return safeFileName;
  }
  // Use safeFileName for compound extensions (.vcf.gz, .bam.bai, etc.)
  let extension, baseName;
  if (safeFileName.endsWith('.vcf.gz')) {
    extension = '.vcf.gz';
    baseName = safeFileName.slice(0, -7);
  } else if (safeFileName.endsWith('.vcf.gz.tbi')) {
    extension = '.vcf.gz.tbi';
    baseName = safeFileName.slice(0, -11);
  } else if (safeFileName.endsWith('.bam.bai')) {
    extension = '.bam.bai';
    baseName = safeFileName.slice(0, -8);
  } else {
    extension = path.extname(safeFileName);
    baseName = path.basename(safeFileName, extension);
  }
  // ...
}
```

**Testing.** Add unit tests in `tests/unit/rangedUtils.test.js` confirming that `../../file.bam` and `subdir/file.bam` produce `file.bam`.

---

### D3 — Move `dotenv` to Production Dependencies (`package.json`)

**Files:** `package.json`

**Problem.** Line 3 of `varvis-download.cjs` calls `require('dotenv').config({ quiet: true })`. However, `dotenv` is defined under `devDependencies` in `package.json`. In production installations (`npm install -g varvis-download` or `npm ci --omit=dev`), the application throws `Cannot find module 'dotenv'`.

**Fix.** Move `"dotenv": "^17.4.2"` from `devDependencies` to `dependencies` in `package.json`.

**Testing.** Verify with `npm ls --omit=dev` that `dotenv` is present in production dependency resolution.

---

### D4 — Restrict Temporary BED File Permissions to `0600` (`regionParsing.cjs`)

**Files:** `js/io/regionParsing.cjs`, `tests/unit/io/regionParsing.test.js`

**Problem.** `parseRegions` creates temporary BED files in `os.tmpdir()` using default `writeFileSync` permissions (umask-dependent, typically `0644`). In shared HPC/compute environments, diagnostic genomic intervals can be read by other local users.

**Fix.** Explicitly specify `{ mode: 0o600 }` when writing the temporary BED files in both the command-line range and input BED branches of `parseRegions`.

```javascript
fs.writeFileSync(tempBedPath, bedContent, { mode: 0o600 });
```

**Testing.** In `tests/unit/io/regionParsing.test.js`, check that the created temporary file has POSIX mode `0600` on platforms supporting file modes.

---

### D5 — Stream Error Deadlock & Process Cleanup in `rangedDownloadVCF` (`rangedUtils.cjs`)

**Files:** `js/rangedUtils.cjs`, `tests/unit/rangedUtils.test.js`

**Problem.** In `rangedDownloadVCF`, `tabixProcess.stdout.pipe(bgzipProcess.stdin)` and `bgzipProcess.stdout.pipe(outputStream)` are manually linked. Completion requires `bgzipClosed && streamFinished`. If `outputStream` emits `'error'` (e.g. disk full `ENOSPC`), writable streams never emit `'finish'`. `streamFinished` stays false indefinitely, child processes block on full OS pipe buffers, and the returned Promise hangs forever.

**Fix.** 
1. Attach process error/termination logic to `outputStream.on('error')`, sending `SIGTERM` (and `SIGKILL` on timeout) to `tabixProcess` and `bgzipProcess`.
2. Add a `tryReject` function that allows immediate Promise rejection on stream or spawn error without waiting for `'finish'`.
3. Destroy upstream pipes when downstream writable fails.

```javascript
outputStream.on('error', (err) => {
  onProcessError('outputStream', err);
  if (!tabixProcess.killed) tabixProcess.kill('SIGTERM');
  if (!bgzipProcess.killed) bgzipProcess.kill('SIGTERM');
  tryReject(err);
});
```

**Testing.** Add a unit test verifying that if `outputStream` emits an error, child processes are terminated and `rangedDownloadVCF` rejects promptly instead of hanging.

---

### D6 — Order Inversion: Download BAI Index Before Primary BAM (`bamHandler.cjs`)

**Files:** `js/download/bamHandler.cjs`, `js/download/commonDownload.cjs`, `tests/unit/download/bamHandler.test.js`

**Problem.** In `handleBamFile`, presigned S3 URLs for both `sample.bam` and `sample.bam.bai` are resolved at the start. In `fullDownloadWithOptionalIndex`, the primary BAM is downloaded first, followed by the BAI. For large BAM files (50–100GB), downloads take several hours. AWS S3 presigned URLs expire after 1 hour (3600 seconds). By the time the BAM download finishes, the BAI presigned URL has expired, failing with HTTP 403 Forbidden.

**Fix.** In `fullDownloadWithOptionalIndex`, download the lightweight `.bai` index file (1–10MB) **before** initiating the multi-gigabyte primary BAM download.

```javascript
// js/download/commonDownload.cjs
async function fullDownloadWithOptionalIndex({ primary, index, overwrite }, deps) {
  // Download the index FIRST while presigned URLs are fresh
  if (index) {
    try {
      deps.logger.info(`Downloading index file: ${index.label}`);
      await downloadFile(
        index.url,
        index.path,
        overwrite,
        deps.agent,
        deps.rl,
        deps.logger,
        deps.metrics,
      );
    } catch (error) {
      deps.logger.warn(`Could not download index file: ${getErrorMessage(error)}`);
    }
  }

  // Then download the large primary file
  await downloadFile(
    primary.url,
    primary.path,
    overwrite,
    deps.agent,
    deps.rl,
    deps.logger,
    deps.metrics,
  );
}
```

**Testing.** Update `tests/unit/download/bamHandler.test.js` and `commonDownload.test.js` to assert the index download occurs prior to the primary download.

---

### D7 — Skip Redundant `samtools index` When Index Was Downloaded (`bamHandler.cjs`)

**Files:** `js/download/bamHandler.cjs`, `tests/unit/download/bamHandler.test.js`

**Problem.** In `handleBamFile`, after `fullDownloadWithOptionalIndex` downloads both `sample.bam` and `sample.bam.bai`, line 88 unconditionally calls `indexBAM(outputFile, logger, overwrite)`. Inside `indexBAM`, if `overwrite` is true, the check `if (fs.existsSync(indexFile) && !overwrite)` is false, causing `samtools index` to recompute the entire index from scratch (30–45 minutes of CPU and disk thrashing on a 100GB BAM).

**Fix.** Have `fullDownloadWithOptionalIndex` return `{ indexDownloaded: boolean }` indicating whether the index was successfully downloaded during this session. If `indexDownloaded` is true, bypass `indexBAM`. Only invoke `indexBAM` if an index file was missing or failed to download from the server.

```javascript
const { indexDownloaded } = await fullDownloadWithOptionalIndex(
  { index: indexOption, overwrite, primary: primaryOption },
  deps,
);
if (!indexDownloaded) {
  await indexBAM(outputFile, logger, overwrite);
} else {
  logger.info(`Valid index file downloaded from server, skipping samtools index.`);
}
```

**Testing.** Add a unit test verifying that `indexBAM` is skipped when `fullDownloadWithOptionalIndex` reports `indexDownloaded: true`.

---

### D8 — Batch Synchronous Archive Restoration Ingestion (`archiveUtils.cjs`)

**Files:** `js/archiveUtils.cjs`, `js/restorationState.cjs`, `tests/unit/archiveUtils.test.js`

**Problem.** In `getDownloadLinks`, every archived file triggers `appendToAwaitingRestoration`. This function synchronously reads `awaiting-restoration.json`, parses JSON, appends one item, stringifies, and synchronously writes back to disk. For a cohort of 1,000 files, this performs $O(N^2)$ synchronous disk I/O and JSON operations, blocking the event loop.

**Fix.** In `js/archiveUtils.cjs`, collect all restored entries for the analysis into an array, and invoke a new bulk insertion helper `appendBatchToAwaitingRestoration` that reads, parses, merges, and writes the JSON file once per analysis.

```javascript
// js/restorationState.cjs
function appendBatchToAwaitingRestoration(entries, filePath, logger) {
  if (!entries || entries.length === 0) return;
  const current = readRestorationState(filePath, logger) || [];
  // Merge or append entries
  // ...
  writeRestorationState(updated, filePath, logger);
}
```

**Testing.** Add a unit test verifying batch insertion of restoration entries with a single file write.

---

### D9 — Prevent Silent 100GB Full Download Fallback in Resume (`resume.cjs`)

**Files:** `js/commands/resume.cjs`, `tests/unit/commands/resume.test.js`

**Problem.** When resuming an archived download that originally specified `--bed`, if the BED file cannot be read (e.g. was deleted from `/tmp`), line 130 logs a warning and proceeds with an unexpected full 100GB file download without user consent.

**Fix.** When a ranged download's BED file cannot be read during resume, do not fall back to a full download. Log an error, keep the entry in `awaiting-restoration.json`, and skip to the next entry so the user can restore or update the BED file.

```javascript
} catch (bedError) {
  logger.error(
    `Cannot read BED file ${restoredOptions.bed} for analysis ${entry.analysisId}: ${getErrorMessage(bedError)}. Keeping entry for retry; will not silently convert to full download.`,
  );
  updatedData.push(entry);
  continue;
}
```

**Testing.** Add unit test asserting that missing BED during resume keeps the entry queued and does not initiate a full download.

---

### D10 — Atomic Temporary Download Writes & Stderr Buffer Caps (`fileUtils.cjs`, `rangedUtils.cjs`)

**Files:** `js/fileUtils.cjs`, `js/rangedUtils.cjs`, `tests/unit/fileUtils.test.js`

**Problem.** 
1. In `downloadFile`, `fs.createWriteStream(outputPath)` immediately truncates pre-existing files before `fetchWithRetry` succeeds. If the network fails, the original file is lost.
2. In `rangedUtils.cjs`, `tabixError += data.toString()` accumulates child process stderr without bounds, risking V8 heap OOM on large noisy runs.

**Fix.**
1. In `downloadFile`, stream into a temporary part file `${outputPath}.${process.pid}.part`. Once the stream finishes and is closed, if `outputPath` exists on disk, unlink it (mandatory on Windows/NTFS to avoid `EPERM`/`EBUSY` on rename), then atomically rename the part file to `outputPath`.
2. In `rangedUtils.cjs`, cap stderr accumulator strings to 65,536 bytes (64KB).

---

## Verification & Local Gate

Every unit will be validated with:
1. Focused Jest unit tests mirroring each module under `tests/unit/`.
2. Clean type check (`npm run type-check`).
3. Clean lint check (`npm run lint`).
4. Architecture budget verification (`npm run architecture:check`).
