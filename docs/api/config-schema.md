# Configuration Schema

This document describes the configuration file schema for the Varvis Download CLI.

## Overview

The configuration file is a JSON file that can contain any of the CLI options to avoid having to specify them on the command line each time. Command line arguments take precedence over configuration file values.

## Default Configuration File

By default, the tool looks for a configuration file named `.config.json` in the current directory. You can specify a different configuration file using the `--config` option.

## Schema

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `username` | `string` | No | - | Varvis API username |
| `password` | `string` | No | - | Varvis API password |
| `target` | `string` | No | - | Target for the Varvis API (can be full URL or alias) |
| `destination` | `string` | No | `.` | Destination folder for downloaded files |
| `proxy` | `string` | No | - | Proxy URL for HTTP requests |
| `proxyUsername` | `string` | No | - | Username for proxy authentication |
| `proxyPassword` | `string` | No | - | Password for proxy authentication |
| `overwrite` | `boolean` | No | `false` | Whether to overwrite existing files |
| `filetypes` | `string` | No | `bam,bam.bai` | Comma-separated list of file types to download |
| `loglevel` | `string` | No | `info` | Logging level (info, warn, error, debug) |
| `logfile` | `string` | No | - | Path to the log file |
| `reportfile` | `string` | No | - | Path to the report file |
| `restoreArchived` | `string` | No | `ask` | Restore archived files behavior ("no", "ask", "all", "force") |
| `restorationFile` | `string` | No | `awaiting-restoration.json` | Path for the restoration tracking file |

## Example Configuration Files

### Basic Configuration

```json
{
  "username": "your-username",
  "target": "https://your-varvis-instance.com",
  "destination": "/path/to/downloads"
}
```

### Advanced Configuration

```json
{
  "username": "your-username",
  "target": "production-server",
  "destination": "/data/downloads",
  "proxy": "http://proxy.company.com:8080",
  "proxyUsername": "proxy-user",
  "filetypes": "bam,bam.bai,vcf,vcf.gz.tbi",
  "overwrite": false,
  "loglevel": "debug",
  "logfile": "/var/log/varvis-download.log",
  "restoreArchived": "ask"
}
```

### Minimal Configuration

```json
{
  "username": "your-username",
  "target": "https://varvis.example.com"
}
```

## File Types

The `filetypes` property accepts a comma-separated list of file extensions. Common values include:

- `bam` - Binary Alignment Map files
- `bam.bai` - BAM index files
- `vcf` - Variant Call Format files
- `vcf.gz` - Compressed VCF files
- `vcf.gz.tbi` - Tabix index files for compressed VCF
- `bed` - Browser Extensible Data files

## Target Specification

The `target` property can be specified as:

- A full URL: `https://varvis.example.com`
- An alias that will be resolved by the application

## Logging Levels

Available logging levels (from most to least verbose):

- `debug` - Detailed debugging information
- `info` - General information (default)
- `warn` - Warning messages only
- `error` - Error messages only

## Archive Restoration Modes

The `restoreArchived` property controls how archived files are handled:

- `no` - Skip archived files entirely
- `ask` - Prompt for each archived file (default)
- `all` - Ask once, then restore all archived files
- `force` - Automatically restore all archived files without prompting
