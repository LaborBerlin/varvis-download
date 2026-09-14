# Varvis Download CLI

[![CI](https://github.com/LaborBerlin/varvis-download/actions/workflows/test.yml/badge.svg)](https://github.com/LaborBerlin/varvis-download/actions/workflows/test.yml)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-2ea44f)](https://laborberlin.github.io/varvis-download/)
[![Code Quality](https://github.com/LaborBerlin/varvis-download/actions/workflows/codequality.yaml/badge.svg)](https://github.com/LaborBerlin/varvis-download/actions/workflows/codequality.yaml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.22.2-brightgreen.svg)](https://nodejs.org/)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![TypeScript](https://img.shields.io/badge/TypeScript-type--checked-3178C6.svg)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/ESLint-9.x-4B32C3.svg)](https://eslint.org/)

<p align="center">
<img alt="varvis logo" src="assets/varvis_name.svg" style="width:18%; height:auto;">
</p>

## Summary

The `varvis-download` package provides an independently developed free software command-line interface (CLI) for
downloading BAM, BAI, and VCF files from the varvis® API. It supports authentication, session management, file filtering,
proxy configuration, archived file restoration, genomic range downloads, and reporting for bioinformatics workflow
automation.

## Non-interactive / CI usage

For scripted or automated runs (CI pipelines, cron jobs, containers), avoid the interactive password prompt and archive-restoration prompt:

- **Password**: pass `--password-stdin` to read the password from the first line of stdin (mirrors `docker login --password-stdin`), or set the `VARVIS_PASSWORD` environment variable. Credentials resolve at `CLI flag > environment variable > config file` precedence — an explicit `--username`/`--password`/`--target` always wins over `VARVIS_USER`/`VARVIS_PASSWORD`/`VARVIS_TARGET`, which in turn win over the config file.
- **Archive restoration**: on a non-interactive run the default `ask` mode cannot prompt, so it is automatically downgraded to `no` — archived files are skipped (with a warning) and non-archived files still download. To restore archived files in automation, pass `--restoreArchived force`; to silence the warning, pass `--restoreArchived no`. Only an **explicit** `--restoreArchived ask` or `--restoreArchived all` fails fast on a non-TTY, since those deliberately request a prompt the environment cannot provide.

Example:

```bash
echo "$VARVIS_PASSWORD" | node varvis-download.cjs \
  --username "$VARVIS_USER" --password-stdin --target "$VARVIS_TARGET" \
  --analysisIds AN00001 --restoreArchived force
```

## Bounded range proxy

Ranged BAM, VCF and unmapped BAM downloads use a local HTTP proxy by default. It fetches the remote file in requests of at most 2 MiB while presenting the complete requested response to samtools or tabix. Reads can continue across any number of chunks; closing the tool's connection cancels the active upstream request.

- `--no-bounded-range-proxy` connects tools directly to the remote URL.
- `--bounded-range-chunk-size <bytes>` sets the maximum upstream request size: an integer from 65536 (64 KiB) to 67108864 (64 MiB), default 2097152 (2 MiB).
- Config files accept `boundedRangeProxy` and `boundedRangeChunkSize`. Archive restoration saves these settings. Explicit settings in the current CLI/config override saved settings; saved settings otherwise override defaults.

There is no automatic bypass based on a guessed future tool version. The proxy validates upstream range responses and cancels failed transfers. Servers that ignore Range requests, return changed objects, lack a strong ETag for multiple requests, or cannot complete a requested chunk cause a download error. The CLI exits nonzero for failed downloads.

Each upstream request is bounded; the total bytes for a query depend on the records and seeks it needs. Proxy body-byte counters do not measure provider billing or direct-download network traffic. No fixed percentage of egress savings is claimed.

To compare a populated region using real tools, provide a BAM/VCF URL and its independently signed index URL through the environment:

```bash
export BENCHMARK_URL='https://example.org/sample.bam'
export BENCHMARK_INDEX_URL='https://example.org/sample.bam.bai'
export BENCHMARK_TYPE=bam
export BENCHMARK_REGION='1:10384971-10385971'
node scripts/benchmark-bounded-proxy.mjs
```

The benchmark runs samtools (BAM) or tabix (VCF) directly and through the proxy, compares SHA-256 hashes of decoded records, and reports timings and observed proxy body bytes. It fails on network/tool errors, empty control regions or mismatched records. `BENCHMARK_CHUNK_SIZE` optionally changes the chunk size. It never substitutes simulated results for failed measurements.

## Intended Use

This software is provided solely for research, educational, development, interoperability, and bioinformatics workflow
automation purposes. See the full [Intended Use documentation](https://laborberlin.github.io/varvis-download/guide/intended-use)
for regulatory boundaries and user responsibilities.

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3). See the [LICENSE](LICENSE) file for details.

## Documentation

The full documentation is available at
[laborberlin.github.io/varvis-download/](https://laborberlin.github.io/varvis-download/).

It covers:

- Requirements and installation
- Configuration and environment variables
- CLI usage, filtering, archive handling, and range downloads
- API reference and development workflow
- Intended use and disclaimer

## Disclaimer

The varvis® logo is a registered trademark of Limbus Medical Technologies GmbH and is used in this project with
permission. This project is independent and is not affiliated with, endorsed by, or officially supported by Limbus
Medical Technologies GmbH.
