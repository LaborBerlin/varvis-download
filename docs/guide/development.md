# Development

This page summarizes the local development workflow for `varvis-download`.

## Quick Commands

Use Make for streamlined workflows:

```bash
make help           # Show all available commands
make dev            # Setup: install dependencies, lint, and test
make ci             # Run all quality checks (lint, format, type-check, test)
```

## Testing

```bash
# Using Make
make test           # Run unit tests
make test-int       # Run live integration tests when credentials are available

# Using npm
npm test                     # Run unit tests
npm test -- --coverage       # Run unit tests with coverage report
npm run test:integration     # Run live integration tests
```

Live integration tests use the varvis® Playground target and depend on external service availability. Unit tests and
local CI checks do not require Playground credentials.

## Code Quality

```bash
# Using Make
make lint           # Check code quality
make lint-fix       # Auto-fix lint issues where possible
make format         # Format with Prettier
make type-check     # Verify types

# Using npm
npm run lint
npm run lint:fix
npm run format
npm run type-check
```

## Security Checks

```bash
make audit          # Check production dependencies
make audit-all      # Check all dependencies
make audit-fix      # Apply npm audit fixes where available
make security       # Run audit and security-focused lint checks
```

The project uses dependency vulnerability scanning, ESLint security rules, and secret-detection linting to reduce common
development risks.

## Version Management

```bash
npm version patch   # Bug fixes
npm version minor   # New features
npm version major   # Breaking changes
```

## Contributing

Before opening or merging changes:

1. Run `make ci`.
2. Add or update tests for behavior changes.
3. Update documentation for new user-facing behavior.
4. Keep generated documentation in sync when API comments change.
