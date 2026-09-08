# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all verified security vulnerabilities, process pipe deadlocks, pre-signed URL expiration race conditions, and disk I/O bottlenecks in `varvis-download`.

**Architecture:** Modular CommonJS implementations across domain modules (`js/cli/configMerge.cjs`, `js/rangedUtils.cjs`, `js/download/`, `js/fileUtils.cjs`, `js/restorationState.cjs`), backed by focused unit test coverage in `tests/unit/`. Preserves strict error-boundary contracts, typed JSDoc, and architecture line budget (<600 lines per file).

**Tech Stack:** Node.js >=22.22.2, CommonJS, Jest 30, undici, winston, yargs 18, child_process.

**Spec:** [`docs/superpowers/specs/2026-09-08-audit-remediation-design.md`](file:///C:/development/varvis-download/.worktrees/audit-perf-sec/docs/superpowers/specs/2026-09-08-audit-remediation-design.md)

## Global Constraints

- Never commit real credentials, internal hospital/laboratory identifiers, or raw proprietary API payloads.
- Use `node:` protocol for built-in module imports (`require('node:fs')`, `require('node:path')`).
- Maintain small files: source and test files must remain under 600 lines (`npm run architecture:check`).
- Exported functions require JSDoc comments satisfying `tsc --noEmit`.
- Verify every task with focused Jest tests before moving to the next task.

---

### Task 1: Target Subdomain Format Validation

**Files:**
- Modify: `js/cli/configMerge.cjs:185-230`
- Test: `tests/unit/cli/configMerge.test.js`

**Interfaces:**
- Consumes: `merged.target` from parsed CLI/env/file configuration.
- Produces: Throws `ConfigurationError` if `merged.target` fails the alphanumeric subdomain regex `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/cli/configMerge.test.js`, add tests verifying invalid target values throw `ConfigurationError`:

```javascript
test('throws ConfigurationError when target contains URL metacharacters or fragments', () => {
  const invalidTargets = [
    'attacker.com#',
    'evil.com/path',
    'target?param=1',
    'user@host',
    '-invalid',
    'invalid-',
  ];
  for (const target of invalidTargets) {
    expect(() =>
      mergeConfig(
        { target, username: 'u', password: 'p', analysisIds: ['AN01'] },
        {},
        {},
      ),
    ).toThrow(ConfigurationError);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=configMerge.test.js`
Expected: FAIL with "Expected received function to throw ConfigurationError".

- [ ] **Step 3: Write minimal implementation**

In `js/cli/configMerge.cjs`, add target validation inside `mergeConfig`:

```javascript
const VALID_TARGET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

if (merged.target && !VALID_TARGET_PATTERN.test(merged.target)) {
  throw new ConfigurationError(
    `Invalid --target "${merged.target}": must be a valid alphanumeric subdomain without special characters, slashes, or fragments.`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=configMerge.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/cli/configMerge.cjs tests/unit/cli/configMerge.test.js
git commit -m "fix(cli): validate --target format to prevent SSRF and credential exfiltration"
```

---

### Task 2: Remote Filename Sanitization against Path Traversal

**Files:**
- Modify: `js/rangedUtils.cjs:400-435`
- Test: `tests/unit/rangedUtils.test.js`

**Interfaces:**
- Consumes: `fileName` from API response (`string`).
- Produces: `safeFileName` guaranteed to be a single base path segment without directory traversals.

- [ ] **Step 1: Write the failing test**

In `tests/unit/rangedUtils.test.js`, add a test for `generateOutputFileName`:

```javascript
test('sanitizes path traversal characters from remote fileName', () => {
  const traversalName = '../../../../etc/shadow.bam';
  const out = generateOutputFileName(traversalName, [], mockLogger);
  expect(out).toBe('shadow.bam');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=rangedUtils.test.js`
Expected: FAIL with `Expected: "shadow.bam"`, `Received: "../../../../etc/shadow.bam"`.

- [ ] **Step 3: Write minimal implementation**

In `js/rangedUtils.cjs` (`generateOutputFileName`):

```javascript
function generateOutputFileName(fileName, regions, logger) {
  const safeFileName = path.basename(fileName.replace(/\\/g, '/'));
  if (
    !regions ||
    regions.length === 0 ||
    (regions.length === 1 && regions[0] === '')
  ) {
    logger.debug(
      `No regions provided. Returning original filename: ${safeFileName}`,
    );
    return safeFileName;
  }
  // Substitute safeFileName in subsequent slice and basename checks...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=rangedUtils.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/rangedUtils.cjs tests/unit/rangedUtils.test.js
git commit -m "fix(ranged): sanitize remote filenames with path.basename against traversal"
```

---

### Task 3: Move `dotenv` to Production Dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `require('dotenv')` in `varvis-download.cjs`.
- Produces: Guarantees module availability on standalone production installs.

- [ ] **Step 1: Move `"dotenv"` in `package.json`**

Move `"dotenv": "^17.4.2"` from `devDependencies` to `dependencies`.

- [ ] **Step 2: Verify production resolution**

Run: `node -e "require('dotenv')"`
Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): move dotenv to production dependencies for standalone CLI installs"
```

---

### Task 4: Enforce `0o600` Permissions on Temporary BED Files

**Files:**
- Modify: `js/io/regionParsing.cjs:65-90`
- Test: `tests/unit/io/regionParsing.test.js`

**Interfaces:**
- Consumes: `tempBedPath`, `bedContent`.
- Produces: Writes temporary BED files strictly readable only by file owner (`0600`).

- [ ] **Step 1: Write the failing test**

In `tests/unit/io/regionParsing.test.js`, assert mode options:

```javascript
test('creates temporary BED file with 0600 permissions', () => {
  const { tempBedPath } = parseRegions({ range: 'chr1:100-200' }, mockLogger);
  const stat = fs.statSync(tempBedPath);
  if (process.platform !== 'win32') {
    expect(stat.mode & 0o777).toBe(0o600);
  }
  fs.unlinkSync(tempBedPath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=regionParsing.test.js`
Expected: FAIL (mode is default umask 0644).

- [ ] **Step 3: Implement `{ mode: 0o600 }`**

In `js/io/regionParsing.cjs`, update both `fs.writeFileSync(tempBedPath, ...)` calls to:
```javascript
fs.writeFileSync(tempBedPath, bedContent, { mode: 0o600 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=regionParsing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/io/regionParsing.cjs tests/unit/io/regionParsing.test.js
git commit -m "fix(regions): restrict temporary BED file permissions to 0600"
```

---

### Task 5: Fix Pipe Deadlock on Writable Error in `rangedDownloadVCF`

**Files:**
- Modify: `js/rangedUtils.cjs:180-240`
- Test: `tests/unit/rangedUtils.test.js`

**Interfaces:**
- Consumes: `outputStream` writable stream, `tabixProcess`, `bgzipProcess`.
- Produces: Rejects Promise immediately on stream write error and kills child processes.

- [ ] **Step 1: Write the failing test**

In `tests/unit/rangedUtils.test.js`, mock a writable stream that emits `'error'` and assert the promise rejects and child processes receive kill signal:

```javascript
test('rangedDownloadVCF rejects promptly and kills child processes when outputStream emits error', async () => {
  // Mock spawn and simulate outputStream error
  // Verify promise rejects without hanging
});
```

- [ ] **Step 2: Implement process termination on stream error**

In `js/rangedUtils.cjs` (`rangedDownloadVCF`):

```javascript
outputStream.on('error', (err) => {
  onProcessError('outputStream', err);
  if (!tabixProcess.killed) tabixProcess.kill('SIGTERM');
  if (!bgzipProcess.killed) bgzipProcess.kill('SIGTERM');
  if (!resolved) {
    resolved = true;
    cleanup();
    reject(new Error(processError || err.message));
  }
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=rangedUtils.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add js/rangedUtils.cjs tests/unit/rangedUtils.test.js
git commit -m "fix(ranged): terminate child processes and reject immediately on outputStream error"
```

---

### Task 6: Invert Download Order: BAI Index Before Primary BAM

**Files:**
- Modify: `js/download/commonDownload.cjs:45-75`
- Test: `tests/unit/download/commonDownload.test.js`

**Interfaces:**
- Consumes: `{ primary, index, overwrite }`.
- Produces: Downloads the lightweight index file first to protect against 1-hour presigned S3 URL expiration during long BAM downloads.

- [ ] **Step 1: Write failing test asserting download order**

In `tests/unit/download/commonDownload.test.js`, verify `downloadFile` is called for `index.url` before `primary.url`.

- [ ] **Step 2: Update `fullDownloadWithOptionalIndex` execution sequence**

In `js/download/commonDownload.cjs`, move the `if (index)` block before `await downloadFile(primary.url, ...)`:

```javascript
async function fullDownloadWithOptionalIndex(
  { index, overwrite, primary },
  deps,
) {
  let indexDownloaded = false;
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
      indexDownloaded = true;
    } catch (error) {
      deps.logger.warn(
        `Could not download index file for ${primary.path}: ${getErrorMessage(error)}. Attempting primary download anyway.`,
      );
    }
  }

  await downloadFile(
    primary.url,
    primary.path,
    overwrite,
    deps.agent,
    deps.rl,
    deps.logger,
    deps.metrics,
  );

  return { indexDownloaded };
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=commonDownload.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add js/download/commonDownload.cjs tests/unit/download/commonDownload.test.js
git commit -m "fix(download): download BAI index before primary BAM to prevent presigned URL expiry"
```

---

### Task 7: Skip Redundant `samtools index` When Index Was Downloaded

**Files:**
- Modify: `js/download/bamHandler.cjs:68-95`
- Test: `tests/unit/download/bamHandler.test.js`

**Interfaces:**
- Consumes: `indexDownloaded` from `fullDownloadWithOptionalIndex`.
- Produces: Bypasses `indexBAM` if index was successfully downloaded during this session.

- [ ] **Step 1: Update `handleBamFile` logic**

In `js/download/bamHandler.cjs`:

```javascript
const { indexDownloaded } = await fullDownloadWithOptionalIndex(
  {
    index: indexFileUrl
      ? { label: indexFileName, path: indexFilePath, url: indexFileUrl }
      : null,
    overwrite,
    primary: { path: outputFile, url: downloadLink },
  },
  deps,
);

if (!indexDownloaded) {
  await indexBAM(outputFile, logger, overwrite);
} else {
  logger.info(`Valid index file downloaded from server, skipping samtools index.`);
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=bamHandler.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add js/download/bamHandler.cjs tests/unit/download/bamHandler.test.js
git commit -m "perf(bam): skip redundant samtools index when index file was downloaded from server"
```

---

### Task 8: Batch Restoration State Updates

**Files:**
- Modify: `js/restorationState.cjs`, `js/archiveUtils.cjs`
- Test: `tests/unit/restorationState.test.js`

**Interfaces:**
- Produces: `appendBatchToAwaitingRestoration(entries, filePath, logger)` performing a single read-modify-write cycle.

- [ ] **Step 1: Write failing test in `restorationState.test.js`**
- [ ] **Step 2: Implement batch restoration state write**
- [ ] **Step 3: Run test to verify it passes**
- [ ] **Step 4: Commit**

```bash
git add js/restorationState.cjs js/archiveUtils.cjs tests/unit/restorationState.test.js
git commit -m "perf(archive): batch restoration state file writes to eliminate O(N^2) synchronous I/O"
```

---

### Task 9: Prevent Silent Whole-Genome Download Fallback in Resume

**Files:**
- Modify: `js/commands/resume.cjs:118-135`
- Test: `tests/unit/commands/resume.test.js`

**Interfaces:**
- Consumes: `restoredOptions.bed`.
- Produces: If BED file cannot be read, requeues entry with error log rather than falling back to full download.

- [ ] **Step 1: Write failing test in `resume.test.js`**
- [ ] **Step 2: Implement safe error handling and requeue**
- [ ] **Step 3: Run test to verify it passes**
- [ ] **Step 4: Commit**

```bash
git add js/commands/resume.cjs tests/unit/commands/resume.test.js
git commit -m "fix(resume): fail fast and requeue when BED file is missing instead of silent full download"
```

---

### Task 10: Atomic Temporary File Downloads & Safe Stderr Window

**Files:**
- Modify: `js/fileUtils.cjs:34-135`, `js/rangedUtils.cjs:195-205`
- Test: `tests/unit/fileUtils.test.js`

**Interfaces:**
- Produces: Downloads to `.part` file, renaming on success; caps stderr string accumulator at 64KB.

- [ ] **Step 1: Write test for atomic `.part` download**

In `tests/unit/fileUtils.test.js`, assert that partial downloads do not touch or truncate the final `outputPath` until the transfer has fully succeeded.

- [ ] **Step 2: Implement atomic download and stderr cap**

In `js/fileUtils.cjs` (`downloadFile`), write to a `.part` temporary file and handle cross-platform rename:
```javascript
const partPath = `${outputPath}.${process.pid}.part`;
writer = fs.createWriteStream(partPath);
// ... stream chunks ...
await finished(writer);
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath); // Safe for Windows NTFS overwrite
}
fs.renameSync(partPath, outputPath);
```

In `js/rangedUtils.cjs`, cap stderr:
```javascript
if (tabixError.length < 65536) tabixError += data.toString();
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=fileUtils.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add js/fileUtils.cjs js/rangedUtils.cjs tests/unit/fileUtils.test.js
git commit -m "fix(download): atomic .part writes and capped stderr buffer window"
```
