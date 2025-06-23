# Configuration Schema

Complete reference for configuration files and environment variables.

## Configuration File Format

Configuration files use JSON format with the following schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "username": {
      "type": "string",
      "description": "Varvis API username"
    },
    "password": {
      "type": "string", 
      "description": "Varvis API password (not recommended for config files)"
    },
    "target": {
      "type": "string",
      "description": "API target instance",
      "enum": ["laborberlin", "uni-leipzig"]
    },
    "analysisIds": {
      "type": "array",
      "items": {"type": "string"},
      "description": "List of analysis IDs to download"
    },
    "sampleIds": {
      "type": "array", 
      "items": {"type": "string"},
      "description": "List of sample IDs for filtering"
    },
    "limsIds": {
      "type": "array",
      "items": {"type": "string"}, 
      "description": "List of LIMS IDs for filtering"
    },
    "destination": {
      "type": "string",
      "default": ".",
      "description": "Download destination directory"
    },
    "filetypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["bam", "bam.bai", "vcf.gz", "vcf.gz.tbi"]
      },
      "default": ["bam", "bam.bai"],
      "description": "File types to download"
    },
    "overwrite": {
      "type": "boolean", 
      "default": false,
      "description": "Whether to overwrite existing files"
    },
    "list": {
      "type": "boolean",
      "default": false, 
      "description": "List files without downloading"
    },
    "filters": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Filter expressions for file selection"
    },
    "range": {
      "type": "string",
      "description": "Genomic range for range downloads"
    },
    "bed": {
      "type": "string",
      "description": "Path to BED file containing regions"
    },
    "restoreArchived": {
      "type": "string",
      "enum": ["ask", "all", "force", "no"],
      "default": "ask",
      "description": "Archive restoration behavior"
    },
    "restorationFile": {
      "type": "string",
      "default": "awaiting-restoration.json",
      "description": "Path to restoration tracking file"
    },
    "resumeArchivedDownloads": {
      "type": "boolean",
      "default": false,
      "description": "Resume archived downloads"
    },
    "loglevel": {
      "type": "string",
      "enum": ["error", "warn", "info", "debug"],
      "default": "info",
      "description": "Logging verbosity level"
    },
    "logfile": {
      "type": "string",
      "description": "Path to log file"
    },
    "reportfile": {
      "type": "string", 
      "description": "Path to download report file"
    },
    "proxy": {
      "type": "string",
      "description": "Proxy server URL"
    },
    "proxyUsername": {
      "type": "string",
      "description": "Proxy authentication username"
    },
    "proxyPassword": {
      "type": "string",
      "description": "Proxy authentication password"
    }
  }
}
```

## Environment Variables

All configuration options can be overridden using environment variables:

### Authentication

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| `VARVIS_USER` | `username` | API username |
| `VARVIS_PASSWORD` | `password` | API password |

### Connection

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| `VARVIS_TARGET` | `target` | API target instance |
| `VARVIS_PROXY` | `proxy` | Proxy URL |
| `VARVIS_PROXY_USER` | `proxyUsername` | Proxy username |
| `VARVIS_PROXY_PASS` | `proxyPassword` | Proxy password |

### File Operations

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| `VARVIS_DESTINATION` | `destination` | Download directory |
| `VARVIS_FILETYPES` | `filetypes` | File types (comma-separated) |
| `VARVIS_OVERWRITE` | `overwrite` | Overwrite existing files |

### Logging

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| `VARVIS_LOG_LEVEL` | `loglevel` | Logging level |
| `VARVIS_LOG_FILE` | `logfile` | Log file path |

### Archive Management

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| `VARVIS_RESTORE_ARCHIVED` | `restoreArchived` | Archive restoration mode |
| `VARVIS_RESTORATION_FILE` | `restorationFile` | Restoration tracking file |

## Configuration Examples

### Development Environment

```json
{
  "target": "laborberlin",
  "username": "dev_user",
  "destination": "./dev-downloads",
  "loglevel": "debug",
  "logfile": "./logs/dev.log",
  "overwrite": true,
  "restoreArchived": "no"
}
```

### Production Environment

```json
{
  "target": "laborberlin", 
  "username": "prod_user",
  "destination": "/data/genomics",
  "loglevel": "warn",
  "logfile": "/var/log/varvis-download/production.log",
  "reportfile": "/data/reports/download-report.json",
  "overwrite": false,
  "restoreArchived": "force",
  "filetypes": ["bam", "bam.bai", "vcf.gz", "vcf.gz.tbi"]
}
```

### CI/CD Environment

```json
{
  "target": "laborberlin",
  "destination": "./ci-downloads", 
  "loglevel": "info",
  "reportfile": "./ci-report.json",
  "overwrite": true,
  "restoreArchived": "no",
  "filetypes": ["bam", "bam.bai"]
}
```

## Configuration Validation

The tool validates configuration files and environment variables on startup:

### Required Fields

- `target` - Must be a valid API target
- At least one of: `analysisIds`, `sampleIds`, `limsIds` (unless using `resumeArchivedDownloads`)

### Field Validation

- **File Types**: Must be valid genomic file extensions
- **Log Level**: Must be one of: `error`, `warn`, `info`, `debug`
- **Archive Mode**: Must be one of: `ask`, `all`, `force`, `no`
- **Paths**: Must be valid filesystem paths
- **URLs**: Proxy URLs must be valid HTTP/HTTPS URLs

### Common Validation Errors

```bash
# Missing required field
Error: Missing required argument --target

# Invalid file type
Error: Unsupported file type: invalid_type

# Invalid log level  
Error: Invalid log level: invalid_level

# Invalid directory
Error: Destination directory does not exist: /invalid/path
```

## Configuration Precedence

Configuration values are resolved in the following order (highest to lowest priority):

1. **Command line arguments**
2. **Environment variables**
3. **Configuration file**
4. **Default values**

### Example Precedence

```bash
# Environment variable
export VARVIS_USER="env_user"

# Configuration file contains: {"username": "config_user"}

# Command line overrides both
varvis-download --config config.json --username "cli_user"
# Result: Uses "cli_user"
```

## Security Considerations

### Credential Storage

1. **Environment Variables** (Most Secure)
   - Not stored in files
   - Process-specific
   - Easy to rotate

2. **Interactive Prompts** (Secure)
   - Hidden input
   - Not logged
   - Session-specific

3. **Configuration Files** (Less Secure)
   - Stored on disk
   - Requires file permissions
   - Version control risks

4. **Command Line** (Least Secure)
   - Visible in process list
   - Logged in shell history
   - Use only for testing

### File Permissions

```bash
# Secure configuration file permissions
chmod 600 .config.json

# Verify permissions
ls -la .config.json
# Should show: -rw------- (owner read/write only)
```

### Environment File Security

```bash
# Create secure .env file
cat > .env << 'EOF'
VARVIS_USER=your_username
VARVIS_PASSWORD=your_password
EOF

# Secure permissions
chmod 600 .env

# Add to .gitignore
echo ".env" >> .gitignore
```
