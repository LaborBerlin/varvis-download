# CLI Commands

Complete command-line reference for Varvis Download CLI.

## Synopsis

```bash
varvis-download [OPTIONS] COMMAND [ARGS...]
```

## Global Options

### Required Parameters

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--target` | `-t` | API target instance | `laborberlin` |

**At least one of the following is required:**

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--analysisIds` | `-a` | Analysis IDs (comma-separated) | `12345,67890` |
| `--sampleIds` | `-s` | Sample IDs for filtering | `LB24-001,LB24-002` |
| `--limsIds` | `-l` | LIMS IDs for filtering | `LIMS_123,LIMS_456` |

### Authentication Options

| Option | Short | Environment Variable | Description |
|--------|-------|---------------------|-------------|
| `--username` | `-u` | `VARVIS_USER` | Varvis API username |
| `--password` | `-p` | `VARVIS_PASSWORD` | Varvis API password |
| `--config` | `-c` | - | Configuration file path |

### File & Output Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--destination` | `-d` | `.` | Download destination folder |
| `--filetypes` | `-f` | `bam,bam.bai` | File types (comma-separated) |
| `--overwrite` | `-o` | `false` | Overwrite existing files |
| `--list` | `-L` | `false` | List files without downloading |

### Filtering & Range Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--filter` | `-F` | Filter expressions | `"analysisType=SNV"` |
| `--range` | `-g` | Genomic range | `"chr1:1-100000"` |
| `--bed` | `-b` | BED file with regions | `regions.bed` |

### Archive Management

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--restoreArchived` | `-ra` | `ask` | Archive mode: `ask|all|force|no` |
| `--restorationFile` | `-rf` | `awaiting-restoration.json` | Restoration tracking file |
| `--resumeArchivedDownloads` | `-rad` | `false` | Resume archived downloads |

### Logging & Reports

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--loglevel` | `--ll` | `info` | Log level: `debug|info|warn|error` |
| `--logfile` | `--lf` | - | Path to log file |
| `--reportfile` | `-r` | - | Path to download report |

### Proxy Configuration

| Option | Short | Description |
|--------|-------|-------------|
| `--proxy` | `-x` | Proxy URL |
| `--proxyUsername` | `--pxu` | Proxy username |
| `--proxyPassword` | `--pxp` | Proxy password |

### Utility Options

| Option | Short | Description |
|--------|-------|-------------|
| `--version` | `-v` | Show version information |
| `--help` | `-h` | Show help message |

## Usage Examples

### Basic Downloads

```bash
# Download BAM files for specific analysis
varvis-download -t laborberlin -a 12345

# Download multiple analyses
varvis-download -t laborberlin -a "12345,67890,11111"

# Download specific file types
varvis-download -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"
```

### Authentication

```bash
# Using environment variables (recommended)
export VARVIS_USER="username"
export VARVIS_PASSWORD="password"
varvis-download -t laborberlin -a 12345

# Using command line arguments
varvis-download -t laborberlin -u username -p password -a 12345

# Using configuration file
varvis-download --config production.json -a 12345
```

### Filtering

```bash
# Filter by analysis type
varvis-download -t laborberlin -s "LB24-001" -F "analysisType=SNV"

# Multiple filters
varvis-download -t laborberlin -s "LB24-001" \
  -F "analysisType=SNV" \
  -F "quality>=95"

# Sample ID filtering
varvis-download -t laborberlin -F "sampleId>=LB24-0100"
```

### Range Downloads

```bash
# Single genomic range
varvis-download -t laborberlin -a 12345 -g "chr1:1000000-2000000"

# Multiple ranges
varvis-download -t laborberlin -a 12345 \
  -g "chr1:1000000-2000000 chr2:500000-1500000"

# BED file regions
varvis-download -t laborberlin -a 12345 -b target_regions.bed
```

### Archive Management

```bash
# Force restore all archived files
varvis-download -t laborberlin -a 12345 --restoreArchived force

# Skip archived files
varvis-download -t laborberlin -a 12345 --restoreArchived no

# Resume archived downloads
varvis-download --resumeArchivedDownloads
```

### Logging and Reports

```bash
# Enable debug logging
varvis-download -t laborberlin -a 12345 --loglevel debug

# Save logs to file
varvis-download -t laborberlin -a 12345 --logfile download.log

# Generate download report
varvis-download -t laborberlin -a 12345 --reportfile report.json
```

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error (authentication, network, file system) |
| `2` | Invalid arguments or configuration |

## Configuration Files

### Basic Configuration

```json
{
  "username": "your_username",
  "target": "laborberlin", 
  "destination": "./downloads",
  "filetypes": ["bam", "bam.bai"],
  "loglevel": "info"
}
```

### Advanced Configuration

```json
{
  "username": "api_user",
  "target": "laborberlin",
  "destination": "./data",
  "filetypes": ["bam", "bam.bai", "vcf.gz", "vcf.gz.tbi"],
  "loglevel": "debug",
  "logfile": "./logs/varvis.log",
  "reportfile": "./reports/download.json",
  "overwrite": false,
  "restoreArchived": "ask",
  "proxy": "http://proxy.company.com:8080"
}
```

## Environment Variables

All command-line options can be set via environment variables using the `VARVIS_` prefix:

| Environment Variable | CLI Option |
|---------------------|-----------|
| `VARVIS_USER` | `--username` |
| `VARVIS_PASSWORD` | `--password` |
| `VARVIS_TARGET` | `--target` |
| `VARVIS_DESTINATION` | `--destination` |
| `VARVIS_LOG_LEVEL` | `--loglevel` |
| `VARVIS_PROXY` | `--proxy` |
