# Varvis Download CLI Documentation

This directory contains the complete documentation for the Varvis Download CLI tool, built with [VitePress](https://vitepress.dev/).

## Documentation Structure

```
docs/
├── .vitepress/           # VitePress configuration
│   ├── config.mjs        # Site configuration
│   └── theme/            # Custom theme files
├── api/                  # API reference documentation
│   ├── index.md          # API overview
│   ├── cli.md            # CLI commands reference
│   ├── config.md         # Configuration schema
│   └── *.md              # Auto-generated API docs
├── guide/                # User guides
│   ├── getting-started.md
│   ├── installation.md
│   ├── authentication.md
│   └── *.md
├── examples/             # Usage examples
│   ├── basic.md
│   ├── filtering.md
│   └── *.md
└── index.md              # Homepage
```

## Local Development

### Prerequisites

- Node.js v20.16.0 or higher
- npm v10.0.0 or higher

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run docs:dev
```

The documentation will be available at `http://localhost:5173`

### Building

```bash
# Generate API documentation from JSDoc
npm run docs:generate

# Build static site
npm run docs:build

# Preview built site
npm run docs:preview
```

## Automated Documentation

### JSDoc Generation

API documentation is automatically generated from JSDoc comments in the source code:

```bash
# Generate API docs from source code
npm run docs:generate
```

This creates markdown files in `docs/api/` for each JavaScript module.

### GitHub Actions

Documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch. The workflow:

1. **Build**: Generates API docs and builds VitePress site
2. **Deploy**: Deploys to GitHub Pages

Triggered by changes to:

- `docs/**` - Documentation files
- `js/**` - Source code (for API docs)
- `varvis-download.js` - Main CLI file
- `package.json` - Dependencies

### Adding Documentation

#### New Guide Pages

1. Create markdown file in `docs/guide/`
2. Add to sidebar in `docs/.vitepress/config.mjs`
3. Reference from other pages as needed

Example:

```markdown
# My New Guide

Content here...

## Links to other sections

- [Getting Started](/guide/getting-started)
- [API Reference](/api/)
```

#### New API Documentation

API documentation is auto-generated from JSDoc comments. To add:

1. Add JSDoc comments to source code:

```javascript
/**
 * Download a file from the API
 * @param {string} url - The file URL
 * @param {string} destination - Local file path
 * @param {Object} options - Download options
 * @returns {Promise<void>} Resolves when download completes
 */
async function downloadFile(url, destination, options) {
  // Implementation
}
```

2. Run `npm run docs:generate` to update documentation

#### New Examples

1. Create markdown file in `docs/examples/`
2. Add to sidebar navigation
3. Include practical, working code samples

## Writing Guidelines

### Style Guide

- Use clear, concise language
- Include practical examples
- Test all code samples
- Use consistent formatting
- Add links between related sections

### Code Samples

Always test code samples before publishing:

```bash
# Good - tested example
./varvis-download.js -t laborberlin -a 12345

# Include expected output when helpful
# Output: ✓ Downloaded sample_001.bam (1.2 GB)
```

### Cross-References

Link to related sections:

```markdown
For authentication setup, see [Authentication Guide](/guide/authentication).

Complete API reference available at [API Documentation](/api/).
```

## Deployment

### Automatic Deployment

Documentation deploys automatically via GitHub Actions when:

- Changes pushed to `main` branch
- Workflow can be triggered manually

### Manual Deployment

```bash
# Build documentation
npm run docs:build

# Deploy to GitHub Pages (requires proper permissions)
# This is handled by GitHub Actions
```

## Troubleshooting

### Common Issues

**Build Failures:**

- Check Node.js version (requires v20+)
- Verify all dependencies installed: `npm ci`
- Clear cache: `rm -rf node_modules docs/.vitepress/cache`

**Missing API Documentation:**

- Ensure JSDoc comments use correct syntax
- Run `npm run docs:generate` manually
- Check for TypeScript syntax errors in comments

**Local Development Issues:**

- Port 5173 in use: Kill process or use different port
- Hot reloading not working: Restart dev server
- Broken links: Check file paths and extensions

### Getting Help

- Check [VitePress Documentation](https://vitepress.dev/)
- Review GitHub Actions logs for deployment issues
- Create issue in repository for documentation bugs

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b docs/feature-name`
3. Make changes and test locally: `npm run docs:dev`
4. Build to verify: `npm run docs:build`
5. Commit and push changes
6. Create pull request

### Documentation Standards

- All new features must include documentation
- Update existing docs when changing functionality
- Test all code examples
- Follow existing formatting conventions
- Add screenshots for UI-related features

## Maintenance

### Regular Updates

- Review and update examples monthly
- Check external links quarterly
- Update screenshots when UI changes
- Verify installation instructions with new releases

### Version Management

Documentation versions should align with tool releases:

- Major version changes: Update all documentation
- Minor version changes: Update affected sections
- Patch versions: Update specific fixes/features

The documentation site automatically reflects the current version from `package.json`.
