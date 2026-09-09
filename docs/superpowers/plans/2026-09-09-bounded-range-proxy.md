# Bounded-Range Reverse Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully self-contained in-process bounded-range HTTP reverse proxy in `varvis-download` to protect against excessive AWS S3 egress during samtools/tabix ranged downloads, with CLI option flags and automatic tool version guard.

**Architecture:** An ephemeral Node.js HTTP server (`js/net/boundedRangeProxy.cjs`) binds to `127.0.0.1:0`, rewriting open-ended HTTP `Range: bytes=N-` requests from samtools/tabix into bounded 2 MiB chunks against the remote pre-signed S3 URL, cutting upstream connections immediately via `AbortController` when the downstream client closes the socket. Ranged download callers in `js/rangedUtils.cjs` pass the proxy URL to child processes and cleanly tear down the server upon exit.

**Tech Stack:** Node.js >= 22.22.2 (CommonJS `.cjs`), native `fetch` / `node:http`, yargs 18, winston, Jest 30.

**Spec:** `docs/superpowers/specs/2026-09-09-bounded-range-proxy-design.md`

## Global Constraints

- Must be completely self-contained in `varvis-download`: no external proxy binaries or dependencies.
- Retain 100% binary compatibility and result parity for samtools/tabix output files.
- Option `--bounded-range-proxy` must default to `true` and support `--no-bounded-range-proxy` to disable.
- CommonJS `.cjs` codebase; adhere to ESLint, Prettier, and JSDoc typing for `tsc --noEmit`.

---

### Task 1: Bounded-Range Reverse Proxy Core Module (`js/net/boundedRangeProxy.cjs`)

**Files:**
- Create: `js/net/boundedRangeProxy.cjs`
- Test: `tests/unit/net/boundedRangeProxy.test.js`

**Interfaces:**
- Produces: `createBoundedRangeProxy(targetUrl, options)` returning `Promise<{ proxyUrl: string, close: () => Promise<void>, getMetrics: () => object }>`

- [ ] **Step 1: Write unit tests for `boundedRangeProxy.cjs`**
  - Test HEAD request proxying (status, content-length, accept-ranges).
  - Test unbounded GET Range request rewriting (`bytes=0-` -> bounded `bytes=0-2097151`).
  - Test already-bounded GET Range request pass-through (`bytes=10-100`).
  - Test token authorization (valid token vs invalid token 403).
  - Test early socket disconnect and AbortController invocation.
  - Test `.close()` teardown.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx jest tests/unit/net/boundedRangeProxy.test.js --testPathIgnorePatterns="tests/integration/e2e/"`
  Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `js/net/boundedRangeProxy.cjs`**
  - Native `node:http` createServer.
  - Ephemeral port 0 listening on 127.0.0.1.
  - Crypto random UUID token route `/stream/:token`.
  - Range parsing, clamping, upstream streaming, AbortController on socket close.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx jest tests/unit/net/boundedRangeProxy.test.js --testPathIgnorePatterns="tests/integration/e2e/"`
  Expected: PASS

- [ ] **Step 5: Commit Task 1**
  ```bash
  git add js/net/boundedRangeProxy.cjs tests/unit/net/boundedRangeProxy.test.js
  git commit -m "feat(net): add self-contained bounded-range reverse proxy module"
  ```

---

### Task 2: Tool Version Detection & Bug Guard (`js/toolChecks.cjs`)

**Files:**
- Modify: `js/toolChecks.cjs`
- Test: `tests/unit/toolChecks.test.js`

**Interfaces:**
- Produces: `isToolAffectedByUnboundedRangeBug(toolName, versionString)` returning `boolean`

- [ ] **Step 1: Write unit test for `isToolAffectedByUnboundedRangeBug`**
  - Test samtools 1.15 through 1.24 returns `true`.
  - Test tabix 1.15 through 1.24 returns `true`.
  - Test hypothetical future samtools 1.25.0 returns `false`.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with "isToolAffectedByUnboundedRangeBug is not a function"

- [ ] **Step 3: Implement `isToolAffectedByUnboundedRangeBug` in `js/toolChecks.cjs`**
  - Compare version against `1.25.0`.
  - Re-export for callers.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS

- [ ] **Step 5: Commit Task 2**
  ```bash
  git add js/toolChecks.cjs tests/unit/toolChecks.test.js
  git commit -m "feat(tools): add version guard check for HTSlib unbounded range bug"
  ```

---

### Task 3: CLI Option Registration & Config Merging

**Files:**
- Modify: `js/cli/args.cjs`
- Modify: `js/cli/configMerge.cjs`
- Test: `tests/unit/cli/args.test.js`
- Test: `tests/unit/cli/configMerge.test.js`

**Interfaces:**
- Consumes: yargs parser, config loader
- Produces: `finalConfig.boundedRangeProxy` (boolean, default true) and `finalConfig.boundedRangeChunkSize` (number, default 2097152)

- [ ] **Step 1: Write tests for `--bounded-range-proxy` and `--no-bounded-range-proxy`**
  - Verify default is `true`.
  - Verify `--no-bounded-range-proxy` sets it to `false`.
  - Verify `--bounded-range-chunk-size` parses number.
  - Verify config file values are merged correctly.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Update `js/cli/args.cjs` and `js/cli/configMerge.cjs`**
  - Register `.option('bounded-range-proxy', { default: true, type: 'boolean', ... })`.
  - Register `.option('bounded-range-chunk-size', { default: 2097152, type: 'number', ... })`.
  - Add to `configMerge.cjs` normalization and explicitness check.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit Task 3**
  ```bash
  git add js/cli/args.cjs js/cli/configMerge.cjs tests/unit/cli/
  git commit -m "feat(cli): add --bounded-range-proxy and --bounded-range-chunk-size options"
  ```

---

### Task 4: Integration with Ranged Download Execution (`js/rangedUtils.cjs` & handlers)

**Files:**
- Modify: `js/rangedUtils.cjs`
- Modify: `js/download/bamHandler.cjs`
- Modify: `js/download/vcfHandler.cjs`
- Test: `tests/unit/rangedUtils.proxy.test.js`

**Interfaces:**
- Consumes: `createBoundedRangeProxy`, `isToolAffectedByUnboundedRangeBug`
- Wraps: `rangedDownloadBAM`, `unmappedDownloadBAM`, `rangedDownloadVCF`

- [ ] **Step 1: Write integration tests for proxy wrapping in `rangedUtils`**
  - Verify that when proxy is enabled, `samtools view` is spawned with proxy URL (`http://127.0.0.1:...`) instead of raw URL.
  - Verify that proxy server is closed upon success.
  - Verify that proxy server is closed upon child process error.
  - Verify that when proxy is disabled (`--no-bounded-range-proxy`), raw URL is passed directly.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement proxy wrapping in `rangedUtils.cjs`**
  - Accept proxy options in `rangedDownloadBAM`, `unmappedDownloadBAM`, `rangedDownloadVCF`.
  - Pass through from `bamHandler.cjs` and `vcfHandler.cjs`.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit Task 4**
  ```bash
  git add js/rangedUtils.cjs js/download/bamHandler.cjs js/download/vcfHandler.cjs tests/unit/
  git commit -m "feat(download): route ranged downloads through bounded-range reverse proxy"
  ```

---

### Task 5: End-to-End Real-Data Benchmark & Verification

**Files:**
- Create: `scripts/benchmark-bounded-proxy.mjs`
- Modify: `README.md` and docs

- [ ] **Step 1: Create real-data benchmark script**
  - Queries real S3 BAM / VCF.
  - Measures total bytes transferred before vs after.
  - Demonstrates >99% egress reduction.

- [ ] **Step 2: Run full test suite & linter**
  - `npm run lint`
  - `npm run type-check`
  - `npx jest --testPathIgnorePatterns="tests/integration/e2e/"`

- [ ] **Step 3: Document feature in README & docs**

- [ ] **Step 4: Commit Task 5**
  ```bash
  git add scripts/ README.md docs/
  git commit -m "docs(download): document bounded-range proxy feature and benchmark"
  ```\n