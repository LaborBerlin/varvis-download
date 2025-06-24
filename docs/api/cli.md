# CLI Reference

This document provides a comprehensive reference for all command-line options available in the Varvis Download CLI.

## Usage

```bash
varvis-download [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--config, c` | `string` | `.config.json` | Path to the configuration file |
| `--username, u` | `string` | - | Varvis API username |
| `--password, p` | `string` | - | Varvis API password |
| `--target, t` | `string` | - | Target for the Varvis API |
| `--analysisIds, a` | `string` | - | Analysis IDs to download files for (comma-separated) |
| `--sampleIds, s` | `string` | - | Sample IDs to filter analyses (comma-separated) |
| `--limsIds, l` | `string` | - | LIMS IDs to filter analyses (comma-separated) |
| `--list, L` | `boolean` | `false` | List available files for the specified analysis IDs |
| `--destination, d` | `string` | `.` | Destination folder for the downloaded files |
| `--proxy, x` | `string` | - | Proxy URL |
| `--proxyUsername, pxu` | `string` | - | Proxy username |
| `--proxyPassword, pxp` | `string` | - | Proxy password |
| `--overwrite, o` | `boolean` | `false` | Overwrite existing files |
| `--filetypes, f` | `string` | `bam,bam.bai` | File types to download (comma-separated) |
| `--loglevel, ll` | `string` | `info` | Logging level (info, warn, error, debug) |
| `--logfile, lf` | `string` | - | Path to the log file |
| `--reportfile, r` | `string` | - | Path to the report file |
| `--filter, F` | `array` | `[]` | Filter expressions (e.g., "analysisType=SNV", "sampleId>LB24-0001") |
| `--range, g` | `string` | - | Genomic range for ranged download (e.g., chr1:1-100000) |
| `--bed, b` | `string` | - | Path to BED file containing multiple regions |
| `--restoreArchived, ra` | `string` | `ask` | Restore archived files. Accepts "no", "ask" (default), "all", or "force". |
| `--restorationFile, rf` | `string` | `awaiting-restoration.json` | Path and name for the awaiting-restoration JSON file |
| `--resumeArchivedDownloads, rad` | `boolean` | `false` | Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed. |
| `--list-urls, U` | `boolean` | `false` | List the direct download URLs for the selected files instead of downloading them. Useful for piping to other tools. |
| `--url-file` | `string` | - | Path to a file to save the download URLs when using --list-urls. |
| `--version, v` | `boolean` | `false` | Show version information |
| `--help, h` | `boolean` | `false` | Show help |

## Examples

### Basic Usage

```bash
# Download BAM files for specific analysis IDs
varvis-download -u username -p password -t target -a "analysis1,analysis2"

# List available files without downloading
varvis-download -u username -p password -t target -a "analysis1" --list

# Download with custom destination
varvis-download -u username -p password -t target -a "analysis1" -d "/path/to/download"
```

### Advanced Usage

```bash
# Download with filters
varvis-download -u username -p password -t target -s "sample1,sample2" --filter "analysisType=SNV"

# Ranged download for specific genomic region
varvis-download -u username -p password -t target -a "analysis1" --range "chr1:1-100000"

# Download with BED file for multiple regions
varvis-download -u username -p password -t target -a "analysis1" --bed "/path/to/regions.bed"

# Resume archived downloads
varvis-download --resumeArchivedDownloads

# List download URLs instead of downloading
varvis-download -u username -p password -t target -a "analysis1" --list-urls

# Save URLs to a file for later use
varvis-download -u username -p password -t target -a "analysis1" --list-urls --url-file urls.txt

# Pipe URLs to wget for parallel downloading
varvis-download -u username -p password -t target -a "analysis1" --list-urls | wget -i -

# Use with aria2c for accelerated downloads
varvis-download -u username -p password -t target -a "analysis1" --list-urls | aria2c -i -
```

### Configuration File

You can use a configuration file to store commonly used options:

```bash
varvis-download --config /path/to/config.json
```

Example configuration file:

```json
{
  "username": "your-username",
  "target": "https://your-varvis-instance.com",
  "destination": "/path/to/downloads",
  "filetypes": "bam,bam.bai,vcf",
  "loglevel": "info"
}
```
