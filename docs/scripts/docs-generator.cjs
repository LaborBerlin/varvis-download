#!/usr/bin/env node

/**
 * Documentation Generator for Varvis Download CLI
 *
 * This script automatically generates API documentation from JSDoc comments
 * in the source code and creates markdown files for VitePress.
 */

const fs = require('fs');
const path = require('path');
const jsdoc2md = require('jsdoc-to-markdown');

// Configuration
const CONFIG = {
  get sourceDir() {
    return path.resolve(__dirname, '../../js');
  },
  get outputDir() {
    return path.resolve(__dirname, '../api');
  },
  get tempDir() {
    return path.resolve(__dirname, '../.temp');
  },
  patterns: ['../../js/**/*.js', '../../varvis-download.js'],
  excludePatterns: ['../../js/**/*.test.js', '../../tests/**/*.js'],
};

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get all JavaScript files to process
 * @returns {string[]} Array of file paths
 */
function _getSourceFiles() {
  const files = [];

  // Add main CLI file
  const mainCliPath = path.resolve(__dirname, '../../varvis-download.js');
  if (fs.existsSync(mainCliPath)) {
    files.push(mainCliPath);
  }

  // Add all JS files from js/ directory
  const sourceDir = CONFIG.sourceDir;
  if (fs.existsSync(sourceDir)) {
    const jsFiles = fs
      .readdirSync(sourceDir)
      .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
      .map((file) => path.join(sourceDir, file));
    files.push(...jsFiles);
  }

  return files;
}

/**
 * Generate JSDoc data for a file
 * @param {string} filePath - Path to the source file
 * @returns {Promise<object>} JSDoc data
 */
async function _generateJSDocData(filePath) {
  try {
    const templateData = await jsdoc2md.getTemplateData({
      files: filePath,
      configure: path.resolve(__dirname, '../../jsdoc.conf.json'),
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
async function _generateMarkdown(templateData, moduleName) {
  if (!templateData || templateData.length === 0) {
    return `# ${moduleName}\n\nNo documentation available.\n`;
  }

  try {
    const markdown = await jsdoc2md.render({
      data: templateData,
      template: fs.readFileSync(
        path.resolve(__dirname, '../docs-template.hbs'),
        'utf8',
      ),
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
 * Generate CLI reference documentation
 */
function generateCLIReference() {
  console.log('Generating CLI reference documentation...');

  // Extract CLI options by reading the main CLI file
  const cliFilePath = path.resolve(__dirname, '../../varvis-download.js');
  if (!fs.existsSync(cliFilePath)) {
    console.warn(
      `CLI file not found at ${cliFilePath}, skipping CLI reference generation`,
    );
    return;
  }

  const cliOptions = [
    {
      option: 'config, c',
      type: 'string',
      default: '.config.json',
      description: 'Path to the configuration file',
    },
    {
      option: 'username, u',
      type: 'string',
      default: '',
      description: 'Varvis API username',
    },
    {
      option: 'password, p',
      type: 'string',
      default: '',
      description: 'Varvis API password',
    },
    {
      option: 'target, t',
      type: 'string',
      default: '',
      description: 'Target for the Varvis API',
    },
    {
      option: 'analysisIds, a',
      type: 'string',
      default: '',
      description: 'Analysis IDs to download files for (comma-separated)',
    },
    {
      option: 'sampleIds, s',
      type: 'string',
      default: '',
      description: 'Sample IDs to filter analyses (comma-separated)',
    },
    {
      option: 'limsIds, l',
      type: 'string',
      default: '',
      description: 'LIMS IDs to filter analyses (comma-separated)',
    },
    {
      option: 'list, L',
      type: 'boolean',
      default: 'false',
      description: 'List available files for the specified analysis IDs',
    },
    {
      option: 'destination, d',
      type: 'string',
      default: '.',
      description: 'Destination folder for the downloaded files',
    },
    {
      option: 'proxy, x',
      type: 'string',
      default: '',
      description: 'Proxy URL',
    },
    {
      option: 'proxyUsername, pxu',
      type: 'string',
      default: '',
      description: 'Proxy username',
    },
    {
      option: 'proxyPassword, pxp',
      type: 'string',
      default: '',
      description: 'Proxy password',
    },
    {
      option: 'overwrite, o',
      type: 'boolean',
      default: 'false',
      description: 'Overwrite existing files',
    },
    {
      option: 'filetypes, f',
      type: 'string',
      default: 'bam,bam.bai',
      description: 'File types to download (comma-separated)',
    },
    {
      option: 'loglevel, ll',
      type: 'string',
      default: 'info',
      description: 'Logging level (info, warn, error, debug)',
    },
    {
      option: 'logfile, lf',
      type: 'string',
      default: '',
      description: 'Path to the log file',
    },
    {
      option: 'reportfile, r',
      type: 'string',
      default: '',
      description: 'Path to the report file',
    },
    {
      option: 'filter, F',
      type: 'array',
      default: '[]',
      description:
        'Filter expressions (e.g., "analysisType=SNV", "sampleId>LB24-0001")',
    },
    {
      option: 'range, g',
      type: 'string',
      default: '',
      description: 'Genomic range for ranged download (e.g., chr1:1-100000)',
    },
    {
      option: 'bed, b',
      type: 'string',
      default: '',
      description: 'Path to BED file containing multiple regions',
    },
    {
      option: 'restoreArchived, ra',
      type: 'string',
      default: 'ask',
      description:
        'Restore archived files. Accepts "no", "ask" (default), "all", or "force".',
    },
    {
      option: 'restorationFile, rf',
      type: 'string',
      default: 'awaiting-restoration.json',
      description: 'Path and name for the awaiting-restoration JSON file',
    },
    {
      option: 'resumeArchivedDownloads, rad',
      type: 'boolean',
      default: 'false',
      description:
        'Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed.',
    },
    {
      option: 'version, v',
      type: 'boolean',
      default: 'false',
      description: 'Show version information',
    },
    {
      option: 'help, h',
      type: 'boolean',
      default: 'false',
      description: 'Show help',
    },
  ];

  let cliContent = `# CLI Reference\n\n`;
  cliContent += `This document provides a comprehensive reference for all command-line options available in the Varvis Download CLI.\n\n`;
  cliContent += `## Usage\n\n`;
  cliContent += `\`\`\`bash\nvarvis-download [options]\n\`\`\`\n\n`;
  cliContent += `## Options\n\n`;
  cliContent += `| Option | Type | Default | Description |\n`;
  cliContent += `|--------|------|---------|-------------|\n`;

  for (const opt of cliOptions) {
    const optionCol = `\`--${opt.option}\``;
    const typeCol = `\`${opt.type}\``;
    const defaultCol = opt.default ? `\`${opt.default}\`` : '-';
    const descCol = opt.description;
    cliContent += `| ${optionCol} | ${typeCol} | ${defaultCol} | ${descCol} |\n`;
  }

  cliContent += `\n## Examples\n\n`;
  cliContent += `### Basic Usage\n\n`;
  cliContent += `\`\`\`bash\n# Download BAM files for specific analysis IDs\nvarvis-download -u username -p password -t target -a "analysis1,analysis2"\n\n# List available files without downloading\nvarvis-download -u username -p password -t target -a "analysis1" --list\n\n# Download with custom destination\nvarvis-download -u username -p password -t target -a "analysis1" -d "/path/to/download"\n\`\`\`\n\n`;
  cliContent += `### Advanced Usage\n\n`;
  cliContent += `\`\`\`bash\n# Download with filters\nvarvis-download -u username -p password -t target -s "sample1,sample2" --filter "analysisType=SNV"\n\n# Ranged download for specific genomic region\nvarvis-download -u username -p password -t target -a "analysis1" --range "chr1:1-100000"\n\n# Download with BED file for multiple regions\nvarvis-download -u username -p password -t target -a "analysis1" --bed "/path/to/regions.bed"\n\n# Resume archived downloads\nvarvis-download --resumeArchivedDownloads\n\`\`\`\n\n`;
  cliContent += `### Configuration File\n\n`;
  cliContent += `You can use a configuration file to store commonly used options:\n\n`;
  cliContent += `\`\`\`bash\nvarvis-download --config /path/to/config.json\n\`\`\`\n\n`;
  cliContent += `Example configuration file:\n\n`;
  cliContent += `\`\`\`json\n{\n  "username": "your-username",\n  "target": "https://your-varvis-instance.com",\n  "destination": "/path/to/downloads",\n  "filetypes": "bam,bam.bai,vcf",\n  "loglevel": "info"\n}\n\`\`\`\n`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'cli.md'), cliContent);
  console.log('✓ Generated CLI reference documentation');
}

/**
 * Generate configuration schema documentation
 */
function generateConfigSchema() {
  console.log('Generating configuration schema documentation...');

  const configSchema = {
    username: {
      type: 'string',
      required: false,
      description: 'Varvis API username',
    },
    password: {
      type: 'string',
      required: false,
      description: 'Varvis API password',
    },
    target: {
      type: 'string',
      required: false,
      description: 'Target for the Varvis API (can be full URL or alias)',
    },
    destination: {
      type: 'string',
      required: false,
      default: '.',
      description: 'Destination folder for downloaded files',
    },
    proxy: {
      type: 'string',
      required: false,
      description: 'Proxy URL for HTTP requests',
    },
    proxyUsername: {
      type: 'string',
      required: false,
      description: 'Username for proxy authentication',
    },
    proxyPassword: {
      type: 'string',
      required: false,
      description: 'Password for proxy authentication',
    },
    overwrite: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Whether to overwrite existing files',
    },
    filetypes: {
      type: 'string',
      required: false,
      default: 'bam,bam.bai',
      description: 'Comma-separated list of file types to download',
    },
    loglevel: {
      type: 'string',
      required: false,
      default: 'info',
      description: 'Logging level (info, warn, error, debug)',
    },
    logfile: {
      type: 'string',
      required: false,
      description: 'Path to the log file',
    },
    reportfile: {
      type: 'string',
      required: false,
      description: 'Path to the report file',
    },
    restoreArchived: {
      type: 'string',
      required: false,
      default: 'ask',
      description:
        'Restore archived files behavior ("no", "ask", "all", "force")',
    },
    restorationFile: {
      type: 'string',
      required: false,
      default: 'awaiting-restoration.json',
      description: 'Path for the restoration tracking file',
    },
  };

  let configContent = `# Configuration Schema\n\n`;
  configContent += `This document describes the configuration file schema for the Varvis Download CLI.\n\n`;
  configContent += `## Overview\n\n`;
  configContent += `The configuration file is a JSON file that can contain any of the CLI options to avoid having to specify them on the command line each time. Command line arguments take precedence over configuration file values.\n\n`;
  configContent += `## Default Configuration File\n\n`;
  configContent += `By default, the tool looks for a configuration file named \`.config.json\` in the current directory. You can specify a different configuration file using the \`--config\` option.\n\n`;
  configContent += `## Schema\n\n`;
  configContent += `| Property | Type | Required | Default | Description |\n`;
  configContent += `|----------|------|----------|---------|-------------|\n`;

  for (const [key, schema] of Object.entries(configSchema)) {
    const typeCol = `\`${schema.type}\``;
    const requiredCol = schema.required ? 'Yes' : 'No';
    const defaultCol =
      schema.default !== undefined ? `\`${schema.default}\`` : '-';
    const descCol = schema.description;
    configContent += `| \`${key}\` | ${typeCol} | ${requiredCol} | ${defaultCol} | ${descCol} |\n`;
  }

  configContent += `\n## Example Configuration Files\n\n`;
  configContent += `### Basic Configuration\n\n`;
  configContent += `\`\`\`json\n{\n  "username": "your-username",\n  "target": "https://your-varvis-instance.com",\n  "destination": "/path/to/downloads"\n}\n\`\`\`\n\n`;
  configContent += `### Advanced Configuration\n\n`;
  configContent += `\`\`\`json\n{\n  "username": "your-username",\n  "target": "production-server",\n  "destination": "/data/downloads",\n  "proxy": "http://proxy.company.com:8080",\n  "proxyUsername": "proxy-user",\n  "filetypes": "bam,bam.bai,vcf,vcf.gz.tbi",\n  "overwrite": false,\n  "loglevel": "debug",\n  "logfile": "/var/log/varvis-download.log",\n  "restoreArchived": "ask"\n}\n\`\`\`\n\n`;
  configContent += `### Minimal Configuration\n\n`;
  configContent += `\`\`\`json\n{\n  "username": "your-username",\n  "target": "https://varvis.example.com"\n}\n\`\`\`\n\n`;
  configContent += `## File Types\n\n`;
  configContent += `The \`filetypes\` property accepts a comma-separated list of file extensions. Common values include:\n\n`;
  configContent += `- \`bam\` - Binary Alignment Map files\n`;
  configContent += `- \`bam.bai\` - BAM index files\n`;
  configContent += `- \`vcf\` - Variant Call Format files\n`;
  configContent += `- \`vcf.gz\` - Compressed VCF files\n`;
  configContent += `- \`vcf.gz.tbi\` - Tabix index files for compressed VCF\n`;
  configContent += `- \`bed\` - Browser Extensible Data files\n\n`;
  configContent += `## Target Specification\n\n`;
  configContent += `The \`target\` property can be specified as:\n\n`;
  configContent += `- A full URL: \`https://varvis.example.com\`\n`;
  configContent += `- An alias that will be resolved by the application\n\n`;
  configContent += `## Logging Levels\n\n`;
  configContent += `Available logging levels (from most to least verbose):\n\n`;
  configContent += `- \`debug\` - Detailed debugging information\n`;
  configContent += `- \`info\` - General information (default)\n`;
  configContent += `- \`warn\` - Warning messages only\n`;
  configContent += `- \`error\` - Error messages only\n\n`;
  configContent += `## Archive Restoration Modes\n\n`;
  configContent += `The \`restoreArchived\` property controls how archived files are handled:\n\n`;
  configContent += `- \`no\` - Skip archived files entirely\n`;
  configContent += `- \`ask\` - Prompt for each archived file (default)\n`;
  configContent += `- \`all\` - Ask once, then restore all archived files\n`;
  configContent += `- \`force\` - Automatically restore all archived files without prompting\n`;

  fs.writeFileSync(
    path.join(CONFIG.outputDir, 'config-schema.md'),
    configContent,
  );
  console.log('✓ Generated configuration schema documentation');
}

/**
 * Update docs/index.md with generated module links
 * @param {Array} modules - Array of module objects with title and fileName
 */
function updateDocsIndex(modules) {
  console.log('Updating documentation index...');

  let indexContent = `# API Documentation Index\n\n`;
  indexContent += `This directory contains auto-generated API documentation for the Varvis Download CLI.\n\n`;
  indexContent += `## CLI Reference\n\n`;
  indexContent += `- [CLI Reference](cli.md) - Complete command-line interface reference\n`;
  indexContent += `- [Configuration Schema](config-schema.md) - Configuration file schema and examples\n\n`;
  indexContent += `## API Documentation\n\n`;
  indexContent += `The following modules are documented:\n\n`;

  // Sort modules alphabetically
  modules.sort((a, b) => a.title.localeCompare(b.title));

  for (const module of modules) {
    const moduleName = module.title;
    const fileName = module.fileName;
    const description = getModuleDescription(module.path);
    indexContent += `- [${moduleName}](${fileName}) - ${description}\n`;
  }

  indexContent += `\n## Generation\n\n`;
  indexContent += `This documentation is auto-generated from JSDoc comments in the source code. To regenerate:\n\n`;
  indexContent += `\`\`\`bash\nnpm run docs:generate\n\`\`\`\n\n`;
  indexContent += `Last generated: ${new Date().toISOString().split('T')[0]}\n`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'index.md'), indexContent);
  console.log('✓ Updated docs index');
}

/**
 * Extract a brief description from the module file
 * @param {string} filePath - Path to the module file
 * @returns {string} - Brief description of the module
 */
function getModuleDescription(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Look for file-level JSDoc comment
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i].trim();
      if (line.startsWith('* ') && !line.includes('@') && line.length > 5) {
        return line.substring(2).trim();
      }
    }

    // Fallback descriptions based on filename
    const baseName = path.basename(filePath, '.js');
    const descriptions = {
      authService: 'Authentication service for Varvis API',
      apiClient: 'HTTP client with retry logic and agent management',
      fetchUtils: 'API communication utilities for data fetching',
      fileUtils: 'File downloading utilities with progress tracking',
      rangedUtils: 'Genomic range-based partial download utilities',
      archiveUtils: 'Archive restoration workflow utilities',
      configUtils: 'Configuration loading and management utilities',
      filterUtils: 'Analysis filtering utilities',
      logger: 'Logging utilities and configuration',
      'varvis-download': 'Main CLI application entry point',
    };

    return descriptions[baseName] || 'Utility functions and classes';
  } catch {
    return 'Utility functions and classes';
  }
}

/**
 * Generate API documentation for all modules
 */
async function generateAPIDocumentation() {
  console.log('Generating API documentation...');

  _ensureDir(CONFIG.outputDir);

  const sourceFiles = _getSourceFiles();
  const modules = [];

  for (const filePath of sourceFiles) {
    const moduleName = path.basename(filePath, '.js');
    console.log(`Processing ${moduleName}...`);

    try {
      const templateData = await _generateJSDocData(filePath);
      const markdown = await _generateMarkdown(templateData, moduleName);

      const outputPath = path.join(CONFIG.outputDir, `${moduleName}.md`);
      fs.writeFileSync(outputPath, markdown);

      modules.push({
        title: moduleName,
        fileName: `${moduleName}.md`,
        path: filePath,
      });

      console.log(`✓ Generated ${moduleName}.md`);
    } catch (error) {
      console.warn(
        `Warning: Failed to generate docs for ${moduleName}: ${error.message}`,
      );
    }
  }

  return modules;
}

/**
 * Generate comprehensive documentation including API docs, CLI reference, and schema
 */
async function generateDocs() {
  console.log('Starting documentation generation...');

  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const modules = await generateAPIDocumentation();
  generateCLIReference();
  generateConfigSchema();
  updateDocsIndex(modules);

  console.log('Documentation generation complete!');
}

// Add to package.json scripts
function updatePackageScripts() {
  const packagePath = path.resolve(__dirname, '../../package.json');
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  packageData.scripts = packageData.scripts || {};
  packageData.scripts['docs:generate'] = 'node docs/scripts/docs-generator.cjs';
  packageData.scripts['docs:api'] =
    'npm run docs:generate && npm run docs:build';

  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
  console.log('✓ Updated package.json scripts');
}

// Run if called directly
if (require.main === module) {
  generateDocs().catch(console.error);
}

module.exports = {
  generateDocs,
  generateAPIDocumentation,
  generateCLIReference,
  generateConfigSchema,
  updatePackageScripts,
};
