#!/usr/bin/env node

/**
 * Documentation Generator for Varvis Download CLI
 *
 * This script automatically generates API documentation from JSDoc comments
 * in the source code and creates markdown files for VitePress.
 */

const fs = require('node:fs');
const path = require('node:path');
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
  patterns: ['../../js/**/*.cjs', '../../varvis-download.cjs'],
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
  const mainCliPath = path.resolve(__dirname, '../../varvis-download.cjs');
  if (fs.existsSync(mainCliPath)) {
    files.push(mainCliPath);
  }

  // Add all JS files from js/ directory
  const sourceDir = CONFIG.sourceDir;
  if (fs.existsSync(sourceDir)) {
    const jsFiles = fs
      .readdirSync(sourceDir)
      .filter((file) => file.endsWith('.cjs') && !file.endsWith('.test.cjs'))
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
    // For .cjs files, create a temporary .js file for JSDoc processing
    let actualFilePath = filePath;
    let tempFilePath = null;

    if (filePath.endsWith('.cjs')) {
      tempFilePath = filePath.replace('.cjs', '.temp.js');
      const content = fs.readFileSync(filePath, 'utf8');
      fs.writeFileSync(tempFilePath, content);
      actualFilePath = tempFilePath;
    }

    const templateData = await jsdoc2md.getTemplateData({
      files: actualFilePath,
      'no-cache': true,
    });

    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

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
        return line.slice(2).trim();
      }
    }

    // Fallback descriptions based on filename
    const baseName = path.basename(filePath, '.cjs');
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
    const moduleName = path.basename(filePath, '.cjs');
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
 * Generate the JSDoc-derived API module pages and refresh the API index.
 * The CLI reference (cli.md) and configuration schema (config-schema.md) are
 * hand-maintained and deliberately left untouched.
 */
async function generateDocs() {
  console.log('Starting documentation generation...');

  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const modules = await generateAPIDocumentation();
  // cli.md and config-schema.md are hand-maintained (richer and more accurate
  // than JSDoc-driven generation can produce), so they are intentionally NOT
  // regenerated here — regenerating them would regress hand-written content.
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
  updatePackageScripts,
};
