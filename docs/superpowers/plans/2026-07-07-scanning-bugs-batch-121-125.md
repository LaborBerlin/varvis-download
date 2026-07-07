# scanning-for-bugs batch (#121–#125) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five independent, verified defects (#121–#125) with focused TDD, no regressions, and a green `npm run check`.

**Architecture:** Each task fixes one production module and updates the tests that pin the buggy behavior. Tasks are independent and can run in any order; each ends with a passing focused test run and a commit.

**Tech Stack:** Node.js 24 (repo floor ≥22.22.2), CommonJS `.cjs`, Jest 30, undici 8.7, ESLint 10 (jsdoc/unicorn/security), `tsc --noEmit` strict `checkJs`.

## Global Constraints

- CommonJS only in `js/` and root `*.cjs`: `require()` + `module.exports`, never ESM.
- Use `node:` protocol for builtins (`require('node:fs')`). Enforced by `unicorn/prefer-node-protocol`.
- JSDoc required on every exported function/class/method in `js/**/*.cjs` and root `*.cjs`.
- Keep every file < 600 lines (warns at 500). All target files stay well under budget.
- No new external deps, no new CLI flags. Only `node:` builtins added.
- Focused test run: `npm test -- --testPathPatterns=<name>`. Full gate: `npm run check`.
- Jest 30 uses `--testPathPatterns` (plural), not `--testPathPattern`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01XRCFoXRU6wYdMrS3wYGiDE`.

---

### Task 1: fetchWithRetry — fast-fail 4xx + true exponential backoff (#125)

**Files:**
- Modify: `js/apiClient.cjs` (class `ApiClient`, method `fetchWithRetry`, lines ~35–59; add `HttpResponseError` + `BASE_DELAY_MS`; add to `module.exports`)
- Test: `tests/unit/apiClient.test.js`

**Interfaces:**
- Produces: `HttpResponseError extends Error { status: number; retryable: boolean }`, exported from `js/apiClient.cjs`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe('ApiClient', () => { describe('fetchWithRetry', ...` block in `tests/unit/apiClient.test.js`:

```js
test('fails fast on 404 without retrying', async () => {
  undici.fetch.mockResolvedValue({ ok: false, status: 404 });

  const client = new ApiClient(mockAgent, mockLogger);

  await expect(
    client.fetchWithRetry('https://api.example.com', {}, 3),
  ).rejects.toThrow('Fetch failed with status: 404');

  expect(undici.fetch).toHaveBeenCalledTimes(1);
  expect(mockLogger.warn).not.toHaveBeenCalled();
  expect(mockLogger.error).toHaveBeenCalledWith(
    'Fetch failed after 1 attempt: Fetch failed with status: 404',
  );
});

test('retries on 429 (rate limited) then succeeds', async () => {
  jest.useFakeTimers();
  const successResponse = { ok: true, status: 200 };
  undici.fetch
    .mockResolvedValueOnce({ ok: false, status: 429 })
    .mockResolvedValueOnce(successResponse);

  const client = new ApiClient(mockAgent, mockLogger);
  const promise = client.fetchWithRetry('https://api.example.com', {}, 3);
  await jest.advanceTimersByTimeAsync(1000);
  const response = await promise;

  expect(response).toBe(successResponse);
  expect(undici.fetch).toHaveBeenCalledTimes(2);
  expect(mockLogger.warn).toHaveBeenCalledWith(
    'Fetch attempt 1 failed. Retrying...',
  );
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPatterns=apiClient`
Expected: FAIL — 404 test sees 3 fetch calls (currently retries), 429 message/flow differs.

- [ ] **Step 3: Implement** — in `js/apiClient.cjs`, after the `DEFAULT_HEADERS` const add:

```js
/**
 * Base delay (ms) for exponential backoff between fetch retries.
 * @type {number}
 */
const BASE_DELAY_MS = 1000;

/**
 * Error for a non-2xx HTTP response, tagging the status code and whether the
 * failure is transient (network/5xx/429) and therefore worth retrying.
 */
class HttpResponseError extends Error {
  /**
   * @param {number} status - HTTP status code of the failed response.
   */
  constructor(status) {
    super(`Fetch failed with status: ${status}`);
    this.name = 'HttpResponseError';
    /** @type {number} */
    this.status = status;
    /** @type {boolean} */
    this.retryable = status >= 500 || status === 429;
  }
}
```

Replace the body of `fetchWithRetry` (the `try/catch` inside the loop) with:

```js
      try {
        const response = await fetch(url, {
          ...options,
          headers: { ...DEFAULT_HEADERS, ...options.headers },
          dispatcher: this.agent,
        });
        if (!response.ok) throw new HttpResponseError(response.status);
        return response;
      } catch (error) {
        const isRetryable =
          !(error instanceof HttpResponseError) || error.retryable;
        if (isRetryable && attempt < retries) {
          this.logger.warn(`Fetch attempt ${attempt} failed. Retrying...`);
          await new Promise((res) =>
            setTimeout(res, 2 ** (attempt - 1) * BASE_DELAY_MS),
          );
        } else {
          this.logger.error(
            `Fetch failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${getErrorMessage(error)}`,
          );
          throw error;
        }
      }
```

Add `HttpResponseError` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns=apiClient`
Expected: PASS (all existing + 2 new). Existing "exponential backoff" test still passes (1000/2000 identical for first two retries).

- [ ] **Step 5: Commit**

```bash
git add js/apiClient.cjs tests/unit/apiClient.test.js
git commit -m "fix(apiClient): fast-fail permanent 4xx and use true exponential backoff (#125)"
```

---

### Task 2: rangedDownloadVCF — argv array, no shell (#124)

**Files:**
- Modify: `js/rangedUtils.cjs:140-146`
- Test: `tests/unit/rangedUtils.test.js:284-290, 390-394`

**Interfaces:**
- Produces: no signature change. `spawn('tabix', ['-h', url, range], { cwd: indexDir })`.

- [ ] **Step 1: Update the failing tests first** — in `tests/unit/rangedUtils.test.js`, replace both `spawn('sh', ['-c', ...])` assertions.

At ~line 284:

```js
      expect(spawn).toHaveBeenCalledWith('tabix', ['-h', url, range], {
        cwd: expect.any(String),
      });
      expect(spawn).toHaveBeenCalledWith('bgzip', ['-c']);
```

At ~line 390:

```js
      // Verify tabix runs directly (no shell) with -h flag and argv array
      expect(spawn).toHaveBeenCalledWith(
        'tabix',
        ['-h', 'https://example.com/test.vcf.gz', 'chr1:1000-2000'],
        { cwd: '/path/to' },
      );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPatterns=rangedUtils`
Expected: FAIL — production still spawns `sh`.

- [ ] **Step 3: Implement** — in `js/rangedUtils.cjs`, replace lines 140–146:

```js
    // Command 1: tabix to extract the region with header.
    // Spawn tabix directly with an argv array (no shell) so URL/range are inert
    // to shell metacharacters — matching the safe BAM path.
    logger.info(`Executing in ${indexDir}: tabix -h ${url} ${range}`);
    const tabixProcess = spawn('tabix', ['-h', url, range], {
      cwd: indexDir, // Execute in the directory where the index file is located
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns=rangedUtils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/rangedUtils.cjs tests/unit/rangedUtils.test.js
git commit -m "fix(rangedUtils): run tabix via argv array instead of sh -c for ranged VCF (#124)"
```

---

### Task 3: downloadFile — honor writable backpressure (#123)

**Files:**
- Modify: `js/fileUtils.cjs` (add `node:events` require; loop at ~lines 84–89)
- Test: `tests/unit/fileUtils.test.js`

**Interfaces:**
- Produces: no signature change.

- [ ] **Step 1: Write the failing test** — in `tests/unit/fileUtils.test.js`, add `const { Writable } = require('node:stream');` near the top requires, then add inside `describe('downloadFile', ...`:

```js
test('awaits drain when the writable applies backpressure', async () => {
  const dir = await testDir.create(`download-backpressure-${Date.now()}`);
  const outputPath = path.join(dir, 'file.bin');

  const order = [];
  // hwm=1 forces write() to return false so the fix must await 'drain'.
  const slowWriter = new Writable({
    highWaterMark: 1,
    write(chunk, _enc, cb) {
      order.push(`write:${chunk.toString()}`);
      setImmediate(cb);
    },
  });
  jest.spyOn(fs, 'createWriteStream').mockReturnValue(slowWriter);

  const chunks = ['a', 'b', 'c'];
  const mockBody = {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        order.push(`pull:${c}`);
        yield Buffer.from(c);
      }
    },
  };
  fetchWithRetry.mockResolvedValue({
    body: mockBody,
    headers: { get: () => '3' },
  });

  await downloadFile(
    'https://example.com/file.bin',
    outputPath,
    true,
    mockAgent,
    mockRl,
    mockLogger,
    mockMetrics,
  );

  // Backpressure honored => pulls and writes strictly interleave 1:1.
  expect(order).toEqual([
    'pull:a',
    'write:a',
    'pull:b',
    'write:b',
    'pull:c',
    'write:c',
  ]);
  expect(mockMetrics.totalBytesDownloaded).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=fileUtils`
Expected: FAIL — without the fix, order is `pull:a, pull:b, pull:c, write:a, ...` (all pulls before writes).

- [ ] **Step 3: Implement** — in `js/fileUtils.cjs`, add near the top requires:

```js
const { once } = require('node:events');
```

Replace the streaming loop (lines ~84–88):

```js
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      // Honor writable backpressure: when the internal buffer is full,
      // write() returns false — wait for 'drain' before pulling more so
      // memory stays bounded on large downloads with a slow sink.
      if (!writer.write(chunk)) {
        await once(writer, 'drain');
      }
      progressBar.tick(chunk.length);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns=fileUtils`
Expected: PASS (new backpressure test + all existing — small-buffer tests never hit the drain path).

- [ ] **Step 5: Commit**

```bash
git add js/fileUtils.cjs tests/unit/fileUtils.test.js
git commit -m "fix(fileUtils): honor writable backpressure in downloadFile (#123)"
```

---

### Task 4: createHttpAgent — base64 proxy auth via undici token (#122)

**Files:**
- Modify: `js/net/httpAgent.cjs:25-29`
- Test: `tests/unit/net/httpAgent.enhanced.test.js:39-43`

**Interfaces:**
- Produces: no signature change. Sets `agentOptions.token = 'Basic <base64(user:pass)>'`.

- [ ] **Step 1: Update the failing test** — in `tests/unit/net/httpAgent.enhanced.test.js`, replace the both-credentials assertion (~lines 39–42):

```js
    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: 'http://example.test:8080',
      token: 'Basic dXNlcjpwYXNz', // base64('user:pass')
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=httpAgent`
Expected: FAIL — production still sets `auth: 'user:pass'`.

- [ ] **Step 3: Implement** — in `js/net/httpAgent.cjs`, replace the credential block:

```js
  /** @type {import('undici').ProxyAgent.Options} */
  const agentOptions = { uri: proxy };
  if (proxyUsername && proxyPassword) {
    // undici sets Proxy-Authorization to opts.token verbatim, so it must be a
    // complete, base64-encoded Basic credential. (opts.auth is deprecated and
    // must not be combined with token.)
    const encoded = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString(
      'base64',
    );
    agentOptions.token = `Basic ${encoded}`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns=httpAgent`
Expected: PASS (both `httpAgent.test.js` and `httpAgent.enhanced.test.js`).

- [ ] **Step 5: Commit**

```bash
git add js/net/httpAgent.cjs tests/unit/net/httpAgent.enhanced.test.js
git commit -m "fix(httpAgent): base64-encode proxy credentials via undici token (#122)"
```

---

### Task 5: parseRegions unique temp BED + consumer-owned cleanup (#121)

**Files:**
- Modify: `js/io/regionParsing.cjs` (add `node:crypto`; `makeTempBedPath()`; both branches)
- Modify: `js/commands/download.cjs` (add `node:fs` + `getErrorMessage`; wrap body in `try/finally`)
- Modify: `varvis-download.cjs:210-214` (delete inline unlink block)
- Test: `tests/unit/io/regionParsing.test.js`, `tests/unit/commands/download.enhanced.test.js`

**Interfaces:**
- Consumes: `runDownloadCommand({ finalConfig, regions, tempBedPath }, deps)` already receives `tempBedPath`.
- Produces: `parseRegions` returns a unique `tempBedPath` per call; `runDownloadCommand` unlinks it in `finally`.

- [ ] **Step 1: Write the failing tests.**

In `tests/unit/io/regionParsing.test.js`, replace the fixed-name `afterEach` (lines 19–21) with per-path cleanup, and add a uniqueness test:

```js
  const created = [];
  const track = (result) => {
    if (result.tempBedPath) created.push(result.tempBedPath);
    return result;
  };

  afterEach(() => {
    for (const p of created.splice(0)) {
      fs.rmSync(p, { force: true });
    }
  });
```

(Update the existing tests to wrap their `parseRegions(...)` calls with `track(...)`, e.g. `const { regions, tempBedPath } = track(parseRegions({ range: 'chr1:100-200', bed: null }, mockLogger));`.) Then add:

```js
  test('mints a unique temp BED path per call (not a fixed name)', () => {
    const a = track(parseRegions({ range: 'chr1:1-10', bed: null }, mockLogger));
    const b = track(parseRegions({ range: 'chr1:1-10', bed: null }, mockLogger));

    const fixed = path.join(os.tmpdir(), 'regions.bed');
    expect(a.tempBedPath).not.toBe(fixed);
    expect(b.tempBedPath).not.toBe(fixed);
    expect(a.tempBedPath).not.toBe(b.tempBedPath);
  });
```

In `tests/unit/commands/download.enhanced.test.js`, add a test asserting temp-BED cleanup on throw. (Check the file's existing mock setup for `getDownloadLinks`/`fetchAnalysisIds`; adapt the mock used to force a throw.) Skeleton:

```js
const fs = require('node:fs');
// ...
test('removes the temp BED file even when the download throws', async () => {
  const tempBedPath = '/tmp/varvis-regions-test.bed';
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
  // Force the flow to throw after parseRegions (e.g. analysis fetch rejects):
  fetchAnalysisIds.mockRejectedValueOnce(new Error('boom'));

  await expect(
    runDownloadCommand(
      { finalConfig: { ...baseConfig, analysisIds: [] }, regions: ['chr1:1-2'], tempBedPath },
      deps,
    ),
  ).rejects.toThrow('boom');

  expect(unlink).toHaveBeenCalledWith(tempBedPath);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPatterns="regionParsing|download.enhanced"`
Expected: FAIL — parseRegions returns fixed name; runDownloadCommand doesn't unlink on throw.

- [ ] **Step 3: Implement.**

In `js/io/regionParsing.cjs`, add `const crypto = require('node:crypto');` to the requires, add the helper after the requires:

```js
/**
 * Builds a collision-free temporary BED path in the OS temp dir. The pid keeps
 * concurrent invocations from overwriting each other; the random suffix guards
 * against same-process/same-clock collisions.
 *
 * @returns {string} - Unique temporary BED path for this invocation.
 */
function makeTempBedPath() {
  return path.join(
    os.tmpdir(),
    `varvis-regions-${process.pid}-${crypto.randomBytes(6).toString('hex')}.bed`,
  );
}
```

Replace both `const tempBedPath = path.join(os.tmpdir(), 'regions.bed');` (lines 50 and 70) with `const tempBedPath = makeTempBedPath();`.

In `js/commands/download.cjs`, add to requires:

```js
const fs = require('node:fs');
const { getErrorMessage } = require('../errorUtils.cjs');
```

Wrap the entire existing body of `runDownloadCommand` (everything after the destructure of `finalConfig`) in `try { ... } finally { ... }`:

```js
  try {
    // ... existing body unchanged (tool checks through generateReport) ...
  } finally {
    if (tempBedPath && fs.existsSync(tempBedPath)) {
      try {
        fs.unlinkSync(tempBedPath);
        logger.info(`Deleted temporary BED file: ${tempBedPath}`);
      } catch (error) {
        logger.debug(
          `Could not remove temp BED ${tempBedPath}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
```

In `varvis-download.cjs`, delete the inline cleanup (lines 211–214):

```js
      if (tempBedPath) {
        fs.unlinkSync(tempBedPath);
        activeLogger.info(`Deleted temporary BED file: ${tempBedPath}`);
      }
```

(Leave `const { regions, tempBedPath } = parseRegions(...)` and the `runDownloadCommand({ finalConfig, regions, tempBedPath }, deps)` call intact — the command now owns cleanup.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns="regionParsing|download"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/io/regionParsing.cjs js/commands/download.cjs varvis-download.cjs tests/unit/io/regionParsing.test.js tests/unit/commands/download.enhanced.test.js
git commit -m "fix(regions): unique temp BED path + consumer-owned finally cleanup (#121)"
```

---

### Task 6: Full gate + finalize

- [ ] **Step 1: Run the full local gate**

Run: `npm run check`
Expected: PASS — `lint && prettier --check && type-check && test && architecture:check`.

- [ ] **Step 2: Fix any lint/format/type findings**

If prettier flags formatting: `npm run format`. If eslint flags: address per rule (never weaken jsdoc/security/no-secrets rules). If tsc flags: narrow types (do not `any`-cast). Re-run `npm run check`.

- [ ] **Step 3: Commit any gate fixups (if needed)**

```bash
git add -A
git commit -m "chore: satisfy lint/format/type gate for #121-#125 batch"
```

## Self-Review

- **Spec coverage:** D1→Task1, D2→Task2, D3→Task3, D4→Task4, D5→Task5, verification→Task6. All five defects + the D5 cleanup-on-throw test (Codex Medium) covered.
- **Placeholders:** Task 5's `download.enhanced.test.js` skeleton depends on that file's existing mock wiring — the implementer must read the file's top mocks (`fetchAnalysisIds`, `getDownloadLinks`, `deps`, `baseConfig`) and adapt names. This is the one place exact code can't be pinned without re-reading the file at execution time; everything else is literal.
- **Type consistency:** `HttpResponseError.status/retryable`, `makeTempBedPath()`, `runDownloadCommand({ finalConfig, regions, tempBedPath }, deps)` used consistently across tasks.
