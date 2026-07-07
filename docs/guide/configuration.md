# Configuration

Learn how to configure Varvis Download CLI for your environment and workflow needs.

## Configuration Methods

The tool supports multiple configuration methods with the following priority order:

1. **Command line arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**
4. **Default values** (lowest priority)

Since v0.32.0 the config file is fully honored: values for `overwrite`,
`filetypes`, `filter`, `latest`, and `unmapped` take effect unless overridden
by an explicit CLI flag (previously these were masked by CLI defaults). When
`overwrite: true` comes from the config file, a warning is logged because it can
replace existing files.

## Configuration File

### Basic Configuration

Create a `.config.json` file in your project directory:

```json
{
  "username": "your_username",
  "target": "mytarget",
  "destination": "./downloads",
  "loglevel": "info",
  "filetypes": ["bam", "bam.bai"],
  "overwrite": false
}
```

### Advanced Configuration

```json
{
  "username": "api_user",
  "target": "mytarget",
  "destination": "./data",
  "filetypes": ["bam", "bam.bai", "vcf.gz", "vcf.gz.tbi"],
  "loglevel": "debug",
  "logfile": "./logs/varvis-download.log",
  "reportfile": "./reports/download-report.json",
  "overwrite": false,
  "restoreArchived": "ask",
  "restorationFile": "./archive-restoration.json",
  "proxy": "http://proxy.company.com:8080",
  "proxyUsername": "proxy_user"
}
```

### Custom Configuration File

Use a custom configuration file location:

```bash
./varvis-download.cjs --config "./configs/production.json" -a 12345
```

## Environment Variables

The tool reads exactly three environment variables. Everything else
(destination, logging, proxy, filetypes, …) is set via CLI flags or the
configuration file.

```bash
export VARVIS_USER="your_username"      # credential: username
export VARVIS_PASSWORD="your_password"  # credential: password
export VARVIS_TARGET="mytarget"         # default target instance
```

### Environment File (.env)

A `.env` file in the working directory is loaded automatically (via `dotenv`),
which is handy for local development. Only the three variables above are read
from it:

```bash
# .env file
VARVIS_USER=your_username
VARVIS_PASSWORD=your_password
VARVIS_TARGET=mytarget
```

::: warning Security Note
Never commit `.env` files containing credentials to version control. Add `.env` to your `.gitignore` file.
:::

## Configuration Schema

### Complete Parameter Reference

| Parameter                 | Type    | Default                     | Description                |
| ------------------------- | ------- | --------------------------- | -------------------------- |
| `username`                | string  | -                           | Varvis API username        |
| `password`                | string  | -                           | Varvis API password        |
| `target`                  | string  | -                           | API target instance        |
| `analysisIds`             | array   | []                          | Analysis IDs to download   |
| `sampleIds`               | array   | []                          | Sample IDs for filtering   |
| `limsIds`                 | array   | []                          | LIMS IDs for filtering     |
| `destination`             | string  | "."                         | Download directory         |
| `filetypes`               | array   | ["bam","bam.bai"]           | File types to download     |
| `overwrite`               | boolean | false                       | Overwrite existing files   |
| `list`                    | boolean | false                       | List files only            |
| `listUrls`                | boolean | false                       | Print download URLs only   |
| `urlFile`                 | string  | -                           | File to save URLs          |
| `filters`                 | array   | []                          | Filter expressions         |
| `latest`                  | boolean | false                       | Newest analysis per sample |
| `range`                   | string  | -                           | Genomic range              |
| `bed`                     | string  | -                           | BED file path              |
| `unmapped`                | boolean | false                       | Extract unmapped reads     |
| `passwordStdin`           | boolean | false                       | Read password from stdin   |
| `restoreArchived`         | string  | "ask"                       | Archive restoration mode   |
| `restorationFile`         | string  | "awaiting-restoration.json" | Restoration tracking       |
| `resumeArchivedDownloads` | boolean | false                       | Resume archived downloads  |
| `loglevel`                | string  | "info"                      | Logging verbosity          |
| `logfile`                 | string  | -                           | Log file path              |
| `reportfile`              | string  | -                           | Report file path           |
| `proxy`                   | string  | -                           | Proxy URL                  |
| `proxyUsername`           | string  | -                           | Proxy username             |
| `proxyPassword`           | string  | -                           | Proxy password             |

### Data Types

**String Arrays**: Comma-separated values in JSON or environment

```json
{
  "filetypes": ["bam", "bam.bai", "vcf.gz"],
  "analysisIds": ["12345", "67890", "11111"]
}
```

**Boolean Values**:

```json
{
  "overwrite": true,
  "list": false
}
```

**Enum Values**:

```json
{
  "loglevel": "debug", // "error", "warn", "info", "debug"
  "restoreArchived": "force" // "ask", "all", "force", "no"
}
```

## Target Configuration

### Supported Targets

| Target     | Description     | URL Pattern                   |
| ---------- | --------------- | ----------------------------- |
| `mytarget` | Named instance  | `https://mytarget.varvis.com` |
| `custom`   | Custom instance | User-defined                  |

### Custom Target Setup

For custom Varvis instances, contact your administrator for:

- Base URL
- Authentication requirements
- Available file types
- API version compatibility

## File Type Configuration

### Standard File Types

```json
{
  "filetypes": [
    "bam", // Binary Alignment Map
    "bam.bai", // BAM index
    "vcf.gz", // Compressed VCF
    "vcf.gz.tbi" // VCF index
  ]
}
```

### Use Case Configurations

**BAM-only workflow:**

```json
{
  "filetypes": ["bam", "bam.bai"]
}
```

**VCF-only workflow:**

```json
{
  "filetypes": ["vcf.gz", "vcf.gz.tbi"]
}
```

**Complete genomics data:**

```json
{
  "filetypes": ["bam", "bam.bai", "vcf.gz", "vcf.gz.tbi"]
}
```

## Logging Configuration

### Log Levels

| Level   | Description         | Use Case                    |
| ------- | ------------------- | --------------------------- |
| `error` | Only errors         | Production monitoring       |
| `warn`  | Warnings + errors   | Standard operation          |
| `info`  | General information | Default level               |
| `debug` | Detailed debugging  | Development/troubleshooting |

### Log File Configuration

```json
{
  "loglevel": "info",
  "logfile": "./logs/varvis-download.log"
}
```

**Log rotation setup:**

```bash
# Create log directory
mkdir -p ./logs

# Use a date-based log file via --logfile
./varvis-download.cjs -t mytarget -a 12345 \
  --logfile "./logs/varvis-$(date +%Y%m%d).log"
```

### Structured Logging

For automated processing, logs include:

- Timestamp
- Log level
- Component
- Message
- Context data

Example log entry:

```
2024-06-23T10:30:45.123Z [INFO] AuthService: Login successful for user: api_user
2024-06-23T10:30:46.456Z [DEBUG] DownloadManager: Starting download: sample_001.bam (1.2GB)
```

## Proxy Configuration

### Basic Proxy Setup

```json
{
  "proxy": "http://proxy.company.com:8080"
}
```

### Authenticated Proxy

```json
{
  "proxy": "http://proxy.company.com:8080",
  "proxyUsername": "proxy_user",
  "proxyPassword": "proxy_pass"
}
```

### HTTPS Proxy

```json
{
  "proxy": "https://secure-proxy.company.com:8443"
}
```

## Archive Configuration

### Restoration Modes

| Mode    | Behavior                | Use Case             |
| ------- | ----------------------- | -------------------- |
| `ask`   | Prompt for each file    | Interactive usage    |
| `all`   | Ask once, apply to all  | Batch processing     |
| `force` | Auto-restore everything | Automated workflows  |
| `no`    | Skip archived files     | Quick downloads only |

### Custom Restoration File

```json
{
  "restoreArchived": "force",
  "restorationFile": "./archive-tracking/restoration-${DATE}.json"
}
```

## Environment-Specific Configurations

### Development Environment

```json
{
  "target": "mytarget",
  "loglevel": "debug",
  "logfile": "./logs/dev.log",
  "destination": "./dev-downloads",
  "overwrite": true
}
```

### Production Environment

```json
{
  "target": "mytarget",
  "loglevel": "warn",
  "logfile": "/var/log/varvis-download/production.log",
  "destination": "/data/genomics",
  "reportfile": "/data/reports/download-report.json",
  "overwrite": false,
  "restoreArchived": "force"
}
```

### CI/CD Environment

```json
{
  "target": "mytarget",
  "loglevel": "info",
  "destination": "./ci-downloads",
  "reportfile": "./ci-report.json",
  "overwrite": true,
  "restoreArchived": "no"
}
```

## Configuration Validation

### Validate Configuration

```bash
# Test configuration without downloading
./varvis-download.cjs --config ./my-config.json --list -a 12345
```

### Common Validation Errors

1. **Missing required fields**

   ```
   Error: Missing required argument --target
   ```

2. **Invalid file types**

   ```
   Error: Unsupported file type: invalid_type
   ```

3. **Invalid log level**

   ```
   Error: Invalid log level: invalid_level
   ```

4. **Path issues**
   ```
   Error: Destination directory does not exist: /invalid/path
   ```

## Configuration Best Practices

### Security

- Use environment variables for credentials
- Set restrictive file permissions: `chmod 600 .config.json`
- Regularly rotate API credentials
- Use `.env` files for local development only

### Organization

- Create environment-specific configurations
- Use descriptive file names: `production.config.json`
- Document custom configurations
- Version control configuration templates (without credentials)

### Performance

- Set appropriate log levels for environment
- Use specific file type filters to avoid unnecessary transfers
- Monitor disk space in destination directories

### Maintenance

- Regular configuration validation
- Backup configuration files
- Document configuration changes
- Test configurations before deployment

## Troubleshooting Configuration

### Debug Configuration Loading

```bash
./varvis-download.cjs --loglevel debug --config ./my-config.json -a 12345
```

### Common Issues

**Configuration file not found:**

```bash
# Check file path
ls -la .config.json

# Use absolute path
./varvis-download.cjs --config "$(pwd)/configs/my-config.json"
```

**JSON syntax errors:**

```bash
# Validate JSON syntax
node -e "console.log(JSON.parse(require('fs').readFileSync('.config.json', 'utf8')))"
```

**Environment variable conflicts:**

```bash
# Show all VARVIS environment variables
env | grep VARVIS
```

### Configuration Precedence Testing

```bash
# Test with all sources
export VARVIS_USER="env_user"
echo '{"username": "config_user"}' > test.config.json
./varvis-download.cjs --config test.config.json --username "cli_user" --list

# Result: CLI argument "cli_user" takes precedence
```

## Next Steps

- **[Authentication](/guide/authentication)** - Set up secure access
- **[File Downloads](/guide/downloads)** - Configure download behavior
- **[Advanced Features](/guide/archive-management)** - Archive and proxy setup
