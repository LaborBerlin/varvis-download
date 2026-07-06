---
name: testing-varvis-modules
description: Use when adding or updating a Jest test in varvis-download, deciding how to mock HTTP/undici, loggers, the filesystem, time, or analysis objects, or running a focused test with coverage. Covers the shared helpers, the mock-factory catalog, fake-timer cleanup, and the single-file coverage-threshold trap.
---

# Testing varvis-download modules

Jest 30, CommonJS tests (`.test.js`, run as CJS even though the package is
`"type": "module"`). Config: `jest.config.cjs`. Global setup: `tests/setup.js`.

## Where a test goes

Unit tests **mirror the module path**: `js/fetchUtils.cjs` → `tests/unit/fetchUtils.test.js`;
`js/download/bamHandler.cjs` → `tests/unit/download/bamHandler.test.js`.

**Check first whether a base test already exists** — most `js/` modules already
have one at 100% coverage. If it does, add a **supplementary** file with a dot
suffix (`x.enhanced.test.js`, `x.new.test.js`, `x.resumeRanged.test.js` are the
established precedents) rather than recreating or bloating the base file. Filenames
are `camelCase` (enforced), and `testMatch: ['**/tests/**/*.test.js']` discovers
them. Keep every test file under 600 lines (see the `splitting-oversized-files` skill).

## Mock-factory catalog (`tests/helpers/`)

Reuse these — don't hand-roll equivalents.

| Need | Helper (from `tests/helpers/`) | Notes |
|------|-------------------------------|-------|
| undici HTTP agent | `createMockAgent({ statusCode, body, headers, shouldFail })` (`mockFactories.js`) | Returns `{ request, close }` with jest.fn()s. |
| Winston logger | `createMockLogger()` | `{ info, error, warn, debug, level }`. |
| Analysis object | `MockAnalysisBuilder` | Chainable: `.withId().withSampleId().withFiles([...]).archived().build()`. |
| Progress bar | `createMockProgress()` | Constructor stub with `tick/update/terminate`. |
| readline prompt | `createMockReadline({ prompt: answer })` | For password/confirm prompts. |
| Temp dir | `TestDirectory` (`testUtils.js`) | `const dir = await new TestDirectory().create('name')`; `.cleanup()` in `afterEach`. |
| String → stream | `createMockStream(content)` (`testUtils.js`) | For download-stream tests. |
| Sample data | `tests/helpers/fixtures.js` | Redacted analyses/files. Never use real API payloads. |

## Two ways to mock the network — pick by test layer

- **Unit tests (dominant): `jest.mock` by path.** Mock the collaborator module and
  drive its return value:
  ```js
  jest.mock('../../js/apiClient.cjs');
  const { fetchWithRetry } = require('../../js/apiClient.cjs');
  fetchWithRetry.mockResolvedValue({ json: () => Promise.resolve({ response: { apiFileLinks: [...] } }) });
  ```
  Or pass a `createMockAgent(...)` in as the `agent` dependency.
- **Integration tests only: `nock`.** Real HTTP interception lives in
  `tests/integration/` (e.g. `archive.test.js`). Do **not** reach for `nock` in a
  unit test — mock the module boundary instead.

## Mocking external tools (samtools / tabix / bgzip)

Code that shells out (`js/rangedUtils.cjs`, `js/toolChecks.cjs`) uses
`spawn` from `node:child_process`. Mock the module and return an
EventEmitter-shaped fake whose `.on`/`.stdout.on`/`.stderr.on` you drive to fire
`close`/`error`/`data` (pattern lives in `tests/unit/toolChecks.test.js`):

```js
jest.mock('node:child_process');
const { spawn } = require('node:child_process');
const proc = { stdout: { on: jest.fn() }, stderr: { on: jest.fn() }, on: jest.fn() };
spawn.mockReturnValue(proc);
proc.on.mockImplementation((event, cb) => { if (event === 'close') cb(0); });
```
For code that calls the repo's own `spawnPromise` wrapper, mocking that wrapper
is often simpler than faking the whole child process.

## Controlling time

Pure parse/format functions need **no** time control. Only mock time when a
function reads the wall clock (`new Date()` / `Date.now()`) and you want an exact
assertion. (Some older tests instead use real time with tolerance windows, e.g.
`> 7190 && <= 7200` — fake timers are the cleaner default for new tests.)

Use modern fake timers and **always restore them**:
```js
afterEach(() => jest.useRealTimers());
// ...
jest.useFakeTimers({ now: new Date('2026-07-06T11:00:00Z') });
jest.setSystemTime(new Date('2026-07-06T12:00:00Z'));
```
`clearMocks`/`restoreMocks` are `true` globally but they do **not** reset fake
timers. Leaking a fake clock breaks `tests/setup.js`'s `afterAll` hooks.

## Config facts that change how you write tests

- `clearMocks: true` + `restoreMocks: true` — mocks auto-reset between tests; manual
  `jest.clearAllMocks()` in `beforeEach` is redundant (harmless, some files have it).
- `tests/setup.js` silences `console.*`. To see logs while debugging: run with
  `DEBUG=true`. It also sets `NODE_ENV=test`, `LOG_LEVEL=silent`, and cleans the
  per-worker temp dir.
- Tests are exempt from JSDoc rules and get `jest` globals (eslint override) — no
  doc blocks needed on test functions.
- `testPathIgnorePatterns` excludes `tests/integration/e2e/` from `npm test`; E2E
  runs via `npm run test:integration` (needs playground creds).

## Running tests

```bash
npm test -- --testPathPatterns=urlUtils        # Jest 30 renamed --testPathPattern (singular) → plural
npm test -- tests/unit/urlUtils.test.js         # or by path
```

**Coverage trap.** `--coverage` alone applies the **global** 60/50/60/60 thresholds
(`jest.config.cjs`) across all of `js/**` + `varvis-download.cjs`. Running one test
file with `--coverage` therefore *fails* the thresholds because everything else
reports 0%. To check one module's coverage, scope collection:
```bash
npm test -- --testPathPatterns=urlUtils --coverage --collectCoverageFrom=js/urlUtils.cjs
```
For the real coverage gate, run the whole suite: `npm test -- --coverage`.
(`--collectCoverageFrom` *replaces* the config's list, so scoping to one module
excludes any siblings it requires from the report. The `coverage/` output dir is
gitignored — no cleanup needed.)

## Verify before claiming done

Add/adjust the focused test, then run the full gate (CI order):
```bash
npm run lint && npx prettier --check . && npm run type-check && npm test -- --coverage && npm run architecture:check
```
Never delete or weaken a failing test to go green — fix the cause or report it.
