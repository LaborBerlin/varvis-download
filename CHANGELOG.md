# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

- **Removed `confirmOverwrite` export**: Removed unused `confirmOverwrite` helper from `js/fileUtils.cjs` as file overwrites are controlled explicitly via the `--overwrite` flag (#154).

### Performance

- **Undici connection pool timeouts**: Configured explicit Undici Agent `connectTimeout` (15s), `keepAliveTimeout` (30s), and `keepAliveMaxTimeout` (60s) for connection reuse during batch operations (#152).
- **Request deadlines & retry jitter**: Added fresh per-attempt `AbortSignal.timeout` (30s default) to API requests, body cancellation on retry, and Equal Jitter backoff (#152).
- **Batch restoration state updates in production flow**: Grouped archived file restorations by analysis in `getDownloadLinks`, invoking restore once per analysis and writing state file in a single batch (#153).

### Fixed

- **Failure-safe `.part` replacement on overwrite**: Replaced naive unlink-then-rename with staged backup and rollback to prevent data loss on overwrite failure (#155).
- **Readiness check on unknown-ETA restoration entries**: Aligned `resume.cjs` with `getReadyEntries` so entries with missing or null restoration estimates are checked rather than indefinitely skipped (#153).
- **CLI failure exit on download errors**: Propagates download errors to command exit status to ensure automation never treats failed downloads as successful (#155).

### Documentation

- **Remediation traceability alignment**: Corrected originating issue cross-references across #147, #148, #149, PR #151, and follow-up issues #152–#156 (#156).

## [0.34.0] - 2026-09-08

### Security

- **Target subdomain format validation**: `--target` is validated against `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i` before URL construction, preventing SSRF and fragment injection attacks (#147).
- **Remote filename path traversal sanitization**: Neutralized directory traversal sequences in API-provided filenames using `path.basename` across POSIX and Windows (#147).
- **Enforce `0o600` permissions on temporary BED files**: Restricts permissions on temporary interval files created during ranged downloads to owner-only read/write on multi-user systems (#147).
- **Promote `dotenv` to production dependencies**: Ensures standalone CLI installations (`npm install --omit=dev`) include `dotenv` for environment loading (#147).
- **Production dependency**: `undici` 8.7.0 → **8.10.2** resolving high-severity advisories GHSA-8xcm-r25x-g524, GHSA-4cwx-7wf7-3272, GHSA-m8rv-5g2x-5cg5, GHSA-jr45-8vmc-qm54, and GHSA-v3r7-h72x-cjcm.

### Performance

- **Invert BAM download sequence**: Downloads the small `.bai` index file before the primary BAM file, protecting against 1-hour presigned S3 URL expiration during long downloads (#148).
- **Skip redundant `samtools index`**: When a valid index file is successfully downloaded from the server, skips redundant local indexing, saving CPU and disk I/O (#148).
- **Batch restoration state writes**: Consolidates multi-file restoration updates into a single read-modify-write helper `appendBatchToAwaitingRestoration`, laying the foundation for eliminating $O(N^2)$ disk I/O (#149).

### Fixed

- **VCF pipeline deadlock on outputStream write errors**: Properly terminates `tabix` and `bgzip` child processes and immediately rejects upon write errors in `rangedDownloadVCF` (#148).
- **Prevent silent whole-genome download in resume**: If a BED file cannot be read during `--resumeArchivedDownloads`, logs an error and requeues the entry rather than silently falling back to a full whole-genome download (#148).
- **Atomic file writes**: Downloads stream to `.part` temporary files before replacing the destination upon completion, preventing corruption of existing files on transfer failure (#148).
- **Bounded stderr buffers**: Capped process stderr accumulation at 64KB to prevent unbounded memory growth on verbose tool output (#148).

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
