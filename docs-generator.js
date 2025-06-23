#!/usr/bin/env node

/**
 * Documentation Generator for Varvis Download CLI
 *
 * This script automatically generates API documentation from JSDoc comments
 * in the source code and creates markdown files for VitePress.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const jsdoc2md = require('jsdoc-to-markdown');

// Configuration
const CONFIG = {
  sourceDir: './js',
  outputDir: './docs/api',
  tempDir: './docs/.temp',
  patterns: ['./js/**/*.js', './varvis-download.js'],
  excludePatterns: ['./js/**/*.test.js', './tests/**/*.js'],
};

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Clean temporary files
 */
function cleanup() {
  if (fs.existsSync(CONFIG.tempDir)) {
    fs.rmSync(CONFIG.tempDir, { recursive: true, force: true });
  }
}

/**
 * Get all JavaScript files to process
 * @returns {string[]} Array of file paths
 */
function getSourceFiles() {
  const files = [];

  // Add main CLI file
  if (fs.existsSync('./varvis-download.js')) {
    files.push('./varvis-download.js');
  }

  // Add all JS files from js/ directory
  if (fs.existsSync(CONFIG.sourceDir)) {
    const jsFiles = fs
      .readdirSync(CONFIG.sourceDir)
      .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
      .map((file) => path.join(CONFIG.sourceDir, file));
    files.push(...jsFiles);
  }

  return files;
}

/**
 * Generate JSDoc data for a file
 * @param {string} filePath - Path to the source file
 * @returns {Promise<object>} JSDoc data
 */
async function generateJSDocData(filePath) {
  try {
    const templateData = await jsdoc2md.getTemplateData({
      files: filePath,
      configure: './jsdoc.conf.json',
    });
    return templateData;
  } catch (error) {
    console.warn(
      `Warning: Could not generate JSDoc for ${filePath}: ${error.message}`,
    );
    return [];
  }
}

/**
 * Generate markdown from JSDoc data
 * @param {object} templateData - JSDoc template data
 * @param {string} moduleName - Name of the module
 * @returns {Promise<string>} Generated markdown
 */
async function generateMarkdown(templateData, moduleName) {
  if (!templateData || templateData.length === 0) {
    return `# ${moduleName}\n\nNo documentation available.\n`;
  }

  try {
    const markdown = await jsdoc2md.render({
      data: templateData,
      template: fs.readFileSync('./docs-template.hbs', 'utf8'),
    });
    return markdown;
  } catch (error) {
    console.warn(
      `Warning: Could not render markdown for ${moduleName}: ${error.message}`,
    );
    return `# ${moduleName}\n\nDocumentation generation failed.\n`;
  }
}

/**
 * Create handlebars template for documentation
 */
function createDocTemplate() {
  const template = `# {{module}} API Reference

{{#if description}}
{{description}}
{{/if}}

{{#functions}}
## {{name}}

{{#if description}}
{{description}}
{{/if}}

{{#if params}}
### Parameters

| Name | Type | Description |
|------|------|-------------|
{{#each params}}
| \`{{name}}\` | \`{{type.names.[0]}}\` | {{description}} |
{{/each}}
{{/if}}

{{#if returns}}
### Returns

**Type:** \`{{returns.[0].type.names.[0]}}\`

{{#if returns.[0].description}}
{{returns.[0].description}}
{{/if}}
{{/if}}

{{#if examples}}
### Examples

{{#each examples}}
\`\`\`javascript
{{this}}
\`\`\`
{{/each}}
{{/if}}

---

{{/functions}}

{{#classes}}
## Class: {{name}}

{{#if description}}
{{description}}
{{/if}}

{{#if params}}
### Constructor Parameters

| Name | Type | Description |
|------|------|-------------|
{{#each params}}
| \`{{name}}\` | \`{{type.names.[0]}}\` | {{description}} |
{{/each}}
{{/if}}

{{#methods}}
### {{name}}()

{{#if description}}
{{description}}
{{/if}}

{{#if params}}
#### Parameters

| Name | Type | Description |
|------|------|-------------|
{{#each params}}
| \`{{name}}\` | \`{{type.names.[0]}}\` | {{description}} |
{{/each}}
{{/if}}

{{#if returns}}
#### Returns

**Type:** \`{{returns.[0].type.names.[0]}}\`

{{#if returns.[0].description}}
{{returns.[0].description}}
{{/if}}
{{/if}}

---

{{/methods}}
{{/classes}}
`;

  fs.writeFileSync('./docs-template.hbs', template);
}

/**
 * Create JSDoc configuration
 */
function createJSDocConfig() {
  const config = {
    source: {
      include: ['./js/', './varvis-download.js'],
      exclude: ['./js/**/*.test.js', './tests/'],
      includePattern: '\\.(js)$',
    },
    opts: {
      recurse: true,
    },
    plugins: ['plugins/markdown'],
  };

  fs.writeFileSync('./jsdoc.conf.json', JSON.stringify(config, null, 2));
}

/**
 * Generate CLI reference documentation
 */
function generateCLIReference() {
  const cliContent = `# CLI Commands

Complete command-line reference for Varvis Download CLI.

## Synopsis

\`\`\`bash
varvis-download [OPTIONS] COMMAND [ARGS...]
\`\`\`

## Global Options

### Required Parameters

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| \`--target\` | \`-t\` | API target instance | \`laborberlin\` |

**At least one of the following is required:**

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| \`--analysisIds\` | \`-a\` | Analysis IDs (comma-separated) | \`12345,67890\` |
| \`--sampleIds\` | \`-s\` | Sample IDs for filtering | \`LB24-001,LB24-002\` |
| \`--limsIds\` | \`-l\` | LIMS IDs for filtering | \`LIMS_123,LIMS_456\` |

### Authentication Options

| Option | Short | Environment Variable | Description |
|--------|-------|---------------------|-------------|
| \`--username\` | \`-u\` | \`VARVIS_USER\` | Varvis API username |
| \`--password\` | \`-p\` | \`VARVIS_PASSWORD\` | Varvis API password |
| \`--config\` | \`-c\` | - | Configuration file path |

### File & Output Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| \`--destination\` | \`-d\` | \`.\` | Download destination folder |
| \`--filetypes\` | \`-f\` | \`bam,bam.bai\` | File types (comma-separated) |
| \`--overwrite\` | \`-o\` | \`false\` | Overwrite existing files |
| \`--list\` | \`-L\` | \`false\` | List files without downloading |

### Filtering & Range Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| \`--filter\` | \`-F\` | Filter expressions | \`"analysisType=SNV"\` |
| \`--range\` | \`-g\` | Genomic range | \`"chr1:1-100000"\` |
| \`--bed\` | \`-b\` | BED file with regions | \`regions.bed\` |

### Archive Management

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| \`--restoreArchived\` | \`-ra\` | \`ask\` | Archive mode: \`ask\|all\|force\|no\` |
| \`--restorationFile\` | \`-rf\` | \`awaiting-restoration.json\` | Restoration tracking file |
| \`--resumeArchivedDownloads\` | \`-rad\` | \`false\` | Resume archived downloads |

### Logging & Reports

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| \`--loglevel\` | \`--ll\` | \`info\` | Log level: \`debug\|info\|warn\|error\` |
| \`--logfile\` | \`--lf\` | - | Path to log file |
| \`--reportfile\` | \`-r\` | - | Path to download report |

### Proxy Configuration

| Option | Short | Description |
|--------|-------|-------------|
| \`--proxy\` | \`-x\` | Proxy URL |
| \`--proxyUsername\` | \`--pxu\` | Proxy username |
| \`--proxyPassword\` | \`--pxp\` | Proxy password |

### Utility Options

| Option | Short | Description |
|--------|-------|-------------|
| \`--version\` | \`-v\` | Show version information |
| \`--help\` | \`-h\` | Show help message |

## Usage Examples

### Basic Downloads

\`\`\`bash
# Download BAM files for specific analysis
varvis-download -t laborberlin -a 12345

# Download multiple analyses
varvis-download -t laborberlin -a "12345,67890,11111"

# Download specific file types
varvis-download -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"
\`\`\`

### Authentication

\`\`\`bash
# Using environment variables (recommended)
export VARVIS_USER="username"
export VARVIS_PASSWORD="password"
varvis-download -t laborberlin -a 12345

# Using command line arguments
varvis-download -t laborberlin -u username -p password -a 12345

# Using configuration file
varvis-download --config production.json -a 12345
\`\`\`

### Filtering

\`\`\`bash
# Filter by analysis type
varvis-download -t laborberlin -s "LB24-001" -F "analysisType=SNV"

# Multiple filters
varvis-download -t laborberlin -s "LB24-001" \\
  -F "analysisType=SNV" \\
  -F "quality>=95"

# Sample ID filtering
varvis-download -t laborberlin -F "sampleId>=LB24-0100"
\`\`\`

### Range Downloads

\`\`\`bash
# Single genomic range
varvis-download -t laborberlin -a 12345 -g "chr1:1000000-2000000"

# Multiple ranges
varvis-download -t laborberlin -a 12345 \\
  -g "chr1:1000000-2000000 chr2:500000-1500000"

# BED file regions
varvis-download -t laborberlin -a 12345 -b target_regions.bed
\`\`\`

### Archive Management

\`\`\`bash
# Force restore all archived files
varvis-download -t laborberlin -a 12345 --restoreArchived force

# Skip archived files
varvis-download -t laborberlin -a 12345 --restoreArchived no

# Resume archived downloads
varvis-download --resumeArchivedDownloads
\`\`\`

### Logging and Reports

\`\`\`bash
# Enable debug logging
varvis-download -t laborberlin -a 12345 --loglevel debug

# Save logs to file
varvis-download -t laborberlin -a 12345 --logfile download.log

# Generate download report
varvis-download -t laborberlin -a 12345 --reportfile report.json
\`\`\`

## Exit Codes

| Code | Description |
|------|-------------|
| \`0\` | Success |
| \`1\` | General error (authentication, network, file system) |
| \`2\` | Invalid arguments or configuration |

## Configuration Files

### Basic Configuration

\`\`\`json
{
  "username": "your_username",
  "target": "laborberlin", 
  "destination": "./downloads",
  "filetypes": ["bam", "bam.bai"],
  "loglevel": "info"
}
\`\`\`

### Advanced Configuration

\`\`\`json
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
\`\`\`

## Environment Variables

All command-line options can be set via environment variables using the \`VARVIS_\` prefix:

| Environment Variable | CLI Option |
|---------------------|-----------|
| \`VARVIS_USER\` | \`--username\` |
| \`VARVIS_PASSWORD\` | \`--password\` |
| \`VARVIS_TARGET\` | \`--target\` |
| \`VARVIS_DESTINATION\` | \`--destination\` |
| \`VARVIS_LOG_LEVEL\` | \`--loglevel\` |
| \`VARVIS_PROXY\` | \`--proxy\` |
`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'cli.md'), cliContent);
  console.log('✓ Generated CLI reference documentation');
}

/**
 * Generate configuration schema documentation
 */
function generateConfigSchema() {
  const configContent = `# Configuration Schema

Complete reference for configuration files and environment variables.

## Configuration File Format

Configuration files use JSON format with the following schema:

\`\`\`json
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
\`\`\`

## Environment Variables

All configuration options can be overridden using environment variables:

### Authentication

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| \`VARVIS_USER\` | \`username\` | API username |
| \`VARVIS_PASSWORD\` | \`password\` | API password |

### Connection

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| \`VARVIS_TARGET\` | \`target\` | API target instance |
| \`VARVIS_PROXY\` | \`proxy\` | Proxy URL |
| \`VARVIS_PROXY_USER\` | \`proxyUsername\` | Proxy username |
| \`VARVIS_PROXY_PASS\` | \`proxyPassword\` | Proxy password |

### File Operations

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| \`VARVIS_DESTINATION\` | \`destination\` | Download directory |
| \`VARVIS_FILETYPES\` | \`filetypes\` | File types (comma-separated) |
| \`VARVIS_OVERWRITE\` | \`overwrite\` | Overwrite existing files |

### Logging

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| \`VARVIS_LOG_LEVEL\` | \`loglevel\` | Logging level |
| \`VARVIS_LOG_FILE\` | \`logfile\` | Log file path |

### Archive Management

| Variable | Configuration Key | Description |
|----------|------------------|-------------|
| \`VARVIS_RESTORE_ARCHIVED\` | \`restoreArchived\` | Archive restoration mode |
| \`VARVIS_RESTORATION_FILE\` | \`restorationFile\` | Restoration tracking file |

## Configuration Examples

### Development Environment

\`\`\`json
{
  "target": "laborberlin",
  "username": "dev_user",
  "destination": "./dev-downloads",
  "loglevel": "debug",
  "logfile": "./logs/dev.log",
  "overwrite": true,
  "restoreArchived": "no"
}
\`\`\`

### Production Environment

\`\`\`json
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
\`\`\`

### CI/CD Environment

\`\`\`json
{
  "target": "laborberlin",
  "destination": "./ci-downloads", 
  "loglevel": "info",
  "reportfile": "./ci-report.json",
  "overwrite": true,
  "restoreArchived": "no",
  "filetypes": ["bam", "bam.bai"]
}
\`\`\`

## Configuration Validation

The tool validates configuration files and environment variables on startup:

### Required Fields

- \`target\` - Must be a valid API target
- At least one of: \`analysisIds\`, \`sampleIds\`, \`limsIds\` (unless using \`resumeArchivedDownloads\`)

### Field Validation

- **File Types**: Must be valid genomic file extensions
- **Log Level**: Must be one of: \`error\`, \`warn\`, \`info\`, \`debug\`
- **Archive Mode**: Must be one of: \`ask\`, \`all\`, \`force\`, \`no\`
- **Paths**: Must be valid filesystem paths
- **URLs**: Proxy URLs must be valid HTTP/HTTPS URLs

### Common Validation Errors

\`\`\`bash
# Missing required field
Error: Missing required argument --target

# Invalid file type
Error: Unsupported file type: invalid_type

# Invalid log level  
Error: Invalid log level: invalid_level

# Invalid directory
Error: Destination directory does not exist: /invalid/path
\`\`\`

## Configuration Precedence

Configuration values are resolved in the following order (highest to lowest priority):

1. **Command line arguments**
2. **Environment variables**
3. **Configuration file**
4. **Default values**

### Example Precedence

\`\`\`bash
# Environment variable
export VARVIS_USER="env_user"

# Configuration file contains: {"username": "config_user"}

# Command line overrides both
varvis-download --config config.json --username "cli_user"
# Result: Uses "cli_user"
\`\`\`

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

\`\`\`bash
# Secure configuration file permissions
chmod 600 .config.json

# Verify permissions
ls -la .config.json
# Should show: -rw------- (owner read/write only)
\`\`\`

### Environment File Security

\`\`\`bash
# Create secure .env file
cat > .env << 'EOF'
VARVIS_USER=your_username
VARVIS_PASSWORD=your_password
EOF

# Secure permissions
chmod 600 .env

# Add to .gitignore
echo ".env" >> .gitignore
\`\`\`
`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'config.md'), configContent);
  console.log('✓ Generated configuration schema documentation');
}

/**
 * Main documentation generation function
 */
async function generateDocs() {
  console.log('🚀 Starting documentation generation...\n');

  try {
    // Setup
    cleanup();
    ensureDir(CONFIG.outputDir);
    ensureDir(CONFIG.tempDir);
    createJSDocConfig();
    createDocTemplate();

    // Generate CLI and config documentation
    generateCLIReference();
    generateConfigSchema();

    // Get source files
    const sourceFiles = getSourceFiles();
    console.log(`📁 Found ${sourceFiles.length} source files to process\n`);

    // Generate API documentation for each module
    for (const filePath of sourceFiles) {
      const moduleName = path.basename(filePath, '.js');
      console.log(`📄 Processing ${moduleName}...`);

      try {
        // Generate JSDoc data
        const templateData = await generateJSDocData(filePath);

        if (templateData && templateData.length > 0) {
          // Generate markdown
          const markdown = await generateMarkdown(templateData, moduleName);

          // Write to file
          const outputPath = path.join(CONFIG.outputDir, `${moduleName}.md`);
          fs.writeFileSync(outputPath, markdown);

          console.log(`  ✓ Generated ${moduleName}.md`);
        } else {
          console.log(`  ⚠ No JSDoc comments found in ${moduleName}`);
        }
      } catch (error) {
        console.log(`  ✗ Failed to process ${moduleName}: ${error.message}`);
      }
    }

    // Update API index
    updateAPIIndex(sourceFiles);

    // Cleanup
    cleanup();
    if (fs.existsSync('./jsdoc.conf.json')) {
      fs.unlinkSync('./jsdoc.conf.json');
    }
    if (fs.existsSync('./docs-template.hbs')) {
      fs.unlinkSync('./docs-template.hbs');
    }

    console.log('\n✅ Documentation generation complete!');
    console.log(`📂 API documentation available in: ${CONFIG.outputDir}`);
  } catch (error) {
    console.error(`❌ Documentation generation failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Update the API index page with generated modules
 * @param {string[]} sourceFiles - Array of processed source files
 */
function updateAPIIndex(sourceFiles) {
  const indexPath = path.join(CONFIG.outputDir, 'index.md');
  const currentContent = fs.readFileSync(indexPath, 'utf8');

  // Generate module list
  const moduleList = sourceFiles
    .map((filePath) => {
      const moduleName = path.basename(filePath, '.js');
      const moduleTitle =
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      return `- **[${moduleTitle}](${moduleName})** - Auto-generated API documentation`;
    })
    .join('\n');

  // Update the API Reference section if it exists
  const updatedContent = currentContent.replace(
    /## Core Functions[\s\S]*?(?=##|$)/,
    `## Core Functions

### Generated API Documentation

${moduleList}

## `,
  );

  fs.writeFileSync(indexPath, updatedContent);
  console.log('✓ Updated API index with generated modules');
}

// Add to package.json scripts
function updatePackageScripts() {
  const packagePath = './package.json';
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  packageData.scripts = packageData.scripts || {};
  packageData.scripts['docs:generate'] = 'node docs-generator.js';
  packageData.scripts['docs:api'] =
    'npm run docs:generate && npm run docs:build';

  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
  console.log('✓ Updated package.json scripts');
}

// Run if called directly
if (require.main === module) {
  generateDocs();
}

module.exports = { generateDocs, updatePackageScripts };
