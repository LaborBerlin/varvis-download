.PHONY: help install clean test test-int test-cov lint lint-fix format format-check type-check docs-dev docs-build ci dev

# Default target
.DEFAULT_GOAL := help

# Colors for terminal output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

help: ## Show this help message
	@echo "$(BLUE)═══════════════════════════════════════════════$(RESET)"
	@echo "$(BLUE)  Varvis Download CLI - Development Commands  $(RESET)"
	@echo "$(BLUE)═══════════════════════════════════════════════$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# Installation
install: ## Install all dependencies
	@echo "$(BLUE)Installing dependencies...$(RESET)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

# Testing
test: ## Run unit tests
	@echo "$(BLUE)Running unit tests...$(RESET)"
	npm test

test-int: ## Run integration tests (requires .env.test)
	@echo "$(BLUE)Running integration tests...$(RESET)"
	npm run test:integration

test-cov: ## Run tests with coverage report
	@echo "$(BLUE)Running tests with coverage...$(RESET)"
	npm test -- --coverage
	@echo ""
	@echo "$(GREEN)Coverage report: coverage/lcov-report/index.html$(RESET)"

# Code Quality
lint: ## Run ESLint
	@echo "$(BLUE)Running ESLint...$(RESET)"
	npm run lint

lint-fix: ## Auto-fix ESLint issues
	@echo "$(BLUE)Auto-fixing ESLint issues...$(RESET)"
	npm run lint:fix
	@echo "$(GREEN)✓ Linting complete$(RESET)"

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(RESET)"
	npm run format
	@echo "$(GREEN)✓ Code formatted$(RESET)"

format-check: ## Check formatting without changes
	@echo "$(BLUE)Checking code formatting...$(RESET)"
	npx prettier --check .

type-check: ## Type check JavaScript with TypeScript
	@echo "$(BLUE)Type checking JavaScript files...$(RESET)"
	npm run type-check
	@echo "$(GREEN)✓ Type check complete$(RESET)"

# Documentation
docs-dev: ## Start documentation dev server
	@echo "$(BLUE)Starting documentation server...$(RESET)"
	npm run docs:dev

docs-build: ## Build documentation site
	@echo "$(BLUE)Building documentation...$(RESET)"
	npm run docs:api
	@echo "$(GREEN)✓ Documentation built$(RESET)"

# Compound Tasks
ci: lint format-check type-check test ## Run all CI checks locally
	@echo ""
	@echo "$(GREEN)═══════════════════════════════════════════════$(RESET)"
	@echo "$(GREEN)  ✓ All CI checks passed successfully!        $(RESET)"
	@echo "$(GREEN)═══════════════════════════════════════════════$(RESET)"

dev: install lint-fix test ## Setup development environment
	@echo ""
	@echo "$(GREEN)═══════════════════════════════════════════════$(RESET)"
	@echo "$(GREEN)  ✓ Development environment ready!            $(RESET)"
	@echo "$(GREEN)═══════════════════════════════════════════════$(RESET)"

clean: ## Remove generated files and dependencies
	@echo "$(YELLOW)Cleaning project...$(RESET)"
	rm -rf node_modules coverage logs download development
	find . -name '*.log' -type f -delete
	find . -name '*.tsbuildinfo' -type f -delete
	@echo "$(GREEN)✓ Project cleaned$(RESET)"

# Version Management
version-patch: ## Bump patch version (0.21.0 -> 0.21.1)
	npm version patch

version-minor: ## Bump minor version (0.21.0 -> 0.22.0)
	npm version minor

version-major: ## Bump major version (0.21.0 -> 1.0.0)
	npm version major
