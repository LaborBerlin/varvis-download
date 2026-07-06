# CLI Config Precedence, Password Input & Download-Path Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the standards-grounded fixes from `docs/superpowers/specs/2026-07-06-cli-config-and-lifecycle-fixes-design.md` (rev 3): canonical config precedence with robust explicit-flag detection, a `--password-stdin` channel, honored-config docs/guards, `--destination .` fix, parallel tool probes, and resume.cjs consolidation onto the shared handlers.

**Architecture:** Replace the hand-rolled explicit-flag token scanner in `js/cli/args.cjs` with yargs' native `.parsed.defaulted` + `.parsed.aliases` metadata (foundational — Task 1), then build the config/password/lifecycle fixes on top, and finish with the higher-risk resume consolidation that delegates per-file download mechanics to `handleBamFile`/`handleVcfFile` while keeping resume's retry-requeue policy.

**Tech Stack:** Node.js ≥ 22.22.2 (CommonJS `.cjs`), yargs 18 / yargs-parser, undici, winston, Jest 30, ESLint 10, `tsc --noEmit` strict checkJs.

**Rev 2 (2026-07-06):** revised after a Codex high-reasoning plan review (all points verified against the repo). Fixed the `computeExplicitOptions` alias-default bug, the `defaulted` type gap, the removed-middleware test breakage, false-green tests (Task 4 destination, Task 5 flag, Task 6 concurrency), snapshot/fixture updates for the new `overwriteFromConfig`/`passwordStdin` fields, an injectable `resolvePassword`, the `CommandDeps`/`DownloadDeps` nullable-`rl`/optional-`login` widening, and the resume success-log fall-through.

## Global Constraints

- Runtime code is CommonJS `.cjs` — `require()` / `module.exports`, never ESM `import`/`export`.
- Built-in imports use the `node:` protocol (`require('node:fs')`). Enforced by `unicorn/prefer-node-protocol`.
- Every source/test file stays **under 600 lines** (warn at 500). `js/commands/resume.cjs` is ~450 lines today and must shrink, not grow past 600.
- JSDoc required on every exported function/class/method in `js/**/*.cjs` and root `*.cjs` (strict `tsc --noEmit` + eslint-plugin-jsdoc). Use `import('./types')` / `import('../types')` for shared types.
- Never commit secrets or real Varvis payloads; use redacted fixtures.
- Per-commit gate (run before every commit): `npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check`.
- Focused test run: `npm test -- --testPathPatterns=<name>` (Jest 30 renamed `--testPathPattern` → `--testPathPatterns`).
- Use repo skills where they fit: `testing-varvis-modules` (mock factories, fake timers), `writing-typed-jsdoc` (types/shims), `splitting-oversized-files` (600-line budget).
- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

---

### Task 1: yargs-native explicit-flag detection (foundational, spec D2)

Replaces the token-scanning `collectExplicitOptions` + `OPTION_ALIASES` table with yargs' own parse metadata, so bundled short flags (`-oL`), dashed/camelCase keys, and multi-char aliases (`--um`/`--rad`/`--pxu`) are all detected correctly. Also dissolves the `__varvisExplicitOptions` magic-string duplication by exporting the key from one module.

**Files:**
- Modify: `js/cli/args.cjs` (remove `OPTION_ALIASES` + `collectExplicitOptions`; add `parseArguments` + `computeExplicitOptions`; export `EXPLICIT_OPTIONS_KEY`)
- Modify: `js/cli/configMerge.cjs:37` (import `EXPLICIT_OPTIONS_KEY` from args instead of re-declaring)
- Modify: `varvis-download.cjs:60` (use `parseArguments(hideBin(process.argv))` instead of `buildParser(...).argv`)
- Test: `tests/unit/cli/args.test.js` (add detection + characterization tests)

**Interfaces:**
- Produces: `parseArguments(rawArgs: string[]) => argv` — parses and attaches a non-enumerable `EXPLICIT_OPTIONS_KEY` array of canonical option names the user supplied explicitly.
- Produces: `EXPLICIT_OPTIONS_KEY: string` (exported constant, shared with configMerge).
- Keeps: `buildParser(rawArgs) => yargs.Argv` (unchanged signature, used by tests).
- Consumes (in configMerge): `hasExplicitOption(argv, key)` reads `argv[EXPLICIT_OPTIONS_KEY]` (unchanged reader; plain-object test sources still fall back to `hasOwnProperty`).

- [ ] **Step 1: Write a characterization test proving yargs 18's `.parsed` metadata shape**

Add to `tests/unit/cli/args.test.js`:

```js
const { buildParser } = require('../../../js/cli/args.cjs');

describe('yargs parse metadata (characterization)', () => {
  function parsed(arguments_) {
    const parser = buildParser(arguments_).exitProcess(false);
    parser.parseSync();
    return parser.parsed;
  }

  test('bundled short flags -oL are both explicit (not defaulted)', () => {
    const { defaulted } = parsed(['-oL']);
    expect('overwrite' in defaulted).toBe(false);
    expect('list' in defaulted).toBe(false);
  });

  test('an untouched boolean stays in defaulted', () => {
    const { defaulted } = parsed([]);
    expect(defaulted.overwrite).toBe(true);
  });

  test('aliases expose the canonical camelCase group', () => {
    const { aliases } = parsed(['--list-urls']);
    expect(aliases.listUrls).toEqual(expect.arrayContaining(['list-urls', 'U']));
  });

  test('multi-char alias --um marks unmapped explicit', () => {
    const { defaulted } = parsed(['--um']);
    expect('unmapped' in defaulted).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm the metadata shape**

Run: `npm test -- --testPathPatterns=cli/args`
Expected: PASS (these characterize real yargs behavior verified during design; if any FAIL, adjust `computeExplicitOptions` in Step 4 to the observed shape before proceeding).

- [ ] **Step 3: Write the failing detection test**

Add to `tests/unit/cli/args.test.js`:

```js
const { parseArguments, EXPLICIT_OPTIONS_KEY } = require('../../../js/cli/args.cjs');

describe('parseArguments explicit-option detection', () => {
  function explicit(arguments_) {
    return parseArguments(arguments_)[EXPLICIT_OPTIONS_KEY];
  }

  test('bundled short flags -oL are detected as explicit', () => {
    const set = explicit(['-oL']);
    expect(set).toEqual(expect.arrayContaining(['overwrite', 'list']));
  });

  test('unset options are not explicit', () => {
    expect(explicit([])).not.toContain('overwrite');
    expect(explicit([])).not.toContain('unmapped');
  });

  test('multi-char alias --um marks unmapped explicit', () => {
    expect(explicit(['--um'])).toContain('unmapped');
  });

  test('dashed --list-urls maps to canonical listUrls', () => {
    expect(explicit(['--list-urls'])).toContain('listUrls');
  });

  test('--no-overwrite is explicit (negation counts as user-supplied)', () => {
    expect(explicit(['--no-overwrite'])).toContain('overwrite');
  });

  test('defaulted options (incl. their aliases) are NOT explicit', () => {
    const set = explicit([]);
    for (const name of [
      'config',
      'destination',
      'filetypes',
      'overwrite',
      'listUrls',
      'restoreArchived',
      'unmapped',
      'latest',
    ]) {
      expect(set).not.toContain(name);
    }
    // alias keys of defaulted options must not leak in either
    for (const alias of ['o', 'd', 'c', 'f', 'U', 'ra', 'um']) {
      expect(set).not.toContain(alias);
    }
  });
});
```

This negative test is the guard against the alias-default bug (Codex-flagged): if `computeExplicitOptions` marked defaulted aliases like `o`/`d` as explicit, config precedence would silently break.

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- --testPathPatterns=cli/args`
Expected: FAIL — `parseArguments is not a function` / `EXPLICIT_OPTIONS_KEY` undefined.

- [ ] **Step 5: Implement `parseArguments` + `computeExplicitOptions`; remove the token scanner**

In `js/cli/args.cjs`, delete the `OPTION_ALIASES` object (lines ~9-77) and the `collectExplicitOptions` function (lines ~79-104) and the `.middleware(...)` block inside `buildParser`. Keep `EXPLICIT_OPTIONS_KEY`. Add:

**Algorithm note (Codex-corrected — this is subtle).** yargs mirrors defaults onto alias keys too. With no args, `argv` contains alias keys like `o`, `d`, `c` (aliases of `overwrite`/`destination`/`config`), but `parsed.defaulted` marks only the **canonical** keys (`overwrite`, `destination`, `config`). So decide explicitness **per alias group**, not per raw argv key: a group is explicit only when some member is present in argv **and no** member is in `defaulted`; when explicit, add **every** group member (so a later `hasExplicitOption(argv, 'listUrls')` matches whether the key is camelCase or dashed). `@types/yargs-parser`'s `DetailedArguments` does not declare `defaulted`, so define a local typedef intersection for strict `tsc`.

```js
/**
 * @typedef {import('yargs-parser').DetailedArguments & {
 *   defaulted?: Record<string, boolean>,
 *   aliases?: Record<string, string[]>,
 * }} ParsedArgsMeta
 */

/**
 * Derives the names (canonical + aliases) of options supplied explicitly.
 * Decides per alias group: explicit iff some member is present in argv and no
 * member was populated from a parser default.
 * @param   {Record<string, unknown>} argv   - Parsed argv.
 * @param   {ParsedArgsMeta}          parsed - yargs parse metadata.
 * @returns {string[]}                       - Explicit option names (all group members).
 */
function computeExplicitOptions(argv, parsed) {
  const defaulted = parsed.defaulted || {};
  const aliases = parsed.aliases || {};
  const explicit = new Set();
  const grouped = new Set();
  const hasKey = (key) => Object.prototype.hasOwnProperty.call(argv, key);

  for (const [canonical, group] of Object.entries(aliases)) {
    const members = [canonical, ...group];
    members.forEach((member) => grouped.add(member));
    const present = members.some(hasKey);
    const anyDefaulted = members.some((member) => member in defaulted);
    if (present && !anyDefaulted) {
      members.forEach((member) => explicit.add(member));
    }
  }

  for (const key of Object.keys(argv)) {
    if (key === '_' || key === '$0' || grouped.has(key)) {
      continue;
    }
    if (!(key in defaulted)) {
      explicit.add(key);
    }
  }

  return [...explicit];
}

/**
 * Parses CLI arguments and tags the result with the explicit-option set.
 * @param   {string[]} rawArgs - Arguments without the node executable/script path.
 * @returns {Record<string, unknown>} - Parsed argv with a non-enumerable explicit-option list.
 */
function parseArguments(rawArgs) {
  const parser = buildParser(rawArgs);
  const argv = parser.parseSync();
  const parsed = /** @type {ParsedArgsMeta} */ (parser.parsed);
  Object.defineProperty(argv, EXPLICIT_OPTIONS_KEY, {
    enumerable: false,
    value: computeExplicitOptions(argv, parsed),
  });
  return argv;
}
```

Update the exports:

```js
module.exports = {
  EXPLICIT_OPTIONS_KEY,
  buildParser,
  parseArguments,
};
```

- [ ] **Step 6: Point configMerge at the shared key and main at `parseArguments`**

In `js/cli/configMerge.cjs`, replace the local `const EXPLICIT_OPTIONS_KEY = '__varvisExplicitOptions';` (line 37) with:

```js
const { EXPLICIT_OPTIONS_KEY } = require('./args.cjs');
```

In `varvis-download.cjs`, change the import to include `parseArguments`:

```js
const { parseArguments } = require('./js/cli/args.cjs');
```

and replace line ~60:

```js
const argv = parseArguments(hideBin(process.argv));
```

(Keep the existing `buildParser` import only if still referenced; remove it if now unused to satisfy `no-unused-vars`.)

No require cycle is introduced: `args.cjs` does not import `configMerge.cjs` (it only requires `yargs`), so `configMerge → args` is a one-way edge.

- [ ] **Step 6b: Migrate existing merge tests off the removed middleware (Codex blocker)**

Removing the `.middleware` means `buildParser(...).parseSync()` no longer attaches `EXPLICIT_OPTIONS_KEY`. Two existing tests build argv that way and rely on the metadata; without it, `hasExplicitOption` falls back to `hasOwnProperty` and treats yargs defaults as explicit, breaking config precedence. Switch both to `parseArguments`:

In `tests/unit/cli/configMerge-snapshot.test.js`, replace the import and the argv construction:

```js
const { parseArguments } = require('../../../js/cli/args.cjs');
// ...
    const argv = parseArguments(input.argv);
```

(Drop the `.scriptName(...).exitProcess(false).parseSync()` chain — `parseArguments` handles parsing. If `scriptName` matters for `$0`, it does not affect the merge result, which strips `$0`.)

In `tests/unit/cli/configMerge.test.js`, the test **"uses config values when real yargs output only contains parser defaults"** (~line 93) must use `parseArguments`:

```js
const { parseArguments } = require('../../../js/cli/args.cjs');
// ...
    const argv = parseArguments([
      '--username',
      'argv-user',
      '--target',
      'argv-target',
      '--analysisIds',
      'AN001',
    ]);
```

Leave the plain-object-based tests as-is; they intentionally exercise the `hasOwnProperty` fallback for hand-built sources.

- [ ] **Step 7: Run the full detection + existing arg/merge suites**

Run: `npm test -- --testPathPatterns="cli/args|cli/configMerge"`
Expected: PASS (new detection tests; the two migrated tests now get correct metadata via `parseArguments`; plain-object fallback tests unchanged).

- [ ] **Step 8: Run the per-commit gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/cli/args.cjs js/cli/configMerge.cjs varvis-download.cjs tests/unit/cli/args.test.js tests/unit/cli/configMerge.test.js tests/unit/cli/configMerge-snapshot.test.js
git commit -m "fix(cli): detect explicit options via yargs parse metadata

Replace the hand-rolled token scanner + alias table with yargs .parsed
.defaulted/.aliases, fixing bundled short flags (-oL) and multi-char aliases,
and share EXPLICIT_OPTIONS_KEY from args.cjs.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Ratify credential precedence + document (spec D1)

The code already resolves `CLI-explicit > env > config` for username/password/target via `firstNonEmptyString`. This task adds the regression tests that lock the precedence and the accurate CHANGELOG entry (only USER/PASSWORD flipped; TARGET is a new env source).

**Files:**
- Test: `tests/unit/cli/configMerge.test.js` (precedence matrix)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `mergeConfig({ argv, config, env })` from Task-1-updated configMerge.

- [ ] **Step 1: Write the precedence regression tests**

Add to `tests/unit/cli/configMerge.test.js`:

```js
describe('credential precedence (CLI > env > config)', () => {
  test('explicit --username overrides VARVIS_USER', () => {
    const result = mergeConfig({
      argv: { username: 'cli-user', target: 't' },
      config: { username: 'config-user' },
      env: { VARVIS_USER: 'env-user' },
    });
    expect(result.username).toBe('cli-user');
  });

  test('VARVIS_USER overrides config when no CLI flag', () => {
    const result = mergeConfig({
      argv: { target: 't' },
      config: { username: 'config-user' },
      env: { VARVIS_USER: 'env-user' },
    });
    expect(result.username).toBe('env-user');
  });

  test('VARVIS_TARGET is honored between CLI and config', () => {
    const result = mergeConfig({
      argv: { username: 'u' },
      config: { target: 'config-target' },
      env: { VARVIS_TARGET: 'env-target' },
    });
    expect(result.target).toBe('env-target');
  });
});
```

- [ ] **Step 2: Run to verify they pass against current behavior**

Run: `npm test -- --testPathPatterns=cli/configMerge`
Expected: PASS (this ratifies existing behavior; if any FAIL, the precedence is not as specified — stop and reconcile with spec D1 before writing docs).

- [ ] **Step 3: Add the CHANGELOG entry**

Add under an `## [Unreleased]` heading in `CHANGELOG.md` (create the file/section if absent, matching keep-a-changelog style already used in the repo):

```markdown
### Changed

- **Credential precedence now follows the CLI convention** (`CLI flag > environment variable > config file`). Previously an exported `VARVIS_USER` / `VARVIS_PASSWORD` overrode even an explicit `--username` / `--password`; now the explicit flag wins. Unset flags still fall back to the environment variable, then the config file.

### Added

- **`VARVIS_TARGET` environment variable** as a new source for `--target`, resolved at `CLI flag > VARVIS_TARGET > config file`.
```

- [ ] **Step 4: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add tests/unit/cli/configMerge.test.js CHANGELOG.md
git commit -m "docs(changelog): document credential precedence + VARVIS_TARGET

Lock CLI > env > config precedence with regression tests and document the
env-vs-CLI change and the new VARVIS_TARGET source.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Warn when overwrite comes from the config file (spec D3)

Config-file `overwrite`/`filetypes`/etc. are correctly honored (kept). Because `overwrite:true` is destructive, surface a one-time warning when it was sourced from the config file rather than an explicit flag. `mergeConfig` stays logger-free; it exposes a boolean and `main()` logs it.

**Files:**
- Modify: `js/cli/configMerge.cjs` (add `overwriteFromConfig` to the returned object)
- Modify: `js/types.d.ts` (add `overwriteFromConfig?: boolean` to `FinalConfig`)
- Modify: `varvis-download.cjs` (log the warning after merge)
- Test: `tests/unit/cli/configMerge.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `mergeConfig(...)` result gains `overwriteFromConfig: boolean` — true iff `overwrite === true` came from config (not an explicit flag).
- Consumes: `hasExplicitOption` (Task 1) inside `mergeConfig`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/cli/configMerge.test.js`:

```js
describe('overwrite source tracking', () => {
  test('flags overwrite sourced from config', () => {
    const result = mergeConfig({
      argv: { username: 'u', target: 't' },
      config: { overwrite: true },
      env: {},
    });
    expect(result.overwrite).toBe(true);
    expect(result.overwriteFromConfig).toBe(true);
  });

  test('does not flag an explicit --overwrite', () => {
    const argv = { username: 'u', target: 't', overwrite: true };
    Object.defineProperty(argv, '__varvisExplicitOptions', {
      enumerable: false,
      value: ['overwrite'],
    });
    const result = mergeConfig({ argv, config: { overwrite: true }, env: {} });
    expect(result.overwriteFromConfig).toBe(false);
  });

  test('does not flag when overwrite is false', () => {
    const result = mergeConfig({
      argv: { username: 'u', target: 't' },
      config: {},
      env: {},
    });
    expect(result.overwriteFromConfig).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --testPathPatterns=cli/configMerge`
Expected: FAIL — `overwriteFromConfig` is `undefined`.

- [ ] **Step 3: Compute and expose the boolean in `mergeConfig`**

In `js/cli/configMerge.cjs`, just before building `finalConfig`, add:

```js
const overwrite = mergeBoolean(argv, config, 'overwrite', false);
const overwriteFromConfig =
  overwrite === true &&
  !hasExplicitOption(argv, 'overwrite') &&
  config.overwrite === true;
```

Change the `finalConfig` object to use these:

```js
    overwrite,
    overwriteFromConfig,
```

(Replace the existing inline `overwrite: mergeBoolean(argv, config, 'overwrite', false),` line.)

- [ ] **Step 4: Add the type field (non-optional — always returned)**

In `js/types.d.ts`, add to the `FinalConfig` interface (near `overwrite: boolean;`). It is **required, not optional**, because `mergeConfig` always returns it and the snapshot test asserts an exact `toEqual` (Codex-flagged):

```ts
  overwriteFromConfig: boolean;
```

- [ ] **Step 5: Update the merge snapshot fixture**

`mergeConfig` now always includes `overwriteFromConfig`, so the exact-match fixture must gain the field. In `tests/fixtures/cli-output/configMerge.json`, add after the `"overwrite": false,` line:

```json
  "overwriteFromConfig": false,
```

Run: `npm test -- --testPathPatterns=cli/configMerge-snapshot`
Expected: PASS (the snapshot `toEqual` now matches).

- [ ] **Step 6: Log the warning in `main()`**

In `varvis-download.cjs`, immediately after `const finalConfig = mergeFromArgv(argv, process.env);` and after `activeLogger` exists, add:

```js
  if (finalConfig.overwriteFromConfig) {
    activeLogger.warn(
      'overwrite enabled via config file; existing files may be replaced.',
    );
  }
```

- [ ] **Step 7: Run tests**

Run: `npm test -- --testPathPatterns=cli/configMerge`
Expected: PASS (source-tracking tests + snapshot with the new fixture field).

- [ ] **Step 8: Add the CHANGELOG entry, gate, commit**

Append to the `### Changed` block in `CHANGELOG.md`:

```markdown
- **Config-file values for `overwrite`, `filetypes`, `filter`, `latest`, and `unmapped` are now honored** (previously masked by CLI parser defaults). When `overwrite: true` comes from the config file, a warning is logged since it can replace existing files.
```

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/cli/configMerge.cjs js/types.d.ts varvis-download.cjs tests/unit/cli/configMerge.test.js tests/fixtures/cli-output/configMerge.json CHANGELOG.md
git commit -m "feat(cli): warn when overwrite is enabled via config file

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Honor an explicit `--destination .` (spec D6)

Replace the `normalizedDestination !== '.'` heuristic with explicit-flag detection so a user who passes `-d .` gets `.` even when the config file names another destination.

**Files:**
- Modify: `js/cli/configMerge.cjs:320-323`
- Test: `tests/unit/cli/configMerge.test.js`

**Interfaces:**
- Consumes: `hasExplicitOption(argv, 'destination')` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/cli/configMerge.test.js`. Use real `parseArguments` argv so the metadata is correct — a hand-built plain object with `destination: '.'` and no metadata is treated as *explicit* by the `hasOwnProperty` fallback, which would make the "non-explicit" case impossible to express (Codex-flagged). Import `parseArguments` at the top of the file if not already present.

```js
const { parseArguments } = require('../../../js/cli/args.cjs');

describe('explicit --destination "."', () => {
  test('explicit -d . wins over config destination', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '-d',
      '.',
    ]);
    const result = mergeConfig({
      argv,
      config: { destination: '/config/dir' },
      env: {},
    });
    expect(result.destination).toBe('.');
  });

  test('default "." (no -d) falls through to config destination', () => {
    const argv = parseArguments(['--username', 'u', '--target', 't']);
    const result = mergeConfig({
      argv,
      config: { destination: '/config/dir' },
      env: {},
    });
    expect(result.destination).toBe('/config/dir');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --testPathPatterns=cli/configMerge`
Expected: FAIL — first test yields `/config/dir` (explicit `.` discarded by the `!== '.'` heuristic).

- [ ] **Step 3: Rewrite the destination merge**

In `js/cli/configMerge.cjs`, replace the destination entry (lines ~320-323):

```js
    destination:
      normalizedDestination && normalizedDestination !== '.'
        ? normalizedDestination
        : firstNonEmptyString(config.destination) || '.',
```

with:

```js
    destination: hasExplicitOption(argv, 'destination')
      ? normalizedDestination || '.'
      : firstNonEmptyString(config.destination) ||
        normalizedDestination ||
        '.',
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --testPathPatterns=cli/configMerge`
Expected: PASS (both new tests plus the existing destination cases — the parser default `.` is non-explicit, so config still wins when no flag is given).

- [ ] **Step 5: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/cli/configMerge.cjs tests/unit/cli/configMerge.test.js
git commit -m "fix(cli): honor an explicit --destination .

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `--password-stdin` channel + clearer non-TTY errors + non-TTY restore guard (spec D4)

Add the sanctioned non-interactive password channel, improve the non-TTY password error, and fail fast (instead of hanging) when a non-TTY run would hit an interactive restore prompt.

**Files:**
- Modify: `js/cli/args.cjs` (declare `password-stdin` option)
- Modify: `js/io/passwordPrompt.cjs` (add `readPasswordFromStdin`)
- Modify: `js/types.d.ts` (`passwordStdin?: boolean` on `FinalConfig`)
- Modify: `js/cli/configMerge.cjs` (carry `passwordStdin` through as a boolean)
- Modify: `varvis-download.cjs` (`resolvePassword` precedence + non-TTY restore guard)
- Test: `tests/unit/io/passwordPrompt.test.js`, `tests/unit/cli/args.test.js`
- Modify: `CHANGELOG.md`, `README.md`

**Interfaces:**
- Produces: `readPasswordFromStdin(deps?) => Promise<string>` — reads one line from stdin.
- Consumes: `finalConfig.passwordStdin: boolean`, `finalConfig.restoreArchived: RestoreMode`, `process.stdin.isTTY`.
- Password precedence (in `resolvePassword`): `--password-stdin` → explicit `--password`/env/config (already merged into `finalConfig.password`) → TTY prompt → throw.

- [ ] **Step 1: Declare the flag (test first)**

Add to `tests/unit/cli/args.test.js`. Assert the **default** (`false` when omitted), not just that `--password-stdin` yields `true` — yargs already coerces an undeclared `--password-stdin` to `passwordStdin: true`, so a truthy-only test is a false green (Codex-flagged). The default assertion only holds once the option is declared with `default: false`.

```js
test('defaults password-stdin to false', () => {
  expect(parse([]).passwordStdin).toBe(false);
});

test('parses --password-stdin as a boolean flag', () => {
  expect(parse(['--password-stdin']).passwordStdin).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --testPathPatterns=cli/args`
Expected: FAIL — `parse([]).passwordStdin` is `undefined`, not `false`.

- [ ] **Step 3: Add the option in `buildParser`**

In `js/cli/args.cjs`, add after the `password` option (~line 139):

```js
    .option('password-stdin', {
      describe: 'Read the Varvis API password from the first line of stdin',
      type: 'boolean',
      default: false,
    })
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --testPathPatterns=cli/args`
Expected: PASS.

- [ ] **Step 5: Write the failing `readPasswordFromStdin` test**

Add to `tests/unit/io/passwordPrompt.test.js`:

```js
const { Readable } = require('node:stream');
const { readPasswordFromStdin } = require('../../../js/io/passwordPrompt.cjs');

describe('readPasswordFromStdin', () => {
  test('reads the first line from a piped stream', async () => {
    const stdin = Readable.from(['hunter2\nignored-second-line\n']);
    await expect(readPasswordFromStdin({ stdin })).resolves.toBe('hunter2');
  });

  test('trims a trailing carriage return', async () => {
    const stdin = Readable.from(['hunter2\r\n']);
    await expect(readPasswordFromStdin({ stdin })).resolves.toBe('hunter2');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- --testPathPatterns=io/passwordPrompt`
Expected: FAIL — `readPasswordFromStdin is not a function`.

- [ ] **Step 7: Implement `readPasswordFromStdin`**

Add to `js/io/passwordPrompt.cjs`:

```js
const readlinePromises = require('node:readline');

/**
 * Reads a single line (the password) from a stream, without echo concerns.
 * @param   {{ stdin?: NodeJS.ReadableStream }} [deps] - Injectable stdin for tests.
 * @returns {Promise<string>}                          - The first line, trimmed of CR.
 */
async function readPasswordFromStdin(deps = {}) {
  const input = deps.stdin || process.stdin;
  const rl = readlinePromises.createInterface({ input });
  try {
    for await (const line of rl) {
      return line.replace(/\r$/, '');
    }
    return '';
  } finally {
    rl.close();
  }
}
```

Add `readPasswordFromStdin` to `module.exports`.

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- --testPathPatterns=io/passwordPrompt`
Expected: PASS.

- [ ] **Step 9: Carry `passwordStdin` through mergeConfig (test first)**

Add to `tests/unit/cli/configMerge.test.js`:

```js
test('passes through password-stdin flag', () => {
  const result = mergeConfig({
    argv: { username: 'u', target: 't', passwordStdin: true },
    config: {},
    env: {},
  });
  expect(result.passwordStdin).toBe(true);
});
```

Run: `npm test -- --testPathPatterns=cli/configMerge` → Expected FAIL (`passwordStdin` undefined).

Then in `js/cli/configMerge.cjs` add to `finalConfig`:

```js
    passwordStdin: mergeBoolean(argv, config, 'passwordStdin', false),
```

and add `passwordStdin: boolean;` (non-optional — always returned) to `FinalConfig` in `js/types.d.ts`. Also add the field to the snapshot fixture `tests/fixtures/cli-output/configMerge.json` (after `"overwriteFromConfig": false,`):

```json
  "passwordStdin": false,
```

Run: `npm test -- --testPathPatterns=cli/configMerge` → Expected PASS (pass-through test + snapshot with the new fixture field).

- [ ] **Step 10: Update `resolvePassword` precedence + error, add the non-TTY restore guard**

In `varvis-download.cjs`, replace `resolvePassword` (lines ~40-52):

Make `resolvePassword` accept **injectable deps** so it is unit-testable without the module-level `activeLogger` (which is `undefined` when the module is required in a test, and would throw on the warn path — Codex-flagged):

```js
/**
 * Resolves the password from stdin, an already-merged value, or a TTY prompt.
 * @param   {import('./js/types').FinalConfig} finalConfig - Merged config.
 * @param   {{
 *   logger?: import('winston').Logger,
 *   stdin?: NodeJS.ReadStream,
 *   readStdin?: typeof readPasswordFromStdin,
 *   prompt?: typeof promptForPassword,
 * }} [deps] - Injectable dependencies for tests.
 * @returns {Promise<string>} - Resolved password.
 */
async function resolvePassword(finalConfig, deps = {}) {
  const logger = deps.logger || activeLogger;
  const stdin = deps.stdin || process.stdin;
  const readStdin = deps.readStdin || readPasswordFromStdin;
  const prompt = deps.prompt || promptForPassword;

  if (finalConfig.passwordStdin) {
    if (finalConfig.password && logger) {
      logger.warn(
        '--password-stdin overrides the password supplied via --password/VARVIS_PASSWORD.',
      );
    }
    return readStdin({ stdin });
  }

  if (finalConfig.password) {
    return finalConfig.password;
  }

  if (!stdin.isTTY) {
    throw new ConfigurationError(
      'No password provided. Use --password-stdin, set VARVIS_PASSWORD, or run in an interactive terminal.',
    );
  }

  return prompt();
}
```

Update the call site (line ~100) to `const password = await resolvePassword(finalConfig);`.

Add the import at the top: `const { promptForPassword, readPasswordFromStdin } = require('./js/io/passwordPrompt.cjs');`.

Add the non-TTY restore guard immediately after the destination-directory block and before `resolvePassword` (so it fails fast without reading stdin):

```js
    const interactiveRestore =
      finalConfig.restoreArchived === 'ask' ||
      finalConfig.restoreArchived === 'all';
    if (interactiveRestore && !process.stdin.isTTY) {
      throw new ConfigurationError(
        'restoreArchived "ask"/"all" needs an interactive terminal. Use --restoreArchived force|no|none for non-interactive runs.',
      );
    }
```

- [ ] **Step 11: Make `resolvePassword` importable and cover the precedence**

Export `resolvePassword` and guard the auto-run so the module can be required without executing `main()`. In `varvis-download.cjs`, wrap the bottom `main().catch(...)` block:

```js
if (require.main === module) {
  main().catch((error) => {
    // ...existing error handler unchanged...
  });
}

module.exports = { resolvePassword };
```

This is safe for the existing `tests/unit/cli.test.js`, which runs the CLI via `execSync('node varvis-download.cjs ...')` — in that subprocess `require.main === module` is true, so `main()` still runs; when unit tests `require()` the module, it does not.

Create `tests/unit/passwordResolution.test.js`:

```js
const { Readable } = require('node:stream');
const { resolvePassword } = require('../../varvis-download.cjs');
const { ConfigurationError } = require('../../js/errors.cjs');

const ttyStdin = { isTTY: true };
const pipeStdin = { isTTY: false };

describe('resolvePassword precedence', () => {
  test('reads --password-stdin above everything else', async () => {
    const readStdin = jest.fn().mockResolvedValue('from-stdin');
    const logger = { warn: jest.fn() };
    const result = await resolvePassword(
      { passwordStdin: true, password: 'from-config' },
      { readStdin, logger, stdin: pipeStdin },
    );
    expect(result).toBe('from-stdin');
    expect(logger.warn).toHaveBeenCalled(); // warns that stdin overrode --password
  });

  test('returns an already-merged password without prompting', async () => {
    const prompt = jest.fn();
    const result = await resolvePassword(
      { passwordStdin: false, password: 'from-config' },
      { prompt, stdin: ttyStdin },
    );
    expect(result).toBe('from-config');
    expect(prompt).not.toHaveBeenCalled();
  });

  test('prompts on a TTY when no password is available', async () => {
    const prompt = jest.fn().mockResolvedValue('typed');
    const result = await resolvePassword(
      { passwordStdin: false, password: undefined },
      { prompt, stdin: ttyStdin },
    );
    expect(result).toBe('typed');
  });

  test('throws (does not hang) on a non-TTY with no password', async () => {
    await expect(
      resolvePassword(
        { passwordStdin: false, password: undefined },
        { stdin: pipeStdin },
      ),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});
```

Run: `npm test -- --testPathPatterns=passwordResolution`
Expected: PASS.

- [ ] **Step 12: Add CHANGELOG + README docs**

`CHANGELOG.md` `### Added`:

```markdown
- **`--password-stdin` flag** — reads the password from the first line of stdin, the recommended channel for non-interactive/automated use (mirrors `docker login --password-stdin`).
```

`CHANGELOG.md` `### Changed`:

```markdown
- **Non-interactive runs now fail fast with a clear message** instead of hanging: a password is required via `--password-stdin` / `VARVIS_PASSWORD` when there is no TTY, and `--restoreArchived ask|all` requires a TTY (use `force|no|none` in automation).
```

In `README.md`, add a short "Non-interactive / CI usage" note documenting `--password-stdin`, `VARVIS_USER`/`VARVIS_PASSWORD`/`VARVIS_TARGET`, the `CLI > env > config` precedence, and the `--restoreArchived force|no` requirement for automation.

Nice-to-have (not test-blocking): the `tests/fixtures/cli-output/help.txt` baseline is a captured snapshot, not asserted by any test (`cli.test.js` uses `--help` + `toContain`), so adding `--password-stdin` won't fail tests. Regenerate it for accuracy if you maintain it: `node varvis-download.cjs --help > tests/fixtures/cli-output/help.txt`.

- [ ] **Step 13: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/cli/args.cjs js/io/passwordPrompt.cjs js/cli/configMerge.cjs js/types.d.ts varvis-download.cjs tests/unit/io/passwordPrompt.test.js tests/unit/cli/args.test.js tests/unit/cli/configMerge.test.js tests/unit/passwordResolution.test.js tests/fixtures/cli-output/configMerge.json CHANGELOG.md README.md
git commit -m "feat(cli): add --password-stdin and fail fast without a TTY

Add the sanctioned non-interactive password channel, clearer non-TTY error,
and a guard that rejects interactive restore modes without a TTY.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Parallelize the tabix/bgzip probes (spec D8)

**Files:**
- Modify: `js/commands/download.cjs:56-67`
- Test: `tests/unit/commands/download.test.js`

**Interfaces:**
- Consumes: `checkToolAvailability(tool, cmd, minVersion, logger)` (unchanged).

- [ ] **Step 1: Write the failing test — prove true concurrency, not just "both called"**

A test that only asserts `tabix` and `bgzip` were both called is a false green: the current sequential code also calls both (Codex-flagged). Prove concurrency by holding `tabix` pending and asserting `bgzip` has already been invoked before `tabix` resolves. Add to `tests/unit/commands/download.test.js` (follow the file's existing mocking of `../../../js/toolChecks.cjs`, `../../../js/fetchUtils.cjs`, and the handlers):

```js
test('probes tabix and bgzip concurrently for ranged downloads', async () => {
  const calls = [];
  let releaseTabix;
  const tabixGate = new Promise((resolve) => {
    releaseTabix = resolve;
  });
  checkToolAvailability.mockImplementation(async (tool) => {
    calls.push(tool);
    if (tool === 'tabix') {
      await tabixGate; // stay pending
    }
    return true;
  });

  // Invoke with a ranged config so the tabix/bgzip branch runs; getDownloadLinks
  // mocked to return {} so no files are processed after the tool checks.
  const promise = runDownloadCommand(
    { finalConfig: rangedConfig, regions: ['chr1:1-2'], tempBedPath: '/tmp/x.bed' },
    deps,
  );
  await Promise.resolve(); // let the concurrent probes start

  // bgzip must already have been dispatched while tabix is still pending:
  expect(calls).toContain('bgzip');
  releaseTabix();
  await promise;
});
```

(`rangedConfig`/`deps` follow the file's existing fixtures; the load-bearing assertion is that `bgzip` is invoked before `tabix` resolves — impossible with sequential `await`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --testPathPatterns=commands/download`
Expected: FAIL — with sequential awaits, `bgzip` is not called until `tabix` resolves, so `calls` does not yet contain `bgzip` at the assertion.

- [ ] **Step 3: Replace sequential awaits with `Promise.all`**

In `js/commands/download.cjs`, replace lines ~56-67:

```js
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
```

with:

```js
      const [tabixOK, bgzipOK] = await Promise.all([
        checkToolAvailability('tabix', 'tabix --version', '1.7', logger),
        checkToolAvailability('bgzip', 'bgzip --version', '1.7', logger),
      ]);
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --testPathPatterns=commands/download`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/commands/download.cjs tests/unit/commands/download.test.js
git commit -m "perf(download): probe tabix and bgzip concurrently

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Consolidate resume.cjs onto the shared handlers (spec D7)

The highest-risk item. First give the handlers a `{ ok }` outcome (non-breaking for the primary path), then delegate resume's per-file download to them while keeping resume's loop, restoration I/O, and retry-requeue policy. Land it in two commits (7a: handler contract; 7b: resume delegation) so a reviewer can gate each.

#### Task 7a — Handler outcome contract

**Files:**
- Modify: `js/download/bamHandler.cjs`, `js/download/vcfHandler.cjs`
- Test: `tests/unit/download/bamHandler.test.js`, `tests/unit/download/vcfHandler.test.js`

**Interfaces:**
- Produces: `handleBamFile(args, deps) => Promise<{ ok: boolean }>` and `handleVcfFile(args, deps) => Promise<{ ok: boolean }>`. `ok:false` iff a download-body operation the handler already catches failed. `getValidDownloadUrl`/`ensureIndexFile` failures still THROW (unchanged).
- The primary path (`runDownloadCommand`) ignores the return value — behavior unchanged.

- [ ] **Step 1: Write failing tests asserting the outcome**

Add to `tests/unit/download/bamHandler.test.js` (mirror the file's existing mocking of `rangedUtils`, `commonDownload`, `urlRefresh`):

```js
test('returns { ok: true } on a successful full download', async () => {
  // existing happy-path mocks...
  const result = await handleBamFile(args, deps);
  expect(result).toEqual({ ok: true });
});

test('returns { ok: false } when the download body throws (already swallowed)', async () => {
  fullDownloadWithOptionalIndex.mockRejectedValueOnce(new Error('net'));
  const result = await handleBamFile(fullDownloadArgs, deps);
  expect(result).toEqual({ ok: false });
});

test('still throws when getValidDownloadUrl fails (not swallowed)', async () => {
  getValidDownloadUrl.mockRejectedValueOnce(new Error('auth'));
  await expect(handleBamFile(args, deps)).rejects.toThrow('auth');
});
```

Add the analogous three tests to `tests/unit/download/vcfHandler.test.js` (its full-download and per-region branches; assert `ok:false` when a region download throws but the loop continues).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --testPathPatterns="download/bamHandler|download/vcfHandler"`
Expected: FAIL — handlers currently return `undefined`.

- [ ] **Step 3: Thread an `ok` result through the handlers**

In `js/download/bamHandler.cjs`, introduce a local `let ok = true;`, set `ok = false;` inside each existing `catch` block (the full-download, ranged, and unmapped catches — do NOT add new catches around `getValidDownloadUrl`/`ensureIndexFile`), and `return { ok };` at the end of every path (the early `return;` after full download becomes `return { ok };`; the missing-index early `return;` becomes `return { ok: false };` since it is a failure to download). Update the JSDoc `@returns` to `{Promise<{ok: boolean}>}`.

Apply the same pattern in `js/download/vcfHandler.cjs`: `ok = false` in the full-download catch and in the per-region catch; the unmapped-skip early return is a success no-op → `return { ok: true };`; the missing-index early return → `return { ok: false };`; final `return { ok };`.

Note on the primary path: the handler's missing-index branch now returns `{ ok: false }` instead of `void`. `runDownloadCommand` ignores the return value, so its behavior is unchanged (it already logged-and-continued on missing index). Resume never reaches that branch because it does its own missing-index preflight (Task 7b).

- [ ] **Step 3b: Widen the deps types so token-only/null-rl delegation type-checks (Codex-flagged)**

`CommandDeps` currently requires `authService.login` and a non-null `rl` (`js/types.d.ts:135`). Resume will delegate with `{ authService: { token }, rl: null }`, which is valid at runtime (the handlers only read `authService.token` and pass `rl` through to `ensureIndexFile`/`downloadFile`, which already accept `null` — resume passes `null` today). Widen the types so strict `checkJs` accepts both callers. Use the `writing-typed-jsdoc` skill.

In `js/types.d.ts`, change `CommandDeps`:

```ts
export interface CommandDeps {
  logger: Logger;
  agent: HttpDispatcher;
  authService: {
    token: string;
    login?: (creds: Credentials, target: string) => Promise<LoginResult>;
  };
  rl: import('node:readline').Interface | null;
  metrics: Metrics;
}
```

In `js/download/commonDownload.cjs`, change the `DownloadDeps` `rl` typedef to nullable:

```js
 * @property {import('node:readline').Interface|null} rl - Prompt interface.
```

Run `npm run type-check` after Step 3 to confirm the handlers and the existing primary call site (which passes a full `authService` + real `rl`) still satisfy the widened types.

- [ ] **Step 4: Run handler tests**

Run: `npm test -- --testPathPatterns="download/bamHandler|download/vcfHandler"`
Expected: PASS.

- [ ] **Step 5: Confirm the primary path is unaffected**

Run: `npm test -- --testPathPatterns=commands/download`
Expected: PASS unchanged (runDownloadCommand ignores the return value).

- [ ] **Step 6: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/download/bamHandler.cjs js/download/vcfHandler.cjs js/types.d.ts js/download/commonDownload.cjs tests/unit/download/bamHandler.test.js tests/unit/download/vcfHandler.test.js
git commit -m "refactor(download): handlers return { ok } outcome

Non-breaking for the primary path (return ignored); enables resume to reuse
the handlers while keeping its retry-requeue policy. URL-refresh/index
acquisition still throw.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

#### Task 7b — Delegate resume's per-file download to the handlers

**Files:**
- Modify: `js/commands/resume.cjs` (replace the BAM/VCF download bodies with delegation; keep loop + preflight + requeue)
- Test: `tests/unit/commands/resume.test.js`, `tests/unit/archiveUtils.resumeRanged.test.js`

**Interfaces:**
- Consumes: `handleBamFile`/`handleVcfFile` (`{ ok }` contract from 7a), `getValidDownloadUrl`/`isUrlExpiringSoon` (for the refresh the resume path currently lacks — handlers already call `getValidDownloadUrl` internally, so simply delegating provides it).
- Preserves: still-archived / not-found / no-download-link / (index-requiring) missing-index → requeue; success drops the entry; any failure (`ok:false` or thrown) → requeue.

- [ ] **Step 1: Add regression tests for the preserved semantics**

Add to `tests/unit/commands/resume.test.js`:

```js
test('requeues the entry when the handler reports ok:false', async () => {
  handleBamFile.mockResolvedValueOnce({ ok: false });
  // ...set up one ready BAM entry in the restoration file...
  await resumeArchivedDownloads(/* ...args... */);
  // assert writeRestorationState received the entry (kept for retry)
});

test('drops the entry when the handler reports ok:true', async () => {
  handleBamFile.mockResolvedValueOnce({ ok: true });
  await resumeArchivedDownloads(/* ...args... */);
  // assert the entry is NOT in the written restoration data
});

test('forces unmapped:false when delegating a VCF', async () => {
  handleVcfFile.mockResolvedValueOnce({ ok: true });
  // restored options persist unmapped:true; entry is a .vcf.gz
  await resumeArchivedDownloads(/* ...args... */);
  expect(handleVcfFile).toHaveBeenCalledWith(
    expect.objectContaining({
      finalConfig: expect.objectContaining({ unmapped: false }),
    }),
    expect.anything(),
  );
});
```

Update `tests/unit/archiveUtils.resumeRanged.test.js` expectations to the canonical unsuffixed index name (`<file>.bai` / `<file>.tbi`) now that delegation uses the handler naming; add a case asserting a resumed ranged BAM refreshes an expiring index URL (the handler's `isUrlExpiringSoon` path).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --testPathPatterns="commands/resume|archiveUtils.resumeRanged"`
Expected: FAIL — resume does not yet import or call the handlers.

- [ ] **Step 3: Rewrite the per-entry body to delegate**

In `js/commands/resume.cjs`:

1. Add imports:

```js
const { handleBamFile } = require('../download/bamHandler.cjs');
const { handleVcfFile } = require('../download/vcfHandler.cjs');
```

2. Keep the existing preflight inside the per-entry `try` (still-archived / not-found via `!(entry.fileName in fileDict)` / `!downloadLink`), and keep the **index-requiring** preflight requeue: before delegating a ranged/unmapped BAM or ranged VCF, if the required `.bai`/`.tbi` is absent from `fileDict`, `updatedData.push(entry); continue;` (as today).

3. Replace the BAM/VCF/other download blocks with delegation that tracks a single `downloadSucceeded` flag, so there is **one** requeue point and the existing "Successfully resumed" log fires only on success (Codex-flagged: the naive version pushes on `ok:false` but then falls through to the success log):

```js
      const deps = {
        agent,
        authService: { token },
        logger,
        metrics,
        rl: null,
      };

      let downloadSucceeded = true;

      if (entry.fileName.endsWith('.bam')) {
        let tempBedPath;
        if (regions.length > 0) {
          tempBedPath = path.join(
            os.tmpdir(),
            `restore-regions-${entry.analysisId}-${entry.fileName}.bed`,
          );
          fs.writeFileSync(tempBedPath, regions.map(regionToBedLine).join('\n'));
        }
        try {
          const result = await handleBamFile(
            {
              fileDict,
              fileName: entry.fileName,
              finalConfig: {
                destination: effectiveDestination,
                overwrite: effectiveOverwrite,
                unmapped: includeUnmapped,
              },
              regions,
              target,
              tempBedPath,
            },
            deps,
          );
          downloadSucceeded = result.ok;
        } finally {
          if (tempBedPath && fs.existsSync(tempBedPath)) {
            fs.unlinkSync(tempBedPath);
          }
        }
      } else if (entry.fileName.endsWith('.vcf.gz')) {
        const result = await handleVcfFile(
          {
            fileDict,
            fileName: entry.fileName,
            finalConfig: {
              destination: effectiveDestination,
              overwrite: effectiveOverwrite,
              unmapped: false,
            },
            regions,
            target,
          },
          deps,
        );
        downloadSucceeded = result.ok;
      } else {
        // Non-BAM/VCF: keep the existing plain downloadFile path (throws on
        // failure -> caught by the outer per-entry try/catch -> requeue).
        // (unchanged from current implementation)
      }

      if (downloadSucceeded) {
        logger.info(
          `Successfully resumed download for analysis ${entry.analysisId}, file ${entry.fileName}`,
        );
      } else {
        updatedData.push(entry);
      }
```

Replace the existing unconditional "Successfully resumed download..." `logger.info` (resume.cjs ~line 428) with the guarded block above — do not leave the old one, or a requeued entry would still be logged as a success.

4. Delete the now-dead helpers/branches this replaces (the hand-rolled ranged/unmapped/full+index logic, and any imports left unused — e.g. `ensureIndexFile`, `rangedDownloadBAM`, `unmappedDownloadBAM`, `rangedDownloadVCF`, `indexBAM`, `indexVCF`, `fullDownloadWithOptionalIndex`, `getValidDownloadUrl` if resume no longer references them). Run lint to catch leftovers.

5. Failure channels converge on requeue: `ok === false` → `downloadSucceeded=false` → requeued at the guarded block; a thrown error (e.g. `getValidDownloadUrl`/`ensureIndexFile` inside the handler, or the non-BAM/VCF `downloadFile`) → the outer per-entry `try/catch` (unchanged) requeues. Confirm `os`, `path`, `fs`, and `regionToBedLine` are already imported in `resume.cjs` (they are) so no new imports are needed beyond the two handlers.

- [ ] **Step 4: Verify the file shrank and stays under budget**

Run: `wc -l js/commands/resume.cjs` — expect a meaningful drop (target well under 350). Run: `npm run architecture:check` — expect no new warning.

- [ ] **Step 5: Run resume + rangedResume + full unit suite**

Run: `npm test -- --testPathPatterns="commands/resume|archiveUtils.resumeRanged"`
Expected: PASS (including the preserved-semantics and unmapped:false tests).

Run: `npm test`
Expected: PASS (whole suite; watch for coverage-threshold regressions per the single-file coverage trap in `testing-varvis-modules`).

- [ ] **Step 6: Gate and commit**

```bash
npm run lint && npx prettier --check . && npm run type-check && npm test && npm run architecture:check
git add js/commands/resume.cjs tests/unit/commands/resume.test.js tests/unit/archiveUtils.resumeRanged.test.js
git commit -m "refactor(resume): delegate downloads to shared BAM/VCF handlers

Remove the duplicated ranged/unmapped/full+index logic; resume keeps its loop,
restoration I/O and retry-requeue while the handlers own download mechanics.
Forces unmapped:false for VCF; adds the URL-refresh guard resume lacked.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Fallback (if 7a's `{ ok }` contract ripples too far during 7b):** abandon full delegation; instead have resume reuse only `fullDownloadWithOptionalIndex` (`js/download/commonDownload.cjs`) for its full-download branches and add an explicit `isUrlExpiringSoon`→`getValidDownloadUrl` refresh before use, keeping resume's own ranged/unmapped orchestration. Smaller dedup, no handler-signature change. Record the decision in the commit message if taken.

---

## Self-Review

**Spec coverage:**
- D1 → Task 2 ✓ (precedence tests + CHANGELOG, accurate target wording)
- D2 → Task 1 ✓ (yargs `.parsed` detection, bundled/alias cases)
- D3 → Task 3 ✓ (honored + overwrite warn via boolean-on-result)
- D4 → Task 5 ✓ (`--password-stdin`, non-TTY error, non-TTY restore guard for ask+all)
- D5 → n/a ✓ (already done on branch; optional regression test folded into Task 5's gate)
- D6 → Task 4 ✓ (explicit `--destination .`)
- D7 → Task 7a + 7b ✓ (`{ ok }` contract only for already-swallowed failures; delegation; VCF `unmapped:false`; index-requiring preflight; canonical index name; refresh bonus; fallback recorded)
- D8 → Task 6 ✓ (`Promise.all`)
- Docs deliverables → Tasks 2/3/5 (CHANGELOG), Task 5 (README) ✓

**Placeholder scan:** Task 6 Step 1 and Task 7b Step 1 leave the surrounding mock fixtures (`rangedConfig`, `deps`, restoration-entry setup) as "follow existing mocks" references rather than full literals — deliberate, because those suites have bespoke setups documented in `testing-varvis-modules`; the load-bearing assertions and all production code are shown in full.

**Type consistency:** `handleBamFile`/`handleVcfFile` return `{ ok: boolean }` in 7a and are consumed as `result.ok`/`downloadSucceeded = result.ok` in 7b ✓. `EXPLICIT_OPTIONS_KEY` exported in Task 1, imported in configMerge ✓. `overwriteFromConfig`/`passwordStdin` are non-optional `boolean` on `FinalConfig`, always returned by `mergeConfig`, and present in the snapshot fixture ✓. `resolvePassword(finalConfig, deps?)` signature updated at its only call site, exported for tests, auto-run guarded by `require.main === module` ✓. `CommandDeps.rl`/`DownloadDeps.rl` widened to `Interface | null` and `authService.login` made optional so the resume delegation (`{ authService: { token }, rl: null }`) and the primary path both type-check ✓.

**Codex plan-review incorporations (rev 2):** all 5 blockers + 5 should-fixes resolved — alias-default detection (Task 1), `defaulted` typedef (Task 1), removed-middleware test migration (Task 1 Step 6b), non-explicit destination test via `parseArguments` (Task 4), snapshot/fixture updates (Tasks 3/5), false-green `--password-stdin` test (Task 5 Step 1), injectable `resolvePassword` + full precedence tests (Task 5 Step 11), deferred-promise concurrency test (Task 6), deps-type widening (Task 7a Step 3b), success-log fall-through (Task 7b Step 3).
