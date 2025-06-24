# API Documentation Index

This directory contains auto-generated API documentation for the Varvis Download CLI.

## CLI Reference

- [CLI Reference](cli.md) - Complete command-line interface reference
- [Configuration Schema](config-schema.md) - Configuration file schema and examples

## API Documentation

The following modules are documented:

- [apiClient](apiClient.md) - API Client class for handling HTTP requests with retry logic and agent management.
- [archiveUtils](archiveUtils.md) - Triggers restoration for an archived analysis file using the internal restore endpoint.
- [authService](authService.md) - AuthService class handles authentication with the Varvis API.
- [configUtils](configUtils.md) - Loads configuration from a specified file.
- [fetchUtils](fetchUtils.md) - Prompts the user to confirm restoration of an archived file.
- [fileUtils](fileUtils.md) - Prompts the user to confirm file overwrite if the file already exists.
- [filterUtils](filterUtils.md) - Parses a filter expression like 'analysisType=SNV' or 'sampleId>LB24-0001'
- [logger](logger.md) - Creates a logger with specified configuration.
- [rangedUtils](rangedUtils.md) - Wraps spawn in a Promise to maintain async/await syntax.
- [varvis-download](varvis-download.md) - Main CLI application entry point

## Generation

This documentation is auto-generated from JSDoc comments in the source code. To regenerate:

```bash
npm run docs:generate
```

Last generated: 2025-06-24
