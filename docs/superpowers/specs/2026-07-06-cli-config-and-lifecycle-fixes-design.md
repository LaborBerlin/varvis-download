---
title: CLI Config Precedence, Password Input & Download-Path Fixes
status: Proposed (rev 1)
date: 2026-07-06
author: bernt.popp@charite.de
supersedes-contract: docs/superpowers/specs/2026-05-26-typescript-readiness-design.md (credential precedence)
---

# CLI Config Precedence, Password Input & Download-Path Fixes

## Revision History

- **rev 1 (2026-07-06):** initial draft after a deep review of the
  `refactor/typescript-readiness` branch and community-standards research
  (clig.dev, Docker/gh, Cobra/Viper, AWS CLI, CWE-214).

## Context

A deep review of the `refactor/typescript-readiness` branch (a large,
behavior-preserving extraction of the `varvis-download.cjs` monolith into
`js/cli/`, `js/commands/`, `js/download/`, `js/io/`, `js/net/`) surfaced a set
of **silent behavioral changes** and two lifecycle/altitude issues introduced
by the new config-merge and command-dispatch machinery. The refactor itself is
disciplined — signatures, argument order, and `module.exports` line up — but
several observable behaviors changed without documentation, and two are
genuine regressions.

Each decision below is grounded in a researched community standard so the
project converges on conventional CLI behavior rather than an ad-hoc one. Every
user-visible change gets a `CHANGELOG.md` entry. All work is test-first per
`AGENTS.md`.

### The earlier credential-precedence contract is being superseded

The rev-3 TypeScript-readiness spec defined the credential contract as
`env → argv/config → prompt` (environment variable wins over an explicit CLI
flag). The branch as-implemented already diverged from that, resolving
`firstNonEmptyString(explicitArgv, env, config)` (explicit flag wins). Research
(clig.dev, AWS CLI, Docker, spf13/Viper) confirms the **canonical** order is
`command-line flag > environment variable > config file > default`, and that an
explicit flag overriding an env var is the standard. **This spec adopts the
canonical order and explicitly supersedes the earlier env-first contract.**

## Findings addressed (verified against code)

| #   | Location                                           | Issue                                                                                                                    | Class                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1   | `js/cli/configMerge.cjs`                           | Credential env-vs-CLI precedence inverted vs old monolith                                                                | behavior change (ratify + document)           |
| 2   | `js/cli/args.cjs`                                  | Hand-rolled `collectExplicitOptions` misses bundled short flags (`-oL`); duplicates alias table                          | correctness + altitude                        |
| 3   | `js/cli/configMerge.cjs`                           | Config-file `overwrite`/`filetypes`/`filter`/`latest`/`unmapped` now honored where yargs defaults previously masked them | behavior change (keep + document + guard)     |
| 4   | `varvis-download.cjs` / `js/io/passwordPrompt.cjs` | Non-TTY password now throws; implicit piped-stdin read removed                                                           | behavior change (keep + add explicit channel) |
| 5   | `varvis-download.cjs` / `js/net/httpAgent.cjs`     | Success paths `return` instead of `process.exit(0)`; undici Agent never closed → lingering exit                          | regression                                    |
| 6   | `js/cli/configMerge.cjs`                           | Explicit `--destination .` ignored in favor of config value                                                              | correctness                                   |
| 7   | `js/commands/resume.cjs`                           | ~150 lines duplicate the extracted BAM/VCF download mechanics; no URL-refresh guard                                      | altitude / maintainability                    |
| 8   | `js/commands/download.cjs`                         | `tabix`/`bgzip` availability probes awaited sequentially                                                                 | efficiency                                    |

Two candidates from the review were **refuted** during verification and are
NOT in scope: a supposed `pos.split('-')` crash on chromosome-only resume
ranges (resume uses the guarded shared `regionToBedLine`), and a supposed
VCF-resume `regions[0]`-only drop (the resume VCF branch loops all regions).

## Decision

Eight scoped changes, sequenced so the foundational one lands first.

### D1 — Config precedence: ratify the canonical chain + document

**Standard:** `CLI flag > env var > config file > default` (clig.dev, AWS CLI,
Docker, Viper); explicit flag beats env var.

- Audit every field in `mergeConfig` (`js/cli/configMerge.cjs`) so resolution
  is uniformly CLI-explicit → env → config → default. Fields without an env
  source (most non-credential options) simply skip the env layer; the model is
  uniform, not the field set. Do **not** invent new env vars for non-credential
  options (YAGNI).
- `CHANGELOG.md`: document that explicit `--username` / `--password` /
  `--target` now override `VARVIS_USER` / `VARVIS_PASSWORD`, a deliberate change
  from the old env-wins behavior, aligning to the standard precedence.

### D2 — Explicit-flag detection via yargs-parser `defaulted` (foundational)

**Standard:** distinguish "user explicitly set the flag" from "parser default"
using the parser's own signal — the Cobra `flags.Changed()` / Click
`get_parameter_source()` / yargs-parser `defaulted` pattern. Verified locally:
`require('yargs-parser').detailed(argv, opts).defaulted` reports the default-only
keys, and for bundled short flags `-oL` it correctly marks **both** `overwrite`
and `list` as explicit (`defaulted: {}`).

- Replace the hand-rolled `collectExplicitOptions` token scanner and the
  `OPTION_ALIASES` table in `js/cli/args.cjs` with the yargs `defaulted` set.
  Preferred access: the yargs instance's `.parsed.defaulted` (populated after
  parse, using the same option config — no second source of truth). If
  `.parsed.defaulted` proves unreliable in yargs 18, fall back to calling
  `yargs-parser.detailed()` with the option config already declared in
  `buildParser` (shared, not re-declared).
- `hasExplicitOption(argv, canonicalName)` becomes "canonicalName (or any of
  its aliases) is present in argv and NOT in the `defaulted` set."
- This one change resolves finding #2 (bundled short flags), removes the
  `OPTION_ALIASES` duplication, and dissolves the `__varvisExplicitOptions`
  magic-string coupling between `args.cjs` and `configMerge.cjs`.

### D3 — Config values honored over defaults: keep, document, guard destructive case

**Standard:** honoring a config-file value over a _parser default_ is correct —
the default is the lowest precedence layer (clig.dev, Viper #671). Keep it.

- Keep the new behavior for `overwrite`, `filetypes`, `filter`, `latest`,
  `unmapped`.
- `CHANGELOG.md`: document that these `.config.json` values are now respected
  (previously masked by yargs defaults).
- Because `overwrite: true` is destructive, emit a single `logger.warn` when
  `overwrite` is resolved from the config file (i.e. not explicitly flagged),
  so the behavior is never silently surprising: e.g. `"overwrite enabled via
config file (.config.json); existing files may be replaced."`

### D4 — Non-interactive password: keep TTY guard, add `--password-stdin`

**Standard (reverses the original review note):** silently consuming piped
stdin is the anti-pattern; the modern pattern is an **explicit** stdin channel
(`docker login --password-stdin`, `gh auth login --with-token`), and failing
fast when there is no TTY is correct — never prompt or block without a TTY
(clig.dev; CWE-214 for secrets on the command line).

- Keep the current `resolvePassword` throw on non-TTY when no password source
  is available.
- Add a `--password-stdin` boolean flag: when set, read exactly one line from
  stdin and use it as the password. This is the sanctioned automation channel.
  If both `--password-stdin` and `--password` are supplied, `--password-stdin`
  wins and a `logger.warn` notes the redundancy (mirrors `docker login`).
- Password source precedence (highest first): `--password-stdin` value →
  explicit `--password <value>` → `VARVIS_PASSWORD` env → `config.password` →
  interactive TTY prompt. The middle three are resolved in `mergeConfig`
  (consistent with D1); `resolvePassword` layers `--password-stdin` on top and
  the TTY prompt at the bottom.
- Rewrite the non-TTY error to name every channel:
  `"No password provided. Use --password-stdin, set VARVIS_PASSWORD, or run in
an interactive terminal."`
- `CHANGELOG.md`: document the removal of implicit piped-stdin password reading
  and the new `--password-stdin` flag.
- **Out of scope (noted):** deprecating raw `--password <value>` per CWE-214.

### D5 — Process lifecycle: close the undici agent for prompt exit

- The undici `Agent` from `createHttpAgent` has default keep-alive and is never
  closed; success paths now `return` instead of `process.exit(0)`, so pooled
  sockets can delay natural exit.
- Wrap the command dispatch in `main()` so `await agent.close()` runs in a
  `finally` (alongside `rl.close()`), guaranteeing the dispatcher releases the
  agent on every path. Do not reintroduce `process.exit(0)` on the happy path;
  the error handler in `main().catch` keeps its explicit non-zero exits.
- `ProxyAgent` also exposes async `close()`; the same call covers both agent
  types returned by `createHttpAgent`.

### D6 — Explicit `--destination .` honored

- After D2, replace the `normalizedDestination !== '.'` heuristic in
  `mergeConfig` with explicit-flag detection: if `--destination` was explicitly
  passed (even as `.`), it wins over `config.destination`; otherwise fall
  through to config then the `'.'` default.

### D7 — resume.cjs consolidation onto shared handlers

**Branch check (done):** `js/commands/resume.cjs` (450 lines) carries a full
parallel copy of the BAM/VCF ranged/unmapped/full+index mechanics and does
**not** import the shared handlers. `handleBamFile` / `handleVcfFile`
(`js/download/`) read only `{destination, overwrite, unmapped}` from
`finalConfig` and obtain the token via `deps.authService.token`.

**The error-semantics conflict (crux of this item).** The two paths apply
different failure policies:

- Primary (`runDownloadCommand`): calls the handlers with **no per-file
  try/catch**; the handlers **swallow** their own download errors (log + return)
  and processing continues to the next file. No retry state.
- Resume: wraps each entry in a `try/catch` and **requeues** the entry
  (`updatedData.push(entry)`) on any thrown error, dropping it only on success.

If resume delegated to the handlers as-is, a failed download would be swallowed
by the handler, resume's `catch` would never fire, and the entry would be
**dropped from the restoration file as if it succeeded** — a silent
lost-retry regression. The consolidation therefore must not bake the failure
_policy_ into the shared handler.

**Contract:** `handleBamFile` / `handleVcfFile` return an outcome
`{ ok: boolean }` (`ok:false` when the primary download or any region/index step
failed) while still catching internally. This is **non-breaking for the primary
path**, which ignores the return value and keeps its tolerate-and-continue
behavior unchanged. Resume reads the outcome and requeues when `ok === false`
(or the call throws), preserving its retry guarantee.

- resume retains what is genuinely resume-specific: the entry loop, the
  restoration-state read/write, and the **pre-flight** requeue decisions
  (still-archived / not-found / no-download-link / missing `.bai`/`.tbi` index →
  push back to `updatedData` before delegating). Because resume guarantees the
  index exists before delegating, the handler's own missing-index skip branch is
  unreachable from resume, so the skip-vs-requeue divergence is preserved.
- resume delegates the actual per-file download to `handleBamFile` /
  `handleVcfFile`, constructing a compatible `args`
  (`{ fileDict, fileName, finalConfig: { destination, overwrite, unmapped },
regions, target, tempBedPath }`) and `deps`
  (`{ agent, authService: { token }, logger, metrics, rl: null }`).
- Temp-BED lifecycle: the handler only _reads_ `tempBedPath` (the caller owns
  cleanup, as `main()` does on the primary path). Resume builds regions + a
  per-entry temp BED, passes it in, and unlinks it in a `finally` around the
  delegation.
- Index-name reconciliation: resume's ranged branch currently suffixes the
  index name (`generateOutputFileName('<f>.bai', regions)`) while the handler
  uses the canonical unsuffixed `<f>.bai`. Delegation adopts the handler's
  (primary-path) naming. This is an intentional convergence; the resumeRanged
  tests must be updated to assert the canonical name and confirm samtools/tabix
  still locate the index.
- Bonus: delegation gives resume the `isUrlExpiringSoon` → `getValidDownloadUrl`
  refresh guard it currently lacks.
- Net effect: ~150 fewer lines in `resume.cjs`, one maintenance path for
  download mechanics (which is what commit `93868ba`'s duplicated unmapped fix
  paid for once already).

**Fallback (if the `{ ok }` contract ripples further than expected):** a
lower-risk D7-minimal — have resume reuse only `fullDownloadWithOptionalIndex`
(`js/download/commonDownload.cjs`) for its full-download branches and add the
URL-refresh guard, keeping its own ranged/unmapped orchestration. This removes
less duplication but touches no handler signatures. The plan carries this as an
explicit fallback if the outcome contract proves invasive during
implementation.

### D8 — Parallelize tool-availability probes

- In `js/commands/download.cjs`, run the independent `tabix` and `bgzip`
  availability checks with `Promise.all` instead of sequential `await`.

## Sequencing & risk

1. **D2** (explicit-flag detection) — foundational; D3 and D6 consume it.
2. **D1**, **D3**, **D6** — config-merge behavior + docs.
3. **D4** — password channel.
4. **D5**, **D8** — lifecycle + efficiency (independent, low risk).
5. **D7** — consolidation; largest and riskiest, lands last after everything
   above is green.

Each item is an atomic, test-first commit. D7 is the only high-risk item; it is
fully guarded by `tests/unit/commands/resume.test.js` and
`tests/unit/archiveUtils.resumeRanged.test.js`, extended as needed.

## Testing strategy

- **D1/D3/D6:** unit tests in `tests/unit/cli/configMerge.test.js` asserting the
  full precedence matrix per field (flag > env > config > default), the
  destructive-overwrite warn, and explicit `--destination .`.
- **D2:** unit tests in `tests/unit/cli/args.test.js` for `defaulted`-based
  detection, including bundled short flags (`-oL`), `--no-`-prefixed booleans,
  `=`-joined values, and long/short aliases.
- **D4:** unit tests for `resolvePassword` precedence and the non-TTY error;
  a `--password-stdin` read test (inject a fake stdin stream).
- **D5:** assert `agent.close()` is invoked on success and error paths (spy on a
  fake agent in a `main()`-level or dispatch-level test).
- **D7:** existing resume tests must stay green with delegation; add tests for:
  (a) a failed handler download requeues the entry (guards the lost-retry
  regression), (b) a resumed download refreshes an expiring URL, (c) missing
  `.bai`/`.tbi` entries are still requeued (not silently skipped), (d) the
  canonical unsuffixed index name is used. Handler tests
  (`tests/unit/download/bamHandler.test.js`, `vcfHandler.test.js`) must assert
  the new `{ ok }` return on both success and failure, and that the primary path
  still ignores it (behavior unchanged).
- **D8:** assert both probes are awaited (order-independent) and a failure in
  either still surfaces.

Per-commit gate (AGENTS.md):
`npm run lint && npx prettier --check . && npm run type-check && npm test &&
npm run architecture:check`. Use repo skills `testing-varvis-modules`,
`writing-typed-jsdoc`, and `splitting-oversized-files` during implementation.

## Documentation deliverables

- `CHANGELOG.md` entries for D1, D3, D4 (user-visible behavior/flags).
- Update `README.md` / docs for the new `--password-stdin` flag and the
  documented precedence model.

## Out of scope

- Deprecating raw `--password <value>` (CWE-214) — future work.
- Env vars for non-credential options.
- Any `.cjs` → `.ts` conversion (see the TypeScript-readiness ADR).
- The two refuted review candidates (chromosome-only resume crash; VCF-resume
  single-region drop) — verified non-issues.
