# Archive Management

The Varvis Download CLI provides comprehensive tools for managing archived files, including restoration requests, tracking, and automated workflows.

## Understanding Archives

### What are Archived Files?

Archived files are older data files that have been moved to long-term storage to save space on primary storage systems. These files:

- Are not immediately available for download
- Require restoration before downloading
- May take time to become available (minutes to hours)
- Are typically older analysis results

### Archive Status Indicators

When listing files, archived files are marked:

```bash
./varvis-download.js -t laborberlin -a 12345 --list

# Output example:
Analysis ID: 12345
Available files:
  - sample_001.bam (1.2 GB) [ARCHIVED]
  - sample_001.bam.bai (4.5 MB)
  - sample_001.vcf.gz (125 MB) [ARCHIVED]
  - sample_001.vcf.gz.tbi (2.1 MB)
```

## Archive Restoration Modes

### Ask Mode (Default)

Prompts for each archived file:

```bash
./varvis-download.js -t laborberlin -a 12345
# Prompts: "File sample_001.bam is archived. Restore? [y/N]"
```

### All Mode

Automatically restores all archived files:

```bash
./varvis-download.js -t laborberlin -a 12345 --restoreArchived all
```

### Force Mode

Restores archived files without confirmation:

```bash
./varvis-download.js -t laborberlin -a 12345 --restoreArchived force
```

### No Mode

Skips all archived files:

```bash
./varvis-download.js -t laborberlin -a 12345 --restoreArchived no
```

## Restoration Tracking

### Tracking File

The tool maintains a JSON file to track restoration requests:

```bash
# Default tracking file
./varvis-download.js -t laborberlin -a 12345 --restorationFile "my-restorations.json"
```

### Tracking File Format

```json
{
  "restorations": [
    {
      "analysisId": "12345",
      "fileName": "sample_001.bam",
      "requestTime": "2024-06-23T10:30:00Z",
      "status": "pending",
      "target": "laborberlin"
    }
  ],
  "lastUpdated": "2024-06-23T10:30:00Z"
}
```

### Status Values

- `pending` - Restoration requested, waiting
- `available` - File restored and ready
- `failed` - Restoration failed
- `expired` - Restoration expired

## Resume Archived Downloads

### Basic Resume

Resume previously requested archived downloads:

```bash
./varvis-download.js --resumeArchivedDownloads
```

### Resume with Custom Tracking File

```bash
./varvis-download.js --resumeArchivedDownloads --restorationFile "project-a-restorations.json"
```

### Resume with Specific Target

```bash
./varvis-download.js --resumeArchivedDownloads -t laborberlin
```

## Automation Workflows

### Daily Archive Check Script

```bash
#!/bin/bash
# daily-archive-check.sh

RESTORATION_FILE="daily-restorations.json"
LOG_FILE="archive-$(date +%Y%m%d).log"

echo "Checking for available restored files..."
./varvis-download.js \
  --resumeArchivedDownloads \
  --restorationFile "$RESTORATION_FILE" \
  --logfile "$LOG_FILE"

echo "Archive check completed. See $LOG_FILE for details."
```

### Bulk Archive Restoration

```bash
#!/bin/bash
# bulk-restore.sh

ANALYSIS_LIST="archive_analyses.txt"

while IFS= read -r ANALYSIS_ID; do
  echo "Requesting restoration for analysis: $ANALYSIS_ID"
  
  ./varvis-download.js \
    -t laborberlin \
    -a "$ANALYSIS_ID" \
    --restoreArchived force \
    --list
    
  sleep 5  # Rate limiting
done < "$ANALYSIS_LIST"

echo "All restoration requests submitted."
echo "Run with --resumeArchivedDownloads to check status later."
```

### Scheduled Download Script

```bash
#!/bin/bash
# scheduled-download.sh

# For use in cron jobs
# 0 */6 * * * /path/to/scheduled-download.sh

RESTORATION_FILE="/data/restorations/scheduled.json"
DOWNLOAD_DIR="/data/downloads"
LOG_DIR="/var/log/varvis-download"

mkdir -p "$DOWNLOAD_DIR" "$LOG_DIR"

# Check for available restored files every 6 hours
./varvis-download.js \
  --resumeArchivedDownloads \
  --restorationFile "$RESTORATION_FILE" \
  -d "$DOWNLOAD_DIR" \
  --logfile "$LOG_DIR/scheduled-$(date +%Y%m%d-%H%M).log"
```

## Advanced Archive Management

### Monitoring Restoration Status

Check restoration status without downloading:

```bash
./varvis-download.js \
  --resumeArchivedDownloads \
  --restorationFile "restorations.json" \
  --list
```

### Cleanup Old Restoration Requests

```bash
#!/bin/bash
# cleanup-restorations.sh

RESTORATION_FILE="awaiting-restoration.json"
BACKUP_FILE="restorations-backup-$(date +%Y%m%d).json"

# Backup current file
cp "$RESTORATION_FILE" "$BACKUP_FILE"

# Clean up completed/failed restorations older than 7 days
python3 << 'EOF'
import json
import datetime

with open('awaiting-restoration.json', 'r') as f:
    data = json.load(f)

# Filter out old completed/failed restorations
cutoff = datetime.datetime.now() - datetime.timedelta(days=7)
filtered_restorations = []

for restoration in data['restorations']:
    request_time = datetime.datetime.fromisoformat(restoration['requestTime'].replace('Z', '+00:00'))
    
    # Keep pending restorations and recent completed/failed ones
    if restoration['status'] == 'pending' or request_time > cutoff:
        filtered_restorations.append(restoration)

data['restorations'] = filtered_restorations
data['lastUpdated'] = datetime.datetime.now().isoformat() + 'Z'

with open('awaiting-restoration.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"Cleaned up restoration file. Kept {len(filtered_restorations)} restorations.")
EOF
```

### Archive Statistics

```bash
#!/bin/bash
# archive-stats.sh

echo "Archive Restoration Statistics"
echo "==============================="

RESTORATION_FILE="awaiting-restoration.json"

if [[ -f "$RESTORATION_FILE" ]]; then
  python3 << EOF
import json
from collections import Counter

with open('$RESTORATION_FILE', 'r') as f:
    data = json.load(f)

restorations = data['restorations']
statuses = [r['status'] for r in restorations]
targets = [r['target'] for r in restorations]

print(f"Total restorations: {len(restorations)}")
print("\nBy Status:")
for status, count in Counter(statuses).items():
    print(f"  {status}: {count}")

print("\nBy Target:")
for target, count in Counter(targets).items():
    print(f"  {target}: {count}")
EOF
else
  echo "No restoration file found."
fi
```

## Troubleshooting Archives

### Common Issues

**Restoration requests timeout:**
```bash
# Check network connectivity
ping api.varvis.com

# Use debug logging
./varvis-download.js -a 12345 --restoreArchived force --loglevel debug
```

**Files not becoming available:**
```bash
# Check restoration status
./varvis-download.js --resumeArchivedDownloads --list

# Contact support if files are stuck in pending status for >24 hours
```

**Large restoration tracking files:**
```bash
# Clean up old restorations
./cleanup-restorations.sh

# Or start fresh (backup first)
cp awaiting-restoration.json backup.json
echo '{"restorations": [], "lastUpdated": ""}' > awaiting-restoration.json
```

### Debug Archive Issues

```bash
#!/bin/bash
# debug-archive.sh

ANALYSIS_ID="$1"
if [[ -z "$ANALYSIS_ID" ]]; then
  echo "Usage: $0 <analysis_id>"
  exit 1
fi

echo "Debugging archive issues for analysis: $ANALYSIS_ID"

# Check file status
echo "1. Checking file availability..."
./varvis-download.js -t laborberlin -a "$ANALYSIS_ID" --list

# Check restoration tracking
echo "2. Checking restoration history..."
if [[ -f "awaiting-restoration.json" ]]; then
  grep -A5 -B5 "$ANALYSIS_ID" awaiting-restoration.json || echo "No restorations found"
else
  echo "No restoration file found"
fi

# Try restoration with debug logging
echo "3. Testing restoration request..."
./varvis-download.js \
  -t laborberlin \
  -a "$ANALYSIS_ID" \
  --restoreArchived force \
  --loglevel debug \
  --logfile "debug-archive-$ANALYSIS_ID.log" \
  --list

echo "Debug complete. Check debug-archive-$ANALYSIS_ID.log for details."
```

## Best Practices

### Planning Archive Downloads

1. **Request Early**: Submit restoration requests well before you need the data
2. **Batch Requests**: Request multiple files at once to optimize restoration
3. **Track Requests**: Always use restoration tracking files
4. **Monitor Status**: Check restoration status regularly

### Production Workflows

1. **Separate Tracking**: Use different tracking files for different projects
2. **Automated Monitoring**: Set up scheduled checks for restored files
3. **Cleanup Regularly**: Remove old completed restorations
4. **Backup Tracking**: Keep backups of restoration tracking files

### Error Recovery

1. **Retry Logic**: Implement retry logic for failed restorations
2. **Fallback Options**: Have alternative data sources when possible
3. **Monitoring**: Set up alerts for long-pending restorations
4. **Documentation**: Keep logs of restoration requests and issues

## Integration with Other Tools

### Database Integration

```python
#!/usr/bin/env python3
# archive_db.py - Track restorations in database

import json
import sqlite3
import datetime

def update_restoration_db():
    """Update database with restoration status"""
    
    conn = sqlite3.connect('restorations.db')
    cursor = conn.cursor()
    
    # Create table if not exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS restorations (
            analysis_id TEXT,
            file_name TEXT,
            request_time TEXT,
            status TEXT,
            target TEXT,
            PRIMARY KEY (analysis_id, file_name)
        )
    ''')
    
    # Read restoration file
    with open('awaiting-restoration.json', 'r') as f:
        data = json.load(f)
    
    # Update database
    for restoration in data['restorations']:
        cursor.execute('''
            INSERT OR REPLACE INTO restorations
            VALUES (?, ?, ?, ?, ?)
        ''', (
            restoration['analysisId'],
            restoration['fileName'],
            restoration['requestTime'],
            restoration['status'],
            restoration['target']
        ))
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    update_restoration_db()
```

### Monitoring Integration

```bash
#!/bin/bash
# monitoring-integration.sh

# Send metrics to monitoring system
PENDING_COUNT=$(jq '.restorations | map(select(.status == "pending")) | length' awaiting-restoration.json)
AVAILABLE_COUNT=$(jq '.restorations | map(select(.status == "available")) | length' awaiting-restoration.json)

# Example: Send to Prometheus pushgateway
curl -X POST http://pushgateway:9091/metrics/job/varvis-archives \
  --data-binary "varvis_archive_pending_count $PENDING_COUNT"
curl -X POST http://pushgateway:9091/metrics/job/varvis-archives \
  --data-binary "varvis_archive_available_count $AVAILABLE_COUNT"
```

## Related Documentation

- **[Configuration Guide](/guide/configuration)** - Archive-related settings
- **[Batch Operations](/guide/batch-operations)** - Bulk archive management
- **[Logging & Reports](/guide/logging)** - Archive activity logging
- **[Basic Examples](/examples/basic)** - Simple archive operations