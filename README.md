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

## Bounded-Range Reverse Proxy (S3 Egress Guard)

When performing genomic range downloads from remote AWS S3 pre-signed URLs, HTSlib (< 1.25.0, used by `samtools` and `tabix`) issues open-ended HTTP range requests (such as `Range: bytes=0-` or `Range: bytes=8224425-`). Even when client tools read only a few kilobytes before closing their sockets, remote object stores stream full payloads until TCP buffer exhaustion, incurring massive cloud egress data transfer costs (see [LaborBerlin/varvis-download#22](https://github.com/LaborBerlin/varvis-download/issues/22)).

`varvis-download` includes a built-in, in-process bounded-range reverse proxy that transparently clamps open-ended requests to configurable chunk boundaries (default: 2 MiB) and aborts upstream fetches immediately upon client socket termination, achieving > 99.9% cloud egress savings on ranged queries.

### CLI Options

- `--bounded-range-proxy` (default: `true`): Enable the reverse proxy guard for ranged downloads. Pass `--no-bounded-range-proxy` to disable and query upstream URLs directly.
- `--bounded-range-chunk-size <bytes>` (default: `2097152` [2 MiB]): Maximum chunk size in bytes requested upstream per range chunk.

### Automatic Tool Version Guard

Installed tool versions are automatically inspected prior to download execution:

- **`samtools` / `tabix` < 1.25.0**: Proxy is active by default to guard against unbounded egress.
- **`samtools` / `tabix` >= 1.25.0**: Proxy is automatically bypassed because modern HTSlib contains native bounded-range support, unless `--bounded-range-proxy` is explicitly passed.

To benchmark egress savings against a real remote 1000 Genomes S3 dataset (~17.28 GB):

```bash
node scripts/benchmark-bounded-proxy.mjs
```

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
