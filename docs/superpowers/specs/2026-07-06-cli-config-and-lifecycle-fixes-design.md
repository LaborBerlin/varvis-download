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
- **rev 2 (2026-07-06):** Codex high-reasoning review pass, each point verified
  against current HEAD (the branch moved during review). Changes: **D5 dropped**
  — `varvis-download.cjs` already closes the agent in a `finally`
  (`await agent.close().catch(() => {})`). **D7** gained three corrections: VCF
  delegation must force `unmapped:false` (resume downloads VCFs even when
  persisted `unmapped:true`, but `handleVcfFile` skips on `unmapped`); the
  `{ ok }` contract covers only the download-body failures handlers _already_
  swallow — `getValidDownloadUrl`/`ensureIndexFile` keep throwing (they are
  outside the handler try/catch today, and the primary path aborts on them);
  missing-index preflight applies only to index-requiring modes; VCF resume
  moves from fail-fast to attempt-all-then-requeue (accepted, tested). **D1**
  corrected: only `VARVIS_USER`/`VARVIS_PASSWORD` flipped from env-wins;
  `VARVIS_TARGET` is a _new_ env source (old monolith read `target` from
  argv/config only). **D2** refined to use yargs `.parsed.aliases` alias groups
  with `.parsed.defaulted` (dashed vs camelCase keys; multi-char aliases
  `--um`/`--rad`/`--pxu`); the "fallback without re-declaring options" idea
  requires first extracting shared option defs. **D3** warn mechanism specified
  (`mergeConfig` has no logger; compute source + emit from a caller that has
  one). **D4** gained the non-TTY interactive-restore interaction.
- **rev 3 (2026-07-06):** Codex re-verification confirmed rev 2 resolved all
  prior points; fixed the one new concern — the non-TTY restore guard must cover
  both `restoreArchived: 'ask'` **and** `'all'` (both prompt via `rl.question`).
  Spec marked ready for planning.

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
| 5   | `varvis-download.cjs`                              | Undici Agent lifecycle — **already fixed on the branch** (agent closed in `finally`); dropped from scope                 | resolved (no action)                          |
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
- `CHANGELOG.md`, stated precisely (Codex-verified against the old monolith):
  - Only `VARVIS_USER` / `VARVIS_PASSWORD` **changed**: the old monolith did
    `process.env.VARVIS_USER || finalConfig.username` (env won over an explicit
    `--username`); now an explicit flag wins. Document this as the deliberate,
    standard-aligning change.
  - `VARVIS_TARGET` is a **new** env source (the old monolith read `target` from
    argv/config only, `const target = finalConfig.target`). Document it as newly
    supported, resolved at `CLI > env > config`. Do **not** describe `--target`
    as reverting an env-wins behavior — it never had one.
- Primary standards citation for the precedence chain is the **AWS CLI** docs
  (explicit command-line options override env, which override config); clig.dev
  corroborates but is cited primarily for interactivity/secrets (D4).

### D2 — Explicit-flag detection via yargs-parser `defaulted` (foundational)

**Standard:** distinguish "user explicitly set the flag" from "parser default"
using the parser's own signal — the Cobra `flags.Changed()` / Click
`get_parameter_source()` / yargs-parser `defaulted` pattern. Verified locally:
`require('yargs-parser').detailed(argv, opts).defaulted` reports the default-only
keys, and for bundled short flags `-oL` it correctly marks **both** `overwrite`
and `list` as explicit (`defaulted: {}`).

- Replace the hand-rolled `collectExplicitOptions` token scanner and the
  `OPTION_ALIASES` table in `js/cli/args.cjs` with yargs' own parse metadata.
  Access via the yargs instance's `.parsed` (verified populated in yargs 18):
  `.parsed.defaulted` (map of default-sourced keys) **plus** `.parsed.aliases`
  (the alias groups, e.g. `listUrls: ['list-urls', 'U']`).
- **Alias-group + key-shape handling (Codex-surfaced, must-do):**
  `.parsed.defaulted` reports keys in mixed shapes (camelCase `listUrls` and
  dashed `list-urls`), and options have multi-character aliases (`um`, `rad`,
  `pxu`). So `hasExplicitOption(parsed, canonicalName)` must: resolve the full
  alias group for `canonicalName` from `.parsed.aliases`, then return true iff
  **at least one** member of that group is present in argv and **no** member of
  the group is in `defaulted`. Add tests for dashed vs camelCase keys and
  `--um` / `--rad` / `--pxu`.
- This resolves finding #2 (bundled short flags — verified: `-oL` yields
  `defaulted:{}` for both `overwrite` and `list`), removes the `OPTION_ALIASES`
  duplication, and dissolves the `__varvisExplicitOptions` magic-string coupling
  between `args.cjs` and `configMerge.cjs` (the parsed metadata travels with the
  argv object).
- **On the fallback:** if `.parsed.defaulted` ever proves insufficient, the only
  robust fallback is calling `yargs-parser.detailed()` — but `buildParser`
  currently declares options inline in a fluent chain, so that fallback first
  requires extracting a shared option-definition object. Treat that extraction
  as the fallback's prerequisite, not a free option. Prefer `.parsed` and avoid
  the fallback unless forced.

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
- **Warn mechanism (Codex-surfaced):** `mergeConfig` takes no logger and returns
  only final values, so it cannot emit the warning itself. The condition is
  computable with D2's detection: `overwrite === true && !hasExplicitOption(...,
'overwrite') && config.overwrite === true`. Emit the warn from a caller that
  has a logger — either expose a small `overwriteFromConfig` boolean on the
  merged result (cheap, explicit) and have `main()` log it, or pass the logger
  into `mergeConfig`. The spec prefers the boolean-on-result approach to keep
  `mergeConfig` logger-free and pure.

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
- **Non-TTY ↔ interactive-restore interaction (Codex-surfaced):** password
  resolution happens before the main `rl`, but a piped stdin (used for
  `--password-stdin`) is exhausted/non-TTY afterward, so a later interactive
  restore prompt would hang or auto-resolve. **Both `restoreArchived: 'ask'` and
  `'all'` prompt via `rl.question`** (`fetchUtils.cjs` asks once for `'all'`:
  `"Restore all archived files? (y/n)"`), so the guard must cover both. When
  `!process.stdin.isTTY` and `restoreArchived` is `'ask'` or `'all'`, fail fast
  with a clear error directing the user to a non-interactive restore mode
  (`--restoreArchived force|no`). This keeps the CLI from hanging in pipelines
  and is the same "no prompts without a TTY" rule as the password path.
- **Out of scope (noted):** deprecating raw `--password <value>` per CWE-214.

### D5 — Process lifecycle: already fixed on the branch (no action)

**Codex-verified:** `varvis-download.cjs` already creates the agent before
dispatch and closes it in an outer `finally` with
`await agent.close().catch(() => {})` (covering both the composed `Agent` and
`ProxyAgent`). The lingering-exit regression is resolved. **Dropped from scope.**
Optional: a regression test asserting `agent.close()` runs on both success and
error paths, folded into the D-series test work if cheap.

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

**Contract (refined after Codex review).** The handlers do **not** catch
everything today: `getValidDownloadUrl` and `ensureIndexFile` run _outside_ the
per-operation try/catch, so a URL-refresh or index-acquisition failure currently
**throws and aborts** the primary batch, while only the download-body operations
(`fullDownloadWithOptionalIndex` / `rangedDownload*` / `unmappedDownloadBAM`) are
caught and swallowed. So a blanket "catch all → `{ ok:false }`" would newly make
the primary path tolerate failures it currently aborts on — a behavior change.

The correct contract: handlers return `{ ok: boolean }` reflecting **only the
failures they already swallow** (the download-body ops); they continue to
**throw** on the currently-throwing failures (`getValidDownloadUrl`,
`ensureIndexFile`). This is genuinely **non-breaking for the primary path**: it
ignores the return value and still aborts on the throwing failures, exactly as
today. Resume wraps each delegation in its existing per-entry `try/catch`, so
both channels converge on requeue: a swallowed body failure yields `ok:false`
→ requeue; a thrown refresh/index failure is caught by resume → requeue. Retry
guarantee preserved either way.

- resume retains what is genuinely resume-specific: the entry loop, the
  restoration-state read/write, and the **pre-flight** requeue decisions
  (still-archived / not-found / no-download-link → push back to `updatedData`
  before delegating). The **missing-index preflight applies only to
  index-requiring modes** (ranged BAM, unmapped BAM, ranged VCF); full downloads
  treat the index as optional, matching today's resume. Because resume
  guarantees the index exists before delegating in those modes, the handler's
  own missing-index skip branch is unreachable from resume, so the
  skip-vs-requeue divergence is preserved.
- resume delegates the actual per-file download to `handleBamFile` /
  `handleVcfFile`, constructing a compatible `args` and `deps`
  (`{ agent, authService: { token }, logger, metrics, rl: null }`).
- **VCF `unmapped` guard (Codex-surfaced blocker).** `handleVcfFile` skips the
  file entirely when `finalConfig.unmapped` is true, but resume today downloads
  VCFs regardless of a persisted `unmapped:true` (its `includeUnmapped` gates
  only the BAM branches). So VCF delegation must pass
  `finalConfig: { destination, overwrite, unmapped: false }` — never propagate a
  persisted `unmapped` into the VCF handler. BAM delegation passes the real
  `unmapped`. The existing test asserting no spurious `.unmapped` infix on
  resumed VCFs must stay green.
- **VCF per-region semantics change (accepted).** Resume's current VCF ranged
  loop has no per-region try/catch, so it **fails fast** on the first region
  error and requeues the entry. `handleVcfFile` catches per region and continues,
  then (per the contract) returns `ok:false` → resume requeues. Net: resume moves
  from fail-fast to **attempt-all-regions-then-requeue**, which makes more
  progress before a retry and still requeues on any failure. This is an accepted,
  intentional change; add a test for partial-region-failure → entry requeued.
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

1. **D2** (explicit-flag detection via yargs `.parsed`) — foundational; D3 and
   D6 consume it.
2. **D1**, **D3**, **D6** — config-merge behavior + docs.
3. **D4** — password channel + non-TTY restore guard.
4. **D8** — parallelize tool probes (independent, trivial). (**D5** already done
   on the branch — no work.)
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
