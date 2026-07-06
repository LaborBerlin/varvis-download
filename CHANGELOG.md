# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Credential precedence now follows the CLI convention** (`CLI flag > environment variable > config file`). Previously an exported `VARVIS_USER` / `VARVIS_PASSWORD` overrode even an explicit `--username` / `--password`; now the explicit flag wins. Unset flags still fall back to the environment variable, then the config file.
- **Config-file values for `overwrite`, `filetypes`, `filter`, `latest`, and `unmapped` are now honored** (previously masked by CLI parser defaults). When `overwrite: true` comes from the config file, a warning is logged since it can replace existing files.

### Added

- **`VARVIS_TARGET` environment variable** as a new source for `--target`, resolved at `CLI flag > VARVIS_TARGET > config file`.
