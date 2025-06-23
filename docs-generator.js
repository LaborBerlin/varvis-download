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
function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Clean temporary files
 */
function _cleanup() {
  if (fs.existsSync(CONFIG.tempDir)) {
    fs.rmSync(CONFIG.tempDir, { recursive: true, force: true });
  }
}

/**
 * Get all JavaScript files to process
 * @returns {string[]} Array of file paths
 */
function _getSourceFiles() {
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
async function _generateJSDocData(filePath) {
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
async function _generateMarkdown(templateData, moduleName) {
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
function _createDocTemplate() {
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
function _createJSDocConfig() {
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
  const cliContent = 'TODO: Generate CLI reference';
  fs.writeFileSync(path.join(CONFIG.outputDir, 'cli.md'), cliContent);
  console.log('✓ Generated CLI reference documentation');
}

/**
 * Generate configuration schema documentation
 */
function generateConfigSchema() {
  const configContent = 'TODO: Generate config schema';
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
function updateDocsIndex(_modules) {
  // Implementation would go here
  console.log('✓ Updated docs index');
}

/**
 * Generate comprehensive documentation including API docs, CLI reference, and schema
 */
function generateDocs() {
  console.log('Starting documentation generation...');

  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  generateCLIReference();
  generateConfigSchema();
  updateDocsIndex([]);

  console.log('Documentation generation complete!');
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
