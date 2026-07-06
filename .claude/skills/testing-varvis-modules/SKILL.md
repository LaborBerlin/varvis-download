---
name: testing-varvis-modules
description: Use when writing or updating a Jest test in varvis-download, mocking HTTP/undici, winston loggers, the filesystem, child_process/spawn, timers or setTimeout backoff, readline prompts, or analysis objects, deciding where a new test file goes, or when a focused `--coverage` run fails the global coverage thresholds.
---

# Testing varvis-download modules

Jest 30. Tests are CommonJS (`.test.js`, `require()` not `import`, despite the
package being `"type": "module"`). Config: `jest.config.cjs`; global setup:
`tests/setup.js`.

## Where a test goes

Unit tests mirror the module path: `js/download/bamHandler.cjs` →
`tests/unit/download/bamHandler.test.js`. **Check whether a base test already
exists** — most modules have one at 100% coverage; never recreate it. Small
additions go in the base file; a larger batch or a distinct concern goes in a
supplementary dot-suffix file (`x.enhanced.test.js`, `x.new.test.js`,
`x.resumeRanged.test.js` are precedents). Filenames are `camelCase` (enforced);
keep every test file under 600 lines (see the `splitting-oversized-files`
skill).

## Mock-factory catalog (`tests/helpers/`)

Reuse these — don't hand-roll equivalents.

| Need              | Helper (from `tests/helpers/`)                                                    | Notes                                                                                |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| undici HTTP agent | `createMockAgent({ statusCode, body, headers, shouldFail })` (`mockFactories.js`) | Returns `{ request, close }` with jest.fn()s.                                        |
| Winston logger    | `createMockLogger()`                                                              | `{ info, error, warn, debug, level }`.                                               |
| Analysis object   | `MockAnalysisBuilder`                                                             | Chainable: `.withId().withSampleId().withFiles([...]).archived().build()`.           |
| Progress bar      | `createMockProgress()`                                                            | Constructor stub with `tick/update/terminate`.                                       |
| readline prompt   | `createMockReadline({ prompt: answer })`                                          | For password/confirm prompts.                                                        |
| Temp dir          | `TestDirectory` (`testUtils.js`)                                                  | `const dir = await new TestDirectory().create('name')`; `.cleanup()` in `afterEach`. |
| String → stream   | `createMockStream(content)` (`testUtils.js`)                                      | For download-stream tests.                                                           |
| Sample data       | `tests/helpers/fixtures.js`                                                       | Redacted analyses/files. Never use real API payloads.                                |

## Mocking the network — pick by test layer

- **Unit tests (dominant): `jest.mock` by path.** Mock the collaborator module
  and drive its return value:
  ```js
  jest.mock('../../js/apiClient.cjs');
  const { fetchWithRetry } = require('../../js/apiClient.cjs');
  fetchWithRetry.mockResolvedValue({ json: () => Promise.resolve({ response: { apiFileLinks: [...] } }) });
  ```
  Or pass a `createMockAgent(...)` in as the `agent` dependency.
- **Testing the HTTP boundary itself** (`js/apiClient.cjs`):
  `jest.mock('undici')` and drive `undici.fetch`. `createMockAgent` doesn't
  help there — the agent is passed through as the `dispatcher`, never called
  directly.
- **Integration tests only: `nock`** (real HTTP interception, e.g.
  `tests/integration/archive.test.js`). Never reach for `nock` in a unit test —
  mock the module boundary instead.

## Mocking external tools (samtools / tabix / bgzip)

Code that shells out (`js/rangedUtils.cjs`, `js/toolChecks.cjs`) uses `spawn`
from `node:child_process`. Mock the module and drive an EventEmitter-shaped
fake to fire `close`/`error`/`data` (pattern: `tests/unit/toolChecks.test.js`):

```js
jest.mock('node:child_process');
const { spawn } = require('node:child_process');
const proc = {
  stdout: { on: jest.fn() },
  stderr: { on: jest.fn() },
  on: jest.fn(),
};
spawn.mockReturnValue(proc);
proc.on.mockImplementation((event, cb) => {
  if (event === 'close') cb(0);
});
```

For code that calls the repo's own `spawnPromise` wrapper, mocking that wrapper
is often simpler than faking the whole child process.

## Controlling time

Fake timers when the code reads the wall clock (`new Date()` / `Date.now()`)
**or schedules with `setTimeout`** — e.g. the retry backoff in
`js/apiClient.cjs`; without fake timers a focused run sleeps through real
backoffs. Pure parse/format functions need no time control. (Some older tests
use real time with tolerance windows, e.g. `toBeGreaterThan(7190)` — don't
imitate.)

Use modern fake timers and **always restore them**:

```js
afterEach(() => jest.useRealTimers());
// ...
jest.useFakeTimers({ now: new Date('2026-07-06T11:00:00Z') });
jest.setSystemTime(new Date('2026-07-06T12:00:00Z'));
```

When async code awaits a faked `setTimeout`, advance with
`await jest.advanceTimersByTimeAsync(ms)` (pattern:
`tests/unit/apiClient.test.js`) — synchronous `advanceTimersByTime` followed by
`await promise` deadlocks.

`clearMocks`/`restoreMocks` are `true` globally but they do **not** reset fake
timers. A leaked fake clock breaks `tests/setup.js`'s `afterAll` hooks.

## Config facts that change how you write tests

- `clearMocks: true` + `restoreMocks: true` — mocks auto-reset between tests;
  manual `jest.clearAllMocks()` in `beforeEach` is redundant.
- `tests/setup.js` silences `console.*` (run with `DEBUG=true` to see logs),
  sets `NODE_ENV=test` and `LOG_LEVEL=silent`, and cleans the per-worker temp
  dir after the suite.
- Tests are exempt from JSDoc rules and get `jest` globals — no doc blocks
  needed.
- `npm test` skips `tests/integration/e2e/`; E2E runs via
  `npm run test:integration` (needs playground creds).

## Running tests and the coverage trap

```bash
npm test -- --testPathPatterns=urlUtils    # Jest 30: plural; --testPathPattern (singular) errors
npm test -- tests/unit/urlUtils.test.js    # or by path
```

**Coverage trap.** `--coverage` alone applies the global 60/50/60/60 thresholds
(`jest.config.cjs`) across all of `js/**` + `varvis-download.cjs`, so a
single-file run fails the thresholds even with every test passing — everything
else reports 0%. To check one module's coverage, scope collection:

```bash
npm test -- --testPathPatterns=urlUtils --coverage --collectCoverageFrom=js/urlUtils.cjs
```

`--collectCoverageFrom` replaces the config's list, so siblings the module
requires drop out of the report; the global thresholds still apply to the
scoped set, so a module under 60/50/60/60 fails even scoped. The real coverage
gate is the full suite: `npm test -- --coverage`.

## Verify before claiming done

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test -- --coverage && npm run architecture:check
```

Never delete or weaken a failing test to go green — fix the cause or report it.
