---
name: writing-typed-jsdoc
description: Use when adding or editing an exported function, class, or method in a js/*.cjs module in varvis-download, adding a shared domain type, handling an untyped dependency, or when `npm run type-check` (tsc --noEmit, strict checkJs) or the eslint-plugin-jsdoc rules fail. Covers the import('./types') reference idiom, shims, tag alignment, and strict-null/unknown idioms.
---

# Writing typed JSDoc

Runtime code is CommonJS `.cjs` with **no build step**. Types come from JSDoc,
checked two ways (both are gates):

- **`tsc --noEmit`** in strict `checkJs` mode (`tsconfig.json`: `strict`,
  `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`). Run: `npm run type-check`.
- **`eslint-plugin-jsdoc`** (`mode: typescript`) enforces doc structure. Every
  exported function/method/class in `js/**/*.cjs` and root `*.cjs` **requires** a
  JSDoc block (`jsdoc/require-jsdoc` is an error). Tests and `docs/scripts/` are exempt.

Background on why JSDoc-not-TS: `docs/adr/0001-defer-typescript-conversion.md`.

## Referencing types

- **Shared domain types live in `js/types.d.ts`** (declaration-only, emits nothing):
  `AnalysisFile`, `FileDict`, `FinalConfig`, `Metrics`, `RestoreMode`,
  `HttpDispatcher`, `CommandDeps`, etc. Add new shared shapes **there** — don't
  inline a `@typedef` for anything used across files.
- **Reference them inline and extensionless:** `import('./types').AnalysisFile`
  from `js/*.cjs`; `import('../types').FinalConfig` from a subdirectory like
  `js/commands/`. This resolves because `tsconfig.json` includes `js/**/*.d.ts`.
- **Third-party that ships types:** reference directly, e.g. `import('winston').Logger`.
  Prefer the repo alias `import('./types').HttpDispatcher` over raw
  `import('undici').Dispatcher`.
- **Third-party with NO types:** add an ambient shim in `js/shims/<pkg>.d.ts` —
  `declare module 'pkg' { ... }` declaring **only the surface actually used**, with
  `export =` for CJS default-export packages (see `js/shims/progress.d.ts`,
  `mute-stream.d.ts`). Do **not** install `@types/*` speculatively and do **not**
  cast to `any`.
- **A shape used in only one file:** a local `@typedef {object} Name` above the
  function is fine (precedent: `DownloadCommandArgs` in `js/commands/download.cjs`).

## Tag style and alignment

Match this block (real, verified to pass lint + type-check):

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

**Blocking — ESLint `error`, these fail `npm run lint`:**

- Every exported function/method/class needs a JSDoc block (`require-jsdoc`).
- Every `@param` needs a name **and** a `{type}`, and the names must match the
  signature (`require-param`, `check-param-names`).
- Every exported function needs `@returns` **with a type**, even `async` ones
  (`forceReturnsWithAsync`) — use `{Promise<void>}` if nothing meaningful.
- Use `@returns` (never `@return`) and `@extends` (never `@augments`); types must
  be valid (`check-tag-names`, `valid-types`).

**House style — ESLint `warn`, does NOT fail CI (`npm run lint` is bare `eslint .`,
no `--max-warnings=0`), but every file follows it, so match it:**

- Column alignment (`check-line-alignment`): the type column pads to the widest
  type **including the `@returns` type**; the name column pads to the widest name;
  every description starts with `- `; the `@returns` line pads through the empty
  name column. This is enforced only by eslint-plugin-jsdoc — prettier does not
  touch JSDoc.
- A description on every `@param` / `@returns`. Optional params use `[name=default]`.

## Strict-mode body idioms (not just the doc block)

- **`response.json()` is `unknown`.** Cast at the call site:
  ```js
  const data = /** @type {{ response: { apiFileLinks: import('./types').AnalysisFile[] } }} */ (
    await response.json()
  );
  ```
- **`catch (error)` is `unknown`.** Use `getErrorMessage(error)` / `getErrorStack(error)`
  from `js/errorUtils.cjs`; never touch `error.message` directly. When you rethrow,
  ESLint's `preserve-caught-error` requires you either propagate the original
  (`throw error;`) or attach it as the cause of a new one
  (`throw new Error('...', { cause: error });`) — a bare `throw new Error(msg)` in a
  catch fails lint.
- **`strictNullChecks`** — guard optional fields (`file.downloadLink`,
  `file.analysisId`) before use, or narrow first.
- **Array indexing is not guarded** (`noUncheckedIndexedAccess` is off), so
  `apiFileLinks[0]` types as present even when the array may be empty. Check
  `.length` yourself before indexing — tsc won't.

## Exporting (CommonJS, not ESM)

Add the name to the module's `module.exports = { ... }` object (class modules do
`module.exports = ClassName`). Never `export`/`import`, never `exports.foo =` inline.

## Verify

```bash
npm run type-check            # tsc --noEmit, strict
npx eslint js/<file>.cjs      # focused jsdoc/structure check
npm run lint && npx prettier --check .
```
