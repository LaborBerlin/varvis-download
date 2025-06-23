# API Reference

Complete reference documentation for the Varvis Download CLI tool.

## Overview

The Varvis Download CLI provides a command-line interface for downloading bioinformatics files from Varvis API instances. This reference covers all available commands, parameters, configuration options, and core functions.

## Quick Reference

### Essential Commands

```bash
# Basic download
./varvis-download.js -t <target> -a <analysisIds>

# List files
./varvis-download.js -t <target> -a <analysisIds> --list

# Range download
./varvis-download.js -t <target> -a <analysisIds> -g "chr1:1000-2000"

# Show help
./varvis-download.js --help

# Show version
./varvis-download.js --version
```

### Key Concepts

- **Target**: Varvis API instance identifier (e.g., `laborberlin`, `uni-leipzig`)
- **Analysis ID**: Unique identifier for a genomic analysis
- **File Types**: Supported formats include BAM, BAI, VCF, and VCF.GZ
- **Filters**: Expressions to select specific files based on metadata
- **Ranges**: Genomic coordinates for targeted downloads

## Command Categories

### Core Operations

- [CLI Commands](/api/cli) - All command-line parameters and options
- [Configuration](/api/config) - Configuration file schema and environment variables

### Programming Interface

- [Core Functions](/api/functions) - Internal API functions and their usage
- [Filter Expressions](/api/filters) - Syntax for advanced filtering
- [Archive Operations](/api/archive) - Archive restoration and management

## Parameter Summary

### Required Parameters

| Parameter  | Short | Description         | Example       |
| ---------- | ----- | ------------------- | ------------- |
| `--target` | `-t`  | API target instance | `laborberlin` |

**Plus at least one of:**

- `--analysisIds` (`-a`) - Analysis IDs (comma-separated)
- `--sampleIds` (`-s`) - Sample IDs for filtering
- `--limsIds` (`-l`) - LIMS IDs for filtering

### Authentication

| Parameter           | Environment       | Description             |
| ------------------- | ----------------- | ----------------------- |
| `--username` (`-u`) | `VARVIS_USER`     | Varvis username         |
| `--password` (`-p`) | `VARVIS_PASSWORD` | Varvis password         |
| `--config` (`-c`)   | -                 | Configuration file path |

### File Operations

| Parameter              | Default       | Description              |
| ---------------------- | ------------- | ------------------------ |
| `--destination` (`-d`) | `.`           | Download directory       |
| `--filetypes` (`-f`)   | `bam,bam.bai` | File types to download   |
| `--overwrite` (`-o`)   | `false`       | Overwrite existing files |
| `--list` (`-L`)        | `false`       | List files only          |

### Filtering & Ranges

| Parameter         | Description        | Example              |
| ----------------- | ------------------ | -------------------- |
| `--filter` (`-F`) | Filter expressions | `"analysisType=SNV"` |
| `--range` (`-g`)  | Genomic range      | `"chr1:1-100000"`    |
| `--bed` (`-b`)    | BED file path      | `regions.bed`        |

### Archive Management

| Parameter                            | Default                     | Description               |
| ------------------------------------ | --------------------------- | ------------------------- |
| `--restoreArchived` (`-ra`)          | `ask`                       | Archive restoration mode  |
| `--restorationFile` (`-rf`)          | `awaiting-restoration.json` | Restoration tracking file |
| `--resumeArchivedDownloads` (`-rad`) | `false`                     | Resume archived downloads |

### Logging & Output

| Parameter             | Default | Description          |
| --------------------- | ------- | -------------------- |
| `--loglevel` (`--ll`) | `info`  | Logging level        |
| `--logfile` (`--lf`)  | -       | Log file path        |
| `--reportfile` (`-r`) | -       | Download report path |

### Network Configuration

| Parameter                   | Description    |
| --------------------------- | -------------- |
| `--proxy` (`-x`)            | Proxy URL      |
| `--proxyUsername` (`--pxu`) | Proxy username |
| `--proxyPassword` (`--pxp`) | Proxy password |

## Exit Codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | Success                                       |
| `1`  | General error (authentication, network, etc.) |
| `2`  | Invalid arguments or configuration            |

## File Types

### Supported Formats

| Extension     | Description                    | Index File    |
| ------------- | ------------------------------ | ------------- |
| `.bam`        | Binary Alignment Map           | `.bam.bai`    |
| `.bam.bai`    | BAM index                      | -             |
| `.vcf.gz`     | Compressed Variant Call Format | `.vcf.gz.tbi` |
| `.vcf.gz.tbi` | VCF index                      | -             |

### Automatic Indexing

When downloading primary data files (BAM, VCF.GZ), the tool automatically:

- Downloads associated index files
- Creates new indexes for range-downloaded files
- Validates index integrity

## Error Handling

### Common Error Types

1. **Authentication Errors**
   - Invalid credentials
   - Token expiration
   - Permission denied

2. **Network Errors**
   - Connection timeout
   - Proxy configuration issues
   - DNS resolution failures

3. **File System Errors**
   - Insufficient disk space
   - Permission denied
   - Path not found

4. **API Errors**
   - Invalid analysis IDs
   - Archive file not ready
   - Rate limiting

### Retry Logic

The tool implements automatic retry with exponential backoff for:

- Network timeouts (3 retries)
- Server errors (5xx status codes)
- Rate limiting (429 status)

## Performance

### Optimization Features

- **Concurrent Downloads**: Multiple files downloaded in parallel
- **Resume Support**: Interrupted downloads can be resumed
- **Progress Tracking**: Real-time download progress display
- **Memory Efficiency**: Streaming downloads for large files

### Limits

- **Maximum Concurrent Downloads**: 5 (configurable)
- **Request Timeout**: 120 seconds (configurable)
- **Retry Attempts**: 3 (configurable)

## Security

### Credential Handling

1. **Environment Variables** (most secure)
2. **Interactive Prompts** (hidden input)
3. **Configuration Files** (stored locally)
4. **Command Line** (least secure, visible in process list)

### Best Practices

- Use environment variables for automated scripts
- Set restrictive file permissions on configuration files
- Regularly rotate API credentials
- Use HTTPS proxies when required

## Integration

### CI/CD Pipeline Usage

```bash
# Set credentials in pipeline secrets
export VARVIS_USER="${SECRET_VARVIS_USER}"
export VARVIS_PASSWORD="${SECRET_VARVIS_PASSWORD}"

# Download with error handling
./varvis-download.js -t laborberlin -a "$ANALYSIS_IDS" || exit 1
```

### Programmatic Usage

The tool can be imported as a Node.js module:

```javascript
const { AuthService, downloadFile } = require('./varvis-download.js');
```

## Examples

See the [Examples](/examples/) section for practical usage patterns and real-world scenarios.

## Support

- **GitHub Issues**: https://github.com/LaborBerlin/varvis-download/issues
- **Documentation**: https://laborberlin.github.io/varvis-download/
- **License**: GPL-3.0
