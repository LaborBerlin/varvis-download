# Documentation Review & Update (post-0.33.0) — Design

**Date:** 2026-07-07
**Author:** Claude (autonomous goal run) + Codex adversarial review
**Status:** Draft → Codex review → Plan

## Goal

Bring the VitePress documentation site (`docs/`) back into truth against the current 0.33.0 code, fix the missing homepage hero image (and broken nav logo), and resolve the three "Coming Soon" example stubs. Do it concisely, in the project's existing voice — correct and prune, do not rewrite wholesale.

## Context & problem

A read-only audit of every published doc page (cross-checked against `js/cli/args.cjs`, `js/cli/configMerge.cjs`, `js/fetchUtils.cjs`, `js/fileUtils.cjs`, and `package.json`) found the docs are substantially stale after the 0.32.0 / 0.33.0 releases. Defects fall into six themes, all **verified against code** (features claimed but absent were confirmed absent by grep; the real report/progress formats were read from source).

The homepage hero (`docs/index.md` → `/hero-image.svg`) and the nav logo (`config.mjs` → `/logo.png`) both 404 because there is **no `docs/public/` directory** — nothing was ever placed at those paths. This is the "missing image right side" the user reported.

## Ground truth (authoritative facts this spec is built on)

- Runnable file is **`varvis-download.cjs`** (`bin`/`main`). There is **no `varvis-download.js`**. Canonical invocation in examples: `./varvis-download.cjs …` (the install step does `chmod +x`); README uses `node varvis-download.cjs`; after `npm link` the command is `varvis-download`.
- Environment variables the code actually reads (`js/cli/configMerge.cjs` `getEnvConfig`): **only `VARVIS_USER`, `VARVIS_PASSWORD`, `VARVIS_TARGET`**. Every other `VARVIS_*` (and `HTTP_PROXY`/`HTTPS_PROXY`) in the docs is fictional.
- Precedence (verified): **explicit CLI flag > environment variable > config file > default**. Docs already state this correctly — no precedence rewrite needed (note the 0.32.0 change + non-TTY nuance instead).
- Proxy is configured **only** via `--proxy` / `--proxyUsername` / `--proxyPassword` flags or the JSON config keys `proxy` / `proxyUsername` / `proxyPassword`. No proxy env vars.
- Password on a **non-TTY**: must come from `--password-stdin` or `VARVIS_PASSWORD`, else the run fails fast. `restoreArchived: "ask"` (the default) auto-downgrades to `"no"` on a non-TTY (archived files skipped with a warning); an **explicit** `--restoreArchived ask|all` on a non-TTY fails fast.
- Config-file values for `overwrite`, `filetypes`, `filter`/`filters`, `latest`, `unmapped` **are** honored (0.32.0).
- **Real** runtime behavior: a `progress`-package bar (`  downloading [:bar] :rate/bps :percent :etas`, width 20), `fetchWithRetry` (3 attempts, true exponential backoff `2^(n-1)×1s`, retries only network/5xx/429), and a **plain-text** summary report:
  ```
      Download Summary Report:
      ------------------------
      Total Files Processed: N
      Files Downloaded: N
      Files Skipped (already exist): N
      Total Bytes Downloaded: N
      Average Download Speed: N bytes/sec
      Total Time Taken: N seconds
  ```
  Written verbatim to `--reportfile` (it is **not** JSON, has no `version`/`checksum`/per-file array).
- **Absent** features (grep-confirmed, docs must stop claiming them): resume of interrupted/partial downloads (only *archived-restoration* resume exists via `--resumeArchivedDownloads`), checksum/SHA-256/integrity verification, concurrent downloads (downloads are sequential), and all "performance" config keys (`maxConcurrentDownloads`, `requestTimeout`, `retryAttempts`, `retryDelay`, `streamBufferSize`, `progressUpdateInterval`, `VARVIS_CHUNK_SIZE`).
- Valid `filetypes`: `bam`, `bam.bai`, `vcf.gz`, `vcf.gz.tbi` (`vcf` alone is not valid).
- Node **>= 22.22.2**, npm **>= 10**. External tools: samtools, tabix, bgzip only.
- `docs/api/cli.md` and `docs/api/config-schema.md` are **generated** by `docs/scripts/docs-generator.cjs` (the `cliOptions` array + `cliContent`/`configSchema` blocks). Fixes to those two pages must be made **at the generator source**, then regenerated. `docs/api/config.md`, `docs/api/index.md`, and every `docs/guide/*` / `docs/examples/*` page are hand-authored — edit directly.

## Design decisions

### D1 — Missing images (hero + logo)

Create `docs/public/` (VitePress serves it at site root) with two committed SVG assets, already produced and rendered-verified:

- **`docs/public/hero-image.svg`** — a bespoke, self-contained, theme-aware illustration: a DNA double-helix (rungs pinch at the crossings for the twisted-ladder read) inside a document card with a download badge, in the varvis palette (`#067f95` / `#54a2aa` / `#bacccb`). A `@media (prefers-color-scheme: dark)` block swaps the card to dark; the light card also reads cleanly on a dark page, so there is no broken state under VitePress's manual theme toggle. Referenced by the existing `docs/index.md` hero (`src: /hero-image.svg`) — no change to `index.md`'s image ref needed.
- **`docs/public/logo.svg`** — the varvis "V" swoosh mark extracted verbatim from `assets/varvis_name.svg` (brand-exact), tight `viewBox`.
- **`config.mjs`**: change `logo: '/logo.png'` → `logo: '/logo.svg'` (the `.png` never existed).

Rationale: reuse the real brand asset for the logo; hand-build a hero that matches brand and subject (genomic file downloads). SVG keeps both assets tiny, crisp, and diff-able. No raster/binary blobs in git.

### D2 — Correct the binary name everywhere (~304 occurrences, 15 files)

Global, mechanical replacement across `docs/**/*.md` (excluding `.vitepress/dist`): **`varvis-download.js` → `varvis-download.cjs`** (preserving the `./` prefix). Also fix `chmod +x varvis-download.js` → `chmod +x varvis-download.cjs` (`installation.md`, `index.md`). This is faithful (matches the real filename and the `chmod` install step) and keeps every example's structure intact. `api/cli.md` (0 occurrences, uses the `varvis-download` linked form) is left as-is. Verification: `rg -c 'varvis-download\.js' docs` returns nothing outside `dist`.

### D3 — Delete fictional environment variables

Only `VARVIS_USER`, `VARVIS_PASSWORD`, `VARVIS_TARGET` are real. Remove/replace every other `VARVIS_*` and any claim that `HTTP_PROXY`/`HTTPS_PROXY` are read:

- `authentication.md`: delete the "Alternative Variable Names" / "Legacy support" block (`VARVIS_API_USER`, `VARVIS_USERNAME`, `VARVIS_API_KEY`, …). Rewrite the multi-instance section to be honest: those are user-chosen shell vars piped into `-u`/`-p`, not tool-recognized names — keep the pattern but label it accurately.
- `configuration.md`: cut the fictional `.env` keys (`VARVIS_DESTINATION`, `VARVIS_LOG_LEVEL`, `VARVIS_LOG_FILE`, `VARVIS_API_*`, `VARVIS_PROXY*`) down to the three real vars; delete the "Performance Configuration" section (D4).
- `proxy.md`: this file is the worst offender — replace every "set `VARVIS_PROXY*` / `HTTP_PROXY` then run without proxy arguments" recipe with the real flag/config approach (`--proxy`/`--proxyUsername`/`--proxyPassword` or config keys). Add a short, accurate note that the tool does not read proxy env vars.
- `logging.md`: remove `VARVIS_LOG_LEVEL` / `VARVIS_LOG_FORMAT` (use `--loglevel` / `--logfile`).
- `api/config.md`: replace the two authoritative-looking "Environment Variables" tables (which imply *all* options are env-overridable) with a single table of the three real vars and a sentence that only credentials + target are env-backed.

### D4 — Remove fabricated behavior/feature claims

Grep-verified absent — correct the prose to match reality:

- **Resume of interrupted downloads** (`downloads.md` "Resume Capability", `index.md` hero feature "resume capability"): reword to the truth — retries on transient errors; the only *resume* is archived-file restoration (`--resumeArchivedDownloads`). Do not imply byte-range/partial-file resume.
- **Checksum/integrity verification** (`downloads.md`, `logging.md` report `checksum`): delete. No checksums are computed.
- **"Up to 5 concurrent downloads"** (`downloads.md`): delete/replace — downloads are sequential. (External parallelism via GNU `parallel` in `batch-operations.md` is legitimate and stays.)
- **Performance config keys** (`configuration.md` 328-348) and `VARVIS_CHUNK_SIZE` (`downloads.md`): delete — none are read.
- **Report schema** (`logging.md`): replace the fabricated JSON report (`version`, `checksum`, `files[]`, `averageSpeed`…) with the real plain-text summary shown above. Fix the `varvis-download/0.17.1` User-Agent/report version strings.
- **Progress output**: keep (it's real) but show the actual bar format (`  downloading [====      ] :rate/bps :percent :etas`) rather than an invented percentage line.

### D5 — Document real-but-missing flags & behavior

- `--password-stdin` (added 0.32.0): add to `authentication.md` (the recommended non-interactive channel, mirroring `docker login --password-stdin`), to the generator `cliOptions` (→ `cli.md`), to `api/config.md`, and mention in `getting-started.md`'s auth step.
- **Non-TTY behavior**: document in `authentication.md` (password required via `--password-stdin`/`VARVIS_PASSWORD`) and `archive-management.md` ("ask" auto-downgrades to "no" on non-TTY; explicit `ask|all` fails fast).
- **Config-schema completeness**: add `latest`, `unmapped`, `passwordStdin`, `list`, `listUrls`/`urlFile` to the `configuration.md` parameter table, the generator `configSchema` (→ `config-schema.md`), and `api/config.md`'s schema. Fix the `target` `enum:["mytarget"]` over-constraint (target is a free instance short-name).
- Note the 0.32.0 precedence change + honored-config-fields where the precedence is described (`configuration.md`, `authentication.md`) — one sentence, no rewrite.

### D6 — "Coming Soon" stubs + dead links → repoint to the guide (do NOT build 3 new pages)

The stubbed material already exists twice: comprehensively in the guide (`filtering.md`, `range-downloads.md`, `batch-operations.md`) and inline on `examples/index.md` itself (Docker, GitHub Actions, Python, monitoring, retry). Building three net-new example pages would triple-maintain the same content and invite fresh drift (YAGNI). Instead:

- `examples/index.md`: delete the three "Coming Soon" stub sections; keep the already-present real automation/CI-CD/monitoring content, and add a short "See also" pointing to the guide pages.
- `config.mjs` Examples sidebar: repoint `Advanced Filtering → /guide/filtering`, `Genomic Ranges → /guide/range-downloads`, `Automation Scripts → /guide/batch-operations`; repoint or drop the API sidebar's dead `Core Functions → /api/functions` (point to `/api/` overview).
- Fix the same dead `/examples/{filtering,ranges,automation}` links in `examples/basic.md` "Next Steps", `examples/index.md`, and `range-downloads.md`.
- `config.mjs` `ignoreDeadLinks`: remove the now-resolved entries (`/examples/filtering`, `/examples/ranges`, `/examples/automation`, `/api/functions`, `/api/filters`, `/api/archive`). The build must pass dead-link checking **without** masking, proving the links are real.

### D7 — Version drift & cosmetics

- Node: `node:20-alpine` → `node:22-alpine`; `node-version: '20'` → `'22'` (`examples/index.md`, `batch-operations.md`); `docs/README.md` "requires v20+" → ">= 22.22.2".
- Stale tool-output versions → `0.33.0` (`installation.md` `Version 0.31.2`).
- tabix/bgzip version floors: standardize the stray `v1.7+` mentions (`downloads.md`, `basic.md`, and the generator's `cli.md` prose) to the authoritative install-table values (samtools ≥ 1.17, tabix ≥ 1.20, bgzip ≥ 1.20).
- `config.mjs` footer copyright `© 2024` → `© 2024–2026`.
- `api/cli.md` config example (generator): fix `"target": "https://…"` → an instance short-name and drop invalid `"filetypes": "…,vcf"` → `vcf.gz`.

## Out of scope

- No new example pages, no new guide pages, no API-reference expansion beyond the generator fixes.
- No code changes to `js/**` or `varvis-download.cjs` (docs-only branch). If a doc claim is ambiguous, the code wins and the doc is corrected to match.
- `filtering.md` "Complete Field List" (e.g. `instrument`, `fileSize`): API-response-dependent and unverifiable here; trim only the obviously-wrong duplicate before/after example, leave the field list otherwise untouched (flag, don't fabricate).
- No CHANGELOG "Fixed" entries for docs; add a single `Unreleased → Documentation` note. No version bump (docs-only).

## Verification

1. `rg -c 'varvis-download\.js' docs` (excluding `dist`) → 0.
2. `rg -n 'VARVIS_(?!USER|PASSWORD|TARGET)' docs/guide docs/examples docs/api docs/index.md` → 0 (no fictional env vars).
3. `npm run docs:generate` then `git diff docs/api/cli.md docs/api/config-schema.md` shows the intended, regenerated content (proves generator is the source).
4. `npm run docs:build` passes with `ignoreDeadLinks` trimmed (no dead links).
5. `npx prettier --check docs/**/*.md docs/.vitepress/config.mjs` passes.
6. Manual: hero + logo render in `npm run docs:dev` (spot-check light/dark).
7. `npm run check` (lint + prettier + type-check + test + architecture) stays green — docs changes must not touch code budgets, and the generator edit must not break its own lint.

## Risks

- **Generator vs. checked-in output divergence.** If `cli.md`/`config-schema.md` are edited by hand they'll be clobbered on next `docs:generate`. Mitigation: edit the generator, regenerate, commit both.
- **Over-deletion.** Removing a section that documents a *real* feature. Mitigation: every deletion in D4/D3 is tied to a grep-verified absence recorded above.
- **`.js`→`.cjs` sed catching unintended strings.** Mitigation: the token `varvis-download.js` is specific; verify the diff is only in fenced commands/prose and re-run the build.
