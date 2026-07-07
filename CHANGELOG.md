# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
