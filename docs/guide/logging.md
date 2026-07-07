# Logging & Reports

The Varvis Download CLI provides comprehensive logging and reporting capabilities to help you monitor operations, debug issues, and maintain audit trails.

## Overview

Logging and reporting features include:

- Multiple log levels for different verbosity
- File-based and console logging
- A plain-text end-of-run summary report
- Download statistics and metrics
- Error tracking and debugging
- Audit trail generation

## Log Levels

### Available Log Levels

| Level   | Description                    | Use Case              |
| ------- | ------------------------------ | --------------------- |
| `error` | Only error messages            | Production monitoring |
| `warn`  | Warnings and errors            | Standard production   |
| `info`  | General information (default)  | Normal operations     |
| `debug` | Detailed debugging information | Troubleshooting       |

### Setting Log Level

```bash
# Command line
./varvis-download.cjs -t mytarget -a 12345 --loglevel debug

# Configuration file (.config.json)
{
  "loglevel": "debug",
  "target": "mytarget"
}
```

## Console Logging

### Default Console Output

```bash
# Standard info level output
./varvis-download.cjs -t mytarget -a 12345

# Example output:
[2024-06-23 10:30:15] INFO: Starting download for analysis 12345
[2024-06-23 10:30:16] INFO: Found 4 files to download
[2024-06-23 10:30:16] INFO: Downloading sample_001.bam (1.2 GB)
[2024-06-23 10:30:45] INFO: Download completed: sample_001.bam
[2024-06-23 10:30:45] INFO: All downloads completed successfully
```

### Debug Output

```bash
./varvis-download.cjs -t mytarget -a 12345 --loglevel debug

# Example debug output:
[2024-06-23 10:30:15] DEBUG: Authenticating with Varvis API
[2024-06-23 10:30:15] DEBUG: HTTP request: GET /api/analyses/12345
[2024-06-23 10:30:15] DEBUG: Response status: 200
[2024-06-23 10:30:15] DEBUG: Found files: [sample_001.bam, sample_001.bam.bai, ...]
[2024-06-23 10:30:16] DEBUG: Starting download: sample_001.bam
[2024-06-23 10:30:16] DEBUG: Download URL: https://api.varvis.com/files/...
[2024-06-23 10:30:16] DEBUG: Creating HTTP agent with timeout: 120s
```

## File Logging

### Basic File Logging

```bash
# Log to file
./varvis-download.cjs -t mytarget -a 12345 --logfile "download.log"

# Log with timestamp in filename
./varvis-download.cjs -t mytarget -a 12345 \
  --logfile "download_$(date +%Y%m%d_%H%M%S).log"
```

### Structured Log Files

Log files contain structured information:

```
[2024-06-23 10:30:15] INFO: [AUTH] Authentication successful for user: api_user
[2024-06-23 10:30:15] INFO: [API] Fetching analysis data for ID: 12345
[2024-06-23 10:30:16] INFO: [DOWNLOAD] Starting download: sample_001.bam (1.2 GB)
[2024-06-23 10:30:16] DEBUG: [HTTP] Request headers: {User-Agent: varvis-download/0.33.0}
[2024-06-23 10:30:16] DEBUG: [HTTP] Response headers: {Content-Length: 1234567890}
[2024-06-23 10:30:45] INFO: [DOWNLOAD] Completed: sample_001.bam (29 seconds)
[2024-06-23 10:30:45] INFO: [SUMMARY] Downloaded 4 files, 2.1 GB total
```

### Log Rotation

```bash
#!/bin/bash
# log-rotation.sh - Automatic log rotation

LOG_DIR="./logs"
MAX_SIZE="100M"
MAX_FILES=10

mkdir -p "$LOG_DIR"

# Function to rotate logs
rotate_logs() {
  local log_file="$1"
  local base_name=$(basename "$log_file" .log)

  # Check if log file exceeds size limit
  if [[ -f "$log_file" ]] && [[ $(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file") -gt $((100*1024*1024)) ]]; then
    # Rotate existing files
    for i in $(seq $((MAX_FILES-1)) -1 1); do
      if [[ -f "$LOG_DIR/${base_name}.${i}.log" ]]; then
        mv "$LOG_DIR/${base_name}.${i}.log" "$LOG_DIR/${base_name}.$((i+1)).log"
      fi
    done

    # Move current log to .1
    mv "$log_file" "$LOG_DIR/${base_name}.1.log"

    # Remove oldest logs
    for i in $(seq $((MAX_FILES+1)) 20); do
      rm -f "$LOG_DIR/${base_name}.${i}.log"
    done
  fi
}

# Rotate before running
rotate_logs "$LOG_DIR/varvis-download.log"

# Run with logging
./varvis-download.cjs \
  -t mytarget \
  -a "$1" \
  --logfile "$LOG_DIR/varvis-download.log"
```

## Download Reports

`--reportfile` writes the end-of-run summary as **plain text** (the same text is
printed to the log at the end of the run). It is not JSON and has no per-file
breakdown or checksums:

```bash
./varvis-download.cjs -t mytarget -a 12345 --reportfile "report_12345.txt"
```

### Report contents

```
    Download Summary Report:
    ------------------------
    Total Files Processed: 4
    Files Downloaded: 3
    Files Skipped (already exist): 1
    Total Bytes Downloaded: 1428160512
    Average Download Speed: 10592342.55 bytes/sec
    Total Time Taken: 135.20 seconds
```

### Reading the report

Because the report is plain text, `grep`/`awk` extract any field:

```bash
# Pull out the counts and the byte total
grep -E 'Files Downloaded|Files Skipped|Total Bytes Downloaded' report_12345.txt

# Total bytes as a bare number
awk -F': ' '/Total Bytes Downloaded/ {print $2}' report_12345.txt
```

## Advanced Logging

### Custom Log Formatting

```bash
#!/bin/bash
# custom-logging.sh - Custom log formatting and processing

# Function to format logs with custom timestamps
format_logs() {
  local log_file="$1"
  local formatted_file="${log_file%.log}_formatted.log"

  # Add custom formatting
  sed 's/^\[/['"$(hostname)"' - /' "$log_file" > "$formatted_file"

  echo "Formatted log saved to: $formatted_file"
}

# Run with logging
./varvis-download.cjs \
  -t mytarget \
  -a 12345 \
  --logfile "raw_download.log" \
  --loglevel debug

# Format the logs
format_logs "raw_download.log"
```

### Log format

Logs use a fixed, timestamped text format (`[timestamp] LEVEL: message`) via
Winston — there is no JSON log mode and no external logging-config file. Control
verbosity with `--loglevel` and the destination with `--logfile`, then
post-process the text with standard tools if you need another format.

## Monitoring and Alerting

### Real-time Log Monitoring

```bash
#!/bin/bash
# monitor-logs.sh - Real-time log monitoring

monitor_download() {
  local log_file="$1"
  local pid_file="$2"

  echo "Monitoring download progress..."

  # Monitor log file in real-time
  tail -f "$log_file" | while read line; do
    echo "$line"

    # Check for completion
    if echo "$line" | grep -q "All downloads completed"; then
      echo "Download completed successfully!"
      break
    fi

    # Check for errors
    if echo "$line" | grep -q "ERROR"; then
      echo "Error detected: $line"
      # Could send alert here
    fi

    # Check if process is still running
    if [[ -f "$pid_file" ]] && ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "Process terminated unexpectedly"
      break
    fi
  done
}

# Start download in background
./varvis-download.cjs -t mytarget -a 12345 --logfile "monitor.log" &
DOWNLOAD_PID=$!
echo "$DOWNLOAD_PID" > download.pid

# Monitor the download
monitor_download "monitor.log" "download.pid"

# Cleanup
rm -f download.pid
```

### Log Analysis and Alerting

```bash
#!/bin/bash
# log-alerts.sh - Automated log analysis and alerting

analyze_and_alert() {
  local log_file="$1"
  local alert_threshold=5

  # Count errors in last hour
  error_count=$(grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" "$log_file" | grep -c "ERROR" || echo 0)

  if [[ $error_count -ge $alert_threshold ]]; then
    # Send alert (example implementations)
    echo "ALERT: $error_count errors detected in last hour" | \
      mail -s "Varvis Download Alert" admin@company.com

    # Or send to Slack
    curl -X POST -H 'Content-type: application/json' \
      --data '{"text":"Varvis Download Alert: '"$error_count"' errors detected"}' \
      "$SLACK_WEBHOOK_URL"

    # Or write to syslog
    logger -p user.warn "Varvis Download: $error_count errors detected"
  fi

  # Check for download failures
  failure_count=$(grep "$(date '+%Y-%m-%d')" "$log_file" | grep -c "Download failed" || echo 0)

  if [[ $failure_count -gt 0 ]]; then
    echo "WARNING: $failure_count download failures detected today"
  fi

  # Check for authentication issues
  auth_failures=$(grep "$(date '+%Y-%m-%d')" "$log_file" | grep -c "Authentication failed" || echo 0)

  if [[ $auth_failures -gt 0 ]]; then
    echo "CRITICAL: Authentication failures detected"
  fi
}

# Run analysis
analyze_and_alert "/var/log/varvis-download/varvis.log"
```

## Log Aggregation

### Centralized Logging

```bash
#!/bin/bash
# centralized-logging.sh - Send logs to central logging system

# Function to send logs to rsyslog
send_to_rsyslog() {
  local log_file="$1"
  local facility="local0"

  # Send each log line to rsyslog
  while IFS= read -r line; do
    logger -p "$facility.info" "varvis-download: $line"
  done < "$log_file"
}

# Function to send logs to ELK stack
send_to_elk() {
  local log_file="$1"
  local elasticsearch_url="http://elasticsearch:9200"
  local index_name="varvis-logs"

  # Convert log to JSON and send to Elasticsearch
  python3 << EOF
import json
import requests
from datetime import datetime

with open('$log_file') as f:
    for line in f:
        if line.strip():
            log_entry = {
                'timestamp': datetime.now().isoformat(),
                'application': 'varvis-download',
                'message': line.strip(),
                'host': '$(hostname)'
            }

            response = requests.post(
                '$elasticsearch_url/$index_name/_doc',
                json=log_entry,
                headers={'Content-Type': 'application/json'}
            )
EOF
}

# Run download with centralized logging
./varvis-download.cjs \
  -t mytarget \
  -a 12345 \
  --logfile "download.log"

# Send to central logging
send_to_rsyslog "download.log"
```

### Log Shipping with Filebeat

```yaml
# filebeat.yml - Filebeat configuration for log shipping
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/varvis-download/*.log
    fields:
      application: varvis-download
      environment: production
    fields_under_root: true
    multiline.pattern: '^\['
    multiline.negate: true
    multiline.match: after

output.elasticsearch:
  hosts: ['elasticsearch:9200']
  index: 'varvis-logs-%{+yyyy.MM.dd}'

processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded

logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0644
```

## Performance Monitoring

### Download Performance Metrics

```bash
#!/bin/bash
# performance-metrics.sh - Track download performance

collect_metrics() {
  local report_file="$1"
  local metrics_file="metrics.csv"

  # The report is plain text; parse it with awk
  [ -f "$metrics_file" ] ||
    echo "downloaded,skipped,total_bytes,avg_bytes_per_sec,seconds" > "$metrics_file"

  awk -F': ' '
    /Files Downloaded/       {d=$2}
    /Files Skipped/          {s=$2}
    /Total Bytes Downloaded/ {b=$2}
    /Average Download Speed/ {split($2, a, " "); spd=a[1]}
    /Total Time Taken/       {split($2, t, " "); sec=t[1]}
    END {print d "," s "," b "," spd "," sec}
  ' "$report_file" >> "$metrics_file"

  echo "Metrics appended to $metrics_file"
}

# Run download and collect metrics
./varvis-download.cjs \
  -t mytarget \
  -a 12345 \
  --reportfile "performance_report.txt"

collect_metrics "performance_report.txt"
```

### System Resource Monitoring

```bash
#!/bin/bash
# resource-monitoring.sh - Monitor system resources during download

monitor_resources() {
  local output_file="resource_usage.log"
  local download_pid="$1"

  echo "timestamp,cpu_percent,memory_mb,disk_io_read,disk_io_write,network_rx,network_tx" > "$output_file"

  while kill -0 "$download_pid" 2>/dev/null; do
    # Get process stats
    local stats=$(ps -p "$download_pid" -o pcpu,rss --no-headers 2>/dev/null)
    local cpu_percent=$(echo "$stats" | awk '{print $1}')
    local memory_mb=$(echo "$stats" | awk '{print $2/1024}')

    # Get system I/O stats (Linux)
    local disk_stats=$(cat /proc/diskstats | awk '/sda/ {print $6,$10}' | head -1)
    local net_stats=$(cat /proc/net/dev | grep eth0 | awk '{print $2,$10}')

    echo "$(date '+%Y-%m-%d %H:%M:%S'),$cpu_percent,$memory_mb,$disk_stats,$net_stats" >> "$output_file"

    sleep 5
  done

  echo "Resource monitoring completed. Data saved to $output_file"
}

# Start download in background
./varvis-download.cjs -t mytarget -a 12345 &
DOWNLOAD_PID=$!

# Monitor resources
monitor_resources "$DOWNLOAD_PID"

wait "$DOWNLOAD_PID"
```

## Best Practices

### Log Management

1. **Rotation**: Implement log rotation to prevent disk space issues
2. **Retention**: Define log retention policies based on compliance needs
3. **Compression**: Compress old log files to save space
4. **Backup**: Include logs in backup strategies

### Security

1. **Sensitive Data**: Never log passwords or API keys
2. **Access Control**: Restrict access to log files containing sensitive information
3. **Audit Trail**: Maintain audit logs for compliance requirements
4. **Sanitization**: Sanitize log data before sending to external systems

### Performance

1. **Log Level**: Use appropriate log levels for different environments
2. **Async Logging**: Use asynchronous logging for high-volume operations
3. **Structured Logs**: Use structured logging for easier analysis
4. **Monitoring**: Monitor log file sizes and processing performance

### Troubleshooting

1. **Debug Mode**: Use debug logging for troubleshooting issues
2. **Context**: Include sufficient context in log messages
3. **Correlation**: Use correlation IDs to trace requests across systems
4. **Error Details**: Log detailed error information including stack traces

## Related Documentation

- **[Configuration Guide](/guide/configuration)** - Logging configuration options
- **[Batch Operations](/guide/batch-operations)** - Logging for batch processes
- **[Archive Management](/guide/archive-management)** - Archive operation logging
- **[Basic Examples](/examples/basic)** - Simple logging examples
