# Design: scanning-for-bugs batch fixes (#121–#125)

- **Date:** 2026-07-07
- **Status:** Draft (pending Codex xhigh review)
- **Scope:** Five independent, already-verified defects surfaced by the repo
  `scanning-for-bugs` skill. Each is small, module-local, and testable in
  isolation. This batch is **out of scope** of the earlier CLI-config/lifecycle
  spec (`2026-07-06-cli-config-and-lifecycle-fixes-design.md`, D1–D8).

## Goal

Fix all five defects end-to-end with focused unit tests, no behavior
regressions, and a green local gate (`npm run check`). Each fix changes exactly
one production module (plus the entry file for D5's cleanup move) and updates the
tests that currently pin the buggy behavior.

## Non-goals

- No refactor of the streaming/download architecture beyond the minimal
  backpressure fix.
- No new external tool dependencies, no new CLI flags, no config surface change.
- No change to the resume path's temp-BED handling. It is the **structural**
  reference for D5 (unique-per-item name + `try/finally` cleanup owned by the
  consumer). Resume's uniqueness comes from `analysisId`+`fileName`
  (`resume.cjs:184`), which is already collision-free per entry, so it is
  deliberately *not* randomized — only the primary `parseRegions` path (which
  has no such discriminator) gets the pid+random name.

---

## D1 — apiClient.fetchWithRetry: fast-fail permanent 4xx + honest backoff (#125)

**File:** `js/apiClient.cjs` (`ApiClient.fetchWithRetry`)

**Problem.** `if (!response.ok) throw` makes every non-2xx a retryable error, so
a permanent 4xx (400/401/403/404) is retried 3× with sleeps before the real
error surfaces. The delay `attempt * 1000` is linear (1s, 2s, 3s) but the inline
comment says "Exponential backoff".

**Root cause.** No status-class discrimination between terminal (4xx) and
transient (5xx / network / 429) failures; mislabeled comment.

**Fix.**

1. Define a **typed error class** carrying the status and a transient/retryable
   flag. A plain `Error` with ad-hoc `.status`/`.retryable` fields fails
   `tsc --noEmit` under this repo's strict `checkJs`; a class with JSDoc-typed
   fields (and `instanceof` narrowing in `catch`, where the binding is `unknown`)
   is type-safe:

   ```js
   /**
    * Error for a non-2xx HTTP response, tagging the status and whether the
    * failure is transient (worth retrying).
    */
   class HttpResponseError extends Error {
     /** @param {number} status - HTTP status code. */
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

   ```js
   if (!response.ok) throw new HttpResponseError(response.status);
   ```

2. In `catch`, retry only when the error is retryable **and** attempts remain.
   Network errors (thrown by `fetch` itself) are plain `Error` instances, not
   `HttpResponseError`, so they default to retryable via the narrowing:

   ```js
   const isRetryable = !(error instanceof HttpResponseError) || error.retryable;
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
   ```

   `BASE_DELAY_MS = 1000` module constant. This is **true exponential** backoff
   (1s, 2s, 4s, …); the comment is corrected to match. `HttpResponseError` is
   exported for tests/consumers.

**Contract.** Retry only transient failures (network errors, HTTP 5xx, HTTP
429). Fail fast on all other 4xx. Backoff grows exponentially from a 1s base.

**Considered risk.** A caller that relied on retrying a 4xx to eventually
succeed would change. There is none: every call here is idempotent GET/HEAD or a
POST-restore; a 4xx never becomes 2xx on identical retry. Expired-S3-URL 403s are
handled proactively upstream (`isUrlExpiringSoon` / `getValidDownloadUrl`), not
by 4xx retry, so fast-failing them is strictly better (less latency/noise).

**Error-message note.** The failure log reports the actual attempt count
(`attempt`), so a fast-failed 4xx reads "after 1 attempt". For the exhausted
network cases, `attempt === retries`, so `after ${attempt} attempts` yields
"after 3 attempts" / "after 5 attempts" — the existing assertions
(`apiClient.test.js:116,181`) stay green. The `attempt === 1 ? '' : 's'`
pluralization keeps grammar correct across both paths.

**Tests (`tests/unit/apiClient.test.js`).**
- Keep: "retry on non-ok response status" (uses 500 → still retryable).
- Keep: exponential-backoff test (advances 1000 then 2000ms; true-exponential
  yields identical 1000/2000 for the first two retries → stays green).
- Add: "fails fast on 404 without retrying" — `fetch` resolves `{ok:false,
  status:404}`; assert `fetch` called once, no `warn`, error thrown.
- Add: "retries on 429" — assert it is treated as transient.

---

## D2 — rangedDownloadVCF: argv array instead of `sh -c` (#124)

**File:** `js/rangedUtils.cjs` (`rangedDownloadVCF`, ~lines 140–146)

**Problem.** The tabix half of the pipeline is built as a shell string and run
via `spawn('sh', ['-c', `tabix -h "${url}" ${range}`], { cwd })`. `range` is
interpolated **unquoted**; the URL is only double-quoted (still interprets `$`,
backticks, `\`, `"`). Shell metacharacters in a region break the command or
execute unintended shell. The BAM path already uses safe argv arrays.

**Fix.** Match the BAM path — spawn `tabix` directly with an argument array, no
shell:

```js
logger.info(`Executing in ${indexDir}: tabix -h ${url} ${range}`);
const tabixProcess = spawn('tabix', ['-h', url, range], { cwd: indexDir });
```

`range` is always a **single** region string: `handleVcfFile` loops per region
(`vcfHandler.cjs:120-138`) and the resume path passes one region. So one argv
slot for `range` is correct; no splitting needed. The log line no longer prints
a shell-executable string (it is descriptive only).

**Contract.** The ranged VCF download runs `tabix` with the URL and region as
distinct argv entries in `indexDir`, piped to `bgzip -c` (unchanged), with no
shell interpretation of any input.

**Tests (`tests/unit/rangedUtils.test.js`).** Update the two assertions that pin
`spawn('sh', ['-c', ...])` (lines ~284 and ~390) to:

```js
expect(spawn).toHaveBeenCalledWith('tabix', ['-h', url, range], { cwd: '/path/to' });
```

No other test references the shell form. (`vcfHandler` and `resume` tests mock
`rangedDownloadVCF` wholesale and are unaffected.)

---

## D3 — downloadFile: honor writable backpressure (#123)

**File:** `js/fileUtils.cjs` (`downloadFile` streaming loop, ~lines 84–89)

**Problem.** `writer.write(chunk)` return value is ignored and `drain` is never
awaited, so a slow sink lets Node buffer unbounded data in the writable's queue
(multi-GB BAMs → RSS toward file size, possible OOM).

**Fix.** Await `drain` when `write()` signals a full buffer:

```js
const { once } = require('node:events');
...
for await (const chunk of response.body) {
  totalBytes += chunk.length;
  if (!writer.write(chunk)) {
    await once(writer, 'drain');
  }
  progressBar.tick(chunk.length);
}
```

`events.once(writer, 'drain')` resolves on `drain` and **auto-rejects on
`error`**, so a mid-download writer error still propagates into the existing
`catch` (which destroys the stream and unlinks the partial file). Progress
ticking and metrics are unchanged.

**Contract.** Memory stays bounded by the writable high-water mark regardless of
the network/disk speed ratio; behavior and outputs are otherwise identical.

**Tests (`tests/unit/fileUtils.test.js`).**
- Existing tests unaffected: they use a real `fs.createWriteStream` with tiny
  (<16 KB) buffers, so `write()` returns `true` and the drain path is never hit.
- Add a deterministic backpressure test: `jest.spyOn(fs, 'createWriteStream')`
  returns a real `stream.Writable` with `highWaterMark: 1` and an async
  `_write` (callback on `setImmediate`). The mock body yields several chunks and
  records the pull order; `_write` records the write order. With hwm=1 and the
  fix, pulls and writes interleave 1:1 (proving `drain` is awaited between
  chunks); without the fix all pulls precede all writes. Assert the interleaved
  order and correct `totalBytesDownloaded`.

---

## D4 — createHttpAgent: base64 proxy auth via `token` (#122)

**File:** `js/net/httpAgent.cjs` (`createHttpAgent`)

**Problem.** `agentOptions.auth = `${proxyUsername}:${proxyPassword}`` passes the
**raw** pair, but undici treats `opts.auth` as **already base64**, emitting
`Proxy-Authorization: Basic user:pass` (literal), which authenticating proxies
reject. Verified in `node_modules/undici/lib/dispatcher/proxy-agent.js`: `auth`
→ `Basic ${opts.auth}` (:138), `token` → set verbatim (:140), and `auth`+`token`
together throw (:134). `auth` is `@deprecated` in favor of `token`.

**Fix.** Use the non-deprecated `token` option with a correctly base64-encoded
credential (set only `token`, never both):

```js
if (proxyUsername && proxyPassword) {
  const encoded = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString('base64');
  agentOptions.token = `Basic ${encoded}`;
}
```

**Contract.** With a proxy and both credentials set, undici sends a valid
`Proxy-Authorization: Basic <base64(user:pass)>`. With only one credential half,
no auth is sent (unchanged). Non-proxy path unchanged.

**Tests (`tests/unit/net/httpAgent.enhanced.test.js`).** Update the both-set
assertion from `auth: 'user:pass'` to `token: 'Basic dXNlcjpwYXNz'`
(base64 of `user:pass`). The "omits auth when only one half present" test stays
valid (neither `auth` nor `token` set). `httpAgent.test.js` does not assert the
credential shape and is unaffected. Confirm `tsc --noEmit` accepts `token` on
`import('undici').ProxyAgent.Options`.

---

## D5 — parseRegions: unique temp BED name + cleanup in `finally` (#121)

**Files:** `js/io/regionParsing.cjs` (unique name), `js/commands/download.cjs`
(cleanup ownership), `varvis-download.cjs` (drop the leaky inline cleanup).

**Problem.**
1. Both `parseRegions` branches write a **constant** `os.tmpdir()/regions.bed`.
   Two concurrent invocations on one host overwrite each other's regions →
   run A's `samtools -L <tempBed>` reads run B's regions → **wrong-region
   output, silently** (TOCTOU on a shared temp file).
2. The primary-path cleanup (`varvis-download.cjs:211-214`,
   `if (tempBedPath) fs.unlinkSync(...)`) sits in the `try` body, not a
   `finally`; a throw from `runDownloadCommand` leaks the temp file.

**Fix.**
1. Mint a unique per-invocation path in both `parseRegions` branches via a small
   JSDoc'd helper (`js/**/*.cjs` requires JSDoc on function declarations):

   ```js
   const crypto = require('node:crypto');

   /**
    * Builds a collision-free temporary BED path in the OS temp dir.
    *
    * @returns {string} - Unique temp BED path for this invocation.
    */
   function makeTempBedPath() {
     return path.join(
       os.tmpdir(),
       `varvis-regions-${process.pid}-${crypto.randomBytes(6).toString('hex')}.bed`,
     );
   }
   ```

   `process.pid` distinguishes concurrent invocations (the stated bug); the
   random suffix is defense-in-depth against same-process/same-clock collisions.
   Single-file cleanup semantics are preserved (no temp dir), matching both call
   sites (primary and resume) which `fs.unlinkSync` the path.

2. Give the **consumer** (`runDownloadCommand`, which already receives
   `tempBedPath`) ownership of cleanup via `try/finally`, and remove the leaky
   inline unlink from the entry point. This both fixes the leak-on-throw and
   makes cleanup unit-testable (the entry `main()` has no harness; the download
   command does — `tests/unit/commands/download.enhanced.test.js`). This mirrors
   `resume.cjs:210-214`, where the handler call is wrapped in `try/finally` that
   unlinks the temp BED.

   In `js/commands/download.cjs` (add `const fs = require('node:fs')` and
   `getErrorMessage`), wrap the existing body:

   ```js
   async function runDownloadCommand({ finalConfig, regions, tempBedPath }, deps) {
     try {
       // ... existing body ...
     } finally {
       if (tempBedPath && fs.existsSync(tempBedPath)) {
         try {
           fs.unlinkSync(tempBedPath);
           logger.info(`Deleted temporary BED file: ${tempBedPath}`);
         } catch (error) {
           logger.debug(`Could not remove temp BED ${tempBedPath}: ${getErrorMessage(error)}`);
         }
       }
     }
   }
   ```

   In `varvis-download.cjs`, delete the `if (tempBedPath) { fs.unlinkSync(...) }`
   block (lines 211-214); `runDownloadCommand` now owns the lifecycle. Nothing
   throws between `parseRegions` and `runDownloadCommand`, so no leak window
   remains at the entry point.

**Contract.** Each invocation writes its regions to a path no other invocation
can collide with, and that path is removed on both success and error (including
when the download throws or the list-URLs early return fires).

**Tests.**
- `tests/unit/io/regionParsing.test.js`: replace the fixed-name `afterEach`
  cleanup (`rmSync(os.tmpdir()/regions.bed)`) with cleanup of the actual returned
  `tempBedPath`; keep content assertions (they read `tempBedPath`, path-agnostic).
  Add: two `parseRegions` calls return **different** `tempBedPath` values, and
  neither equals `os.tmpdir()/regions.bed`.
- `tests/unit/commands/download.enhanced.test.js`: add a test that
  `runDownloadCommand` unlinks `tempBedPath` when a downstream handler throws
  (spy `fs.unlinkSync`, force `handleBamFile`/`getDownloadLinks` to reject,
  assert unlink was called and the error still propagates).

---

## Cross-cutting

- **Independence.** The five fixes touch disjoint modules (apiClient, rangedUtils,
  fileUtils, httpAgent, regionParsing + entry). They can be implemented and
  verified in any order; each ships with its own passing tests.
- **Isolation & boundaries.** No public function signatures change. No new files
  needed (all target files are well under the 600-line budget; the largest,
  `rangedUtils.cjs` at 463 lines and `varvis-download.cjs` at 244, stay within
  budget). No new dependencies (`node:events`, `node:crypto` are built-ins).
- **JSDoc/types.** New tagged-error fields in D1 are internal to the catch; no
  exported type change. Verify `npm run type-check` stays green for D4's `token`.

## Verification

Per fix: `npm test -- --testPathPatterns=<module>`. Final gate: `npm run check`
(`lint && prettier --check && type-check && test && architecture:check`).

## Test plan summary

| Defect | Prod change | Tests updated | Tests added |
|--------|-------------|---------------|-------------|
| D1 #125 | `js/apiClient.cjs` | comment/message | 404 fast-fail; 429 retry |
| D2 #124 | `js/rangedUtils.cjs` | 2× `sh`→`tabix` argv | (covered by updated) |
| D3 #123 | `js/fileUtils.cjs` | none | deterministic backpressure |
| D4 #122 | `js/net/httpAgent.cjs` | 1× `auth`→`token` | (covered by updated) |
| D5 #121 | `js/io/regionParsing.cjs`, `varvis-download.cjs` | fixed-name cleanup | uniqueness |
