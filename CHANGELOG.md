# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.33.2] - 2026-09-08

### Changed

- **Production dependencies**: `fs-extra` 11.3.6 → 11.4.0, `undici` 8.7.0 → 8.10.2, `yargs` 18.0.0 → 18.1.0 (#140).
- **Tooling**: `@types/node` 26.1.1 → 26.1.2, `lint-staged` 17.1.0 → 17.2.0, `prettier` 3.9.5 → 3.9.6 (#144).
- **Linting**: `eslint` 10.7.0 → 10.8.0, `eslint-plugin-jsdoc` 63.2.0 → 63.3.3, `eslint-plugin-unicorn` 72.0.0 → 73.0.0 (#145).
- **Testing**: `jest` 30.4.2 → 30.5.1, `nock` 14.0.16 → 14.0.17 (#146).

### Security

- **Resolved 13 Dependabot security advisories** across production and dev dependency trees (`npm audit` reports 0 vulnerabilities):
  - `undici`: CRLF injection and cache/cookie disclosure advisories (GHSA-8xcm-r25x-g524, GHSA-4cwx-7wf7-3272, GHSA-m8rv-5g2x-5cg5, GHSA-jr45-8vmc-qm54, GHSA-v3r7-h72x-cjcm).
  - `js-yaml`: quadratic CPU consumption in !!omap resolution (CVE-2026-59870 / GHSA-5p4m-2wfm-xmqj), pinned to `^3.15.2` via npm overrides.
  - `brace-expansion`: exponential-time DoS (GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895), resolved with scoped overrides for `minimatch` (`^5.0.9`) and `glob`/`test-exclude` (`^1.1.18`).
  - `browserslist`: unhandled crash and memory growth (GHSA-73wf-gq98-2v4g, GHSA-c83g-rgw3-j3cx), pinned to `^4.28.9` via npm overrides.
  - `postcss`: path traversal in source map auto-loading (GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849), pinned to `^8.5.28` via npm overrides.
  - `@humanfs/node`: symlink traversal in recursive copy (GHSA-p498-v437-472g), pinned to `^0.16.8` via npm overrides.
  - `nanoid`: loop DoS in generators (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8), pinned to `^3.3.18` via npm overrides.

### Fixed

- **Jest 30.5 ESM compatibility**: accessed host `createRequire` via `Object.getPrototypeOf(nodeModule)` in `js/cli/args.cjs` and `varvis-download.cjs` to bypass Jest 30.5's newly added sandboxed `createRequire` interception for ESM packages (`yargs`).
- **Path assertions**: normalized hardcoded POSIX paths in `tests/unit/archiveUtils.resumeRanged.test.js` and `tests/unit/download/bamHandler.test.js` with `path.join` for cross-platform Windows/POSIX compatibility.
- **Git worktree isolation**: ignored `.worktrees/` and `worktrees/` in `eslint.config.js`, `jest.config.cjs`, and `scripts/check-architecture-budget.mjs`.

## [0.33.1] - 2026-07-20

### Added

- **`.github/CODEOWNERS`** assigning repository-wide ownership to @berntpopp, enabling automatic reviewer assignment (#135, contributed by @your-highness).

### Changed

- **Production dependency**: `tough-cookie` 6.0.1 → 6.0.2 (#131).
- **Tooling**: `typescript` 6.0.2 → **7.0.2** (the native compiler); `tsconfig.json` migrated from the removed `moduleResolution: "node10"` to `module`/`moduleResolution: "nodenext"`. Also `prettier` 3.8.4 → 3.9.5, `lint-staged` 17.0.8 → 17.1.0, `@types/node` 26.1.0 → 26.1.1 (#138).
- **Linting**: `eslint` 10.6.0 → 10.7.0, `eslint-plugin-jsdoc` 63.0.12 → 63.2.0, `eslint-plugin-unicorn` 71.1.0 → 72.0.0 (#137).
- **CI**: `actions/setup-node` v6 → v7 across all workflows (#136).

## [0.33.0] - 2026-07-07

### Fixed

- **`fetchWithRetry` no longer retries permanent 4xx responses** (#125). Retries are now limited to transient failures (network errors, HTTP 5xx, and 429); a 400/401/403/404 fails fast instead of sleeping through three pointless attempts. The backoff is now genuinely exponential (`2 ** (n - 1) × 1 s`), matching its description.
- **Ranged VCF downloads run `tabix` via an argument array instead of `sh -c`** (#124). The URL and genomic range are passed as distinct `spawn` arguments (matching the BAM path), so shell metacharacters can no longer break the command or be interpreted by a shell.
- **`downloadFile` honors writable backpressure** (#123). Large full downloads await the write stream's `drain` event instead of buffering the entire response in memory, keeping memory bounded when the disk/network sink is slower than the source (e.g. multi-GB BAMs to NFS).
- **Authenticated proxy support sends a valid `Proxy-Authorization` header** (#122). Credentials are base64-encoded and passed via undici's `token` option; previously the raw `user:pass` produced a malformed `Basic user:pass` header that authenticating proxies rejected.
- **Concurrent ranged downloads no longer collide on a shared temp BED file** (#121). `parseRegions` writes to a unique per-invocation path (`varvis-regions-<pid>-<rand>.bed`) instead of a fixed `regions.bed` (which previously let one run silently overwrite another's regions), and the temporary file is now removed on every exit path — success, early return, or error.

## [0.32.1] - 2026-07-07

### Security

- **Resolved `GHSA-h67p-54hq-rp68`** (js-yaml quadratic-complexity DoS in merge-key handling via repeated aliases). `js-yaml` is a dev-only transitive dependency of the test toolchain (`jest` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config`, which requests `^3.13.1`); an npm `overrides` entry now pins it to `^3.15.0`. `npm audit` reports 0 vulnerabilities.

## [0.32.0] - 2026-07-06

### Changed

- **Credential precedence now follows the CLI convention** (`CLI flag > environment variable > config file`). Previously an exported `VARVIS_USER` / `VARVIS_PASSWORD` overrode even an explicit `--username` / `--password`; now the explicit flag wins. Unset flags still fall back to the environment variable, then the config file.
- **Config-file values for `overwrite`, `filetypes`, `filter`, `latest`, and `unmapped` are now honored** (previously masked by CLI parser defaults). When `overwrite: true` comes from the config file, a warning is logged since it can replace existing files.
- **Non-interactive runs no longer hang on the archive-restore prompt.** When there is no TTY, a password is required via `--password-stdin` / `VARVIS_PASSWORD`. For archive restoration, the default `ask` mode (which cannot prompt without a terminal) is automatically downgraded to `no` — archived files are skipped and a warning explains how to restore them (`--restoreArchived force`); the download of non-archived files proceeds normally. Only an **explicit** `--restoreArchived ask|all` on a non-TTY fails fast, since that is a deliberate request for interactivity the environment cannot provide.

### Added

- **`VARVIS_TARGET` environment variable** as a new source for `--target`, resolved at `CLI flag > VARVIS_TARGET > config file`.
- **`--password-stdin` flag** — reads the password from the first line of stdin, the recommended channel for non-interactive/automated use (mirrors `docker login --password-stdin`).
