# ADR 0001: Defer Full TypeScript Conversion

**Status:** Accepted (2026-06-03)  
**Context spec:** `docs/superpowers/specs/2026-05-26-typescript-readiness-design.md`

## Context

`varvis-download` ships as JavaScript with CommonJS `.cjs` runtime files. TypeScript
already runs against the codebase in `checkJs` / `noEmit` mode via
`tsconfig.json`, and `npm run type-check` is part of the local and CI gates.

The TypeScript-readiness work enabled strict checking, centralized shared domain
types in `js/types.d.ts`, removed the oversized CLI entry-point exception, and
split command orchestration into focused CommonJS modules. That captures most of
the project value TypeScript would provide without adding a build step.

In 2026, we considered a full `.cjs` to `.ts` migration for the runtime code.

## Decision

Defer the full runtime conversion to `.ts` until one of the explicit triggers
below fires. Keep runtime files as `.cjs` and continue using JSDoc plus
`tsc --noEmit` as the type gate.

## Rationale

1. **The current model already catches the important errors.** With strict
   flags enabled, typed JSDoc plus `tsc --noEmit` checks nullability, implicit
   `any`, missing returns, and object-shape drift while preserving direct
   `node varvis-download.cjs` execution.
2. **A build step is real operational cost.** Native `.ts` runtime files would
   require a compilation pipeline, a compiled `dist/` entry, package `bin`
   changes, source-map decisions, and additional release-path testing.
3. **TypeScript 7 is still a moving target for tooling.** The April 2026
   TypeScript 7.0 Beta is promising, but stable programmatic APIs are expected
   later. Deferring avoids tying this small CLI to a still-settling compiler and
   tooling transition.
4. **The codebase is now prepared for a future conversion.** The readiness
   branch removed the main structural blockers: weak object JSDoc, disabled
   strict flags, oversized entry orchestration, and the circular resume/archive
   import shape.

## Triggers That Re-Open This Decision

Revisit this ADR if any of the following becomes true:

- TypeScript 7 or later becomes the documented default for new Node CLI projects
  in mainstream tooling.
- A contributor reports concrete friction caused by JSDoc syntax, and the
  friction is behavioral or maintainability related rather than cosmetic.
- The code needs generic, conditional, mapped, or discriminated-union patterns
  that JSDoc cannot express cleanly enough.
- `varvis-download` is published as a library API, not only as a CLI `bin`, and
  downstream consumers need emitted `.d.ts` files.
- A future major refactor already touches most runtime modules, making a
  conversion cheap to combine with that work.

## Migration Recipe

When a trigger fires, use a new branch off `main` and keep the conversion
mechanical:

1. Create `refactor/typescript-conversion`.
2. Rename runtime files from `.cjs` to `.ts`.
3. Rewrite top-level `require()` calls to `import` declarations.
4. Rewrite `module.exports` assignments to named exports.
5. Inline JSDoc import types as TypeScript annotations and remove redundant
   `@param` / `@returns` tags.
6. Convert `js/types.d.ts` to `js/types.ts`; keep external package shims only
   where package types are still missing.
7. Configure Jest to execute TypeScript tests and keep `tsc --noEmit` as the
   type gate.
8. Add a build step and update `package.json` `bin` to point to compiled output.
9. Run the full local gate and use GitHub Actions on the PR as the external
   gate.

Estimated effort after this readiness work: **5-7 days**. Without this readiness
work, the estimate was **12-18 days** because the migration would first need to
discover and untangle the same type and orchestration issues.

## Consequences

- **Positive:** The CLI remains simple to run, test, and release. Strict typing
  is enforced today. Future conversion is documented and bounded.
- **Negative:** Some advanced TypeScript syntax remains awkward in JSDoc, and
  type annotations are more verbose than native `.ts` files.
- **Neutral:** Strict JSDoc-checked JavaScript is an accepted steady state for
  this project, not only a temporary bridge.

## References

- [TypeScript: Migrating from JavaScript](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Announcing TypeScript 7.0 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- Context spec:
  `docs/superpowers/specs/2026-05-26-typescript-readiness-design.md`
