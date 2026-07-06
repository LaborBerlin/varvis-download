---
name: writing-typed-jsdoc
description: Use when adding or editing an exported function, class, or method in js/**/*.cjs or root *.cjs in varvis-download, adding a shared domain type, typing a dependency that ships no types, or when `npm run type-check` (tsc --noEmit, strict checkJs) or the eslint-plugin-jsdoc rules fail.
---

# Writing typed JSDoc

Runtime code is CommonJS `.cjs` with no build step (why:
`docs/adr/0001-defer-typescript-conversion.md`). Types come from JSDoc, gated
two ways:

- **`npm run type-check`** — `tsc --noEmit` with `strict`, `noImplicitAny`,
  `strictNullChecks`, `noImplicitReturns` on checked JS.
- **`eslint-plugin-jsdoc`** (`mode: typescript`) — every exported
  function/method/class in `js/**/*.cjs` and root `*.cjs` requires a JSDoc
  block. Tests and `docs/scripts/` are exempt.

## Referencing types

- **Shared domain types live in `js/types.d.ts`** (`AnalysisFile`, `FileDict`,
  `FinalConfig`, `Metrics`, `RestoreMode`, `HttpDispatcher`, `CommandDeps`, …).
  Add new shared shapes there — don't inline a `@typedef` for anything used
  across files.
- **Reference inline and extensionless:** `import('./types').AnalysisFile`
  from `js/*.cjs`; `import('../types').FinalConfig` from a subdirectory like
  `js/commands/`.
- **Third-party that ships types:** reference directly, e.g.
  `import('winston').Logger`. Prefer the repo alias
  `import('./types').HttpDispatcher` over raw `import('undici').Dispatcher`.
- **Third-party with no types:** add an ambient shim in `js/shims/<pkg>.d.ts` —
  `declare module 'pkg' { ... }` declaring only the surface actually used, with
  `export =` for CJS default-export packages (see `js/shims/progress.d.ts`,
  `mute-stream.d.ts`). Don't install `@types/*` speculatively; don't cast to
  `any`.
- **A shape used in only one file:** a local `@typedef {object} Name` above the
  function is fine (precedent: `DownloadCommandArgs` in
  `js/commands/download.cjs`).

## Tag style and alignment

Match this block (verified to pass lint + type-check):

```js
/**
 * Refreshes the signed download link for a single analysis file.
 * Used when a signed URL has expired.
 * @param   {import('./types').AnalysisFile}          file   - The file to refresh.
 * @param   {string}                                  target - The Varvis API target.
 * @param   {string}                                  token  - The CSRF token.
 * @param   {import('./types').HttpDispatcher}        agent  - The HTTP agent.
 * @param   {import('winston').Logger}                logger - The logger instance.
 * @returns {Promise<import('./types').AnalysisFile>}        - The updated file object.
 */
```

**Blocking — ESLint `error`, fails `npm run lint`:**

- Every exported function/method/class needs a JSDoc block (`require-jsdoc`).
- Every `@param` needs a name **and** a `{type}`, and the names must match the
  signature (`require-param`, `check-param-names`).
- Every exported function needs `@returns` **with a type**, even `async` ones
  (`forceReturnsWithAsync`) — use `{Promise<void>}` if nothing meaningful.
- Use `@returns` (never `@return`) and `@extends` (never `@augments`); types
  must be valid (`check-tag-names`, `valid-types`).

**House style — ESLint `warn`; `npm run lint` is bare `eslint .` (no
`--max-warnings=0`) so warnings don't fail CI, but every file follows it:**

- Column alignment (`check-line-alignment`): the type column pads to the widest
  type **including the `@returns` type**; the name column pads to the widest
  name; every description starts with `- `; the `@returns` line pads through
  the empty name column. Auto-fixable with `npx eslint --fix <file>`; prettier
  does not touch JSDoc.
- A description on every `@param` / `@returns`. Optional params use
  `[name=default]`.

## Strict-mode body idioms (not just the doc block)

- **`response.json()` is `unknown`.** Cast at the call site (HTTP goes through
  `fetchWithRetry` from `js/apiClient.cjs`; its options must carry
  `dispatcher`):
  ```js
  const data =
    /** @type {{ response: { apiFileLinks: import('./types').AnalysisFile[] } }} */ (
      await response.json()
    );
  ```
- **`catch (error)` is `unknown`.** Use `getErrorMessage(error)` /
  `getErrorStack(error)` from `js/errorUtils.cjs`; never touch `error.message`
  directly. When you rethrow, `preserve-caught-error` (an error-severity core
  rule from the recommended preset — not listed in `eslint.config.js`) requires
  either propagating the original (`throw error;` — the usual repo pattern) or
  attaching it as the cause of a new one
  (`throw new Error('...', { cause: error });` when adding context) — a bare
  `throw new Error(msg)` in a catch fails lint.
- **`strictNullChecks`** — guard optional fields (`file.downloadLink`,
  `file.analysisId`) before use, or narrow first.
- **Array indexing is not guarded** (`noUncheckedIndexedAccess` is off), so
  `apiFileLinks[0]` types as present even when the array may be empty. Check
  `.length` yourself — tsc won't.

## Module plumbing (CommonJS, not ESM)

- Runtime requires use the `.cjs` extension (`require('./apiClient.cjs')`) —
  only type refs are extensionless. Built-ins use the `node:` protocol.
- Export by adding the name to the module's `module.exports = { ... }` object
  (class modules do `module.exports = ClassName`). Never `export`/`import`,
  never `exports.foo =` inline.

## Verify

```bash
npm run type-check            # tsc --noEmit, strict
npx eslint js/<file>.cjs      # focused jsdoc/structure check
npm run lint && npx prettier --check .
```
