# Consolidated Dependency & Security Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all 4 open Dependabot PRs (#140, #144, #145, #146) and fix all 13 Dependabot security alerts into a single unified PR, pass local gates and CI, merge to `main`, bump fix version to `0.33.2`, tag `v0.33.2`, and publish a release.

**Architecture:** Update `package.json` with the consolidated dependency bumps and security overrides/resolutions. Run `npm install` to update `package-lock.json` cleanly, run `npm audit fix` for transitive vulnerabilities, and verify `npm audit` reports 0 vulnerabilities. Use parallel subagents to conduct adversarial code and lint reviews on any breaking changes in updated packages (especially ESLint, unicorn, Jest, undici). Run full local CI gate (`npm run check` + docs build). Commit and open a PR with GitHub CLI, monitor CI until green, merge into `main`, bump version to 0.33.2, tag, and publish release.

**Tech Stack:** Node.js >=22.22.2, npm >=10, Jest 30, ESLint 10, Prettier, TypeScript (tsc --noEmit), GitHub CLI (`gh`), Git.

**Spec:** User prompt requesting single consolidated PR for PRs #140, #144, #145, #146, resolution of all Dependabot alerts, adversarial review, full testing, PR creation, CI verification, merge, version bump (0.33.2), tagging, and release.

## Global Constraints

- CommonJS (`.cjs`) for runtime code; ESM for scripts.
- Never weaken ESLint, security, or JSDoc rules.
- Maintain small files (<600 LOC budget).
- Run all checks via `npm run check`.
- Zero vulnerabilities in `npm audit`.

---

### Task 1: Consolidate Dependencies in `package.json` and Resolve Vulnerabilities

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Open PR diffs (#140, #144, #145, #146) and security advisory fixes.
- Produces: Updated `package.json` with bumped dependencies and updated `overrides` section for zero vulnerabilities.

- [ ] **Step 1: Update `package.json` dependencies and overrides**
  Apply dependency bumps:
  - `fs-extra`: `^11.4.0` (PR #140)
  - `undici`: `^8.10.2` (PR #140 + security fixes)
  - `yargs`: `^18.1.0` (PR #140)
  - `@types/node`: `^26.1.2` (PR #144)
  - `lint-staged`: `^17.2.0` (PR #144)
  - `prettier`: `^3.9.6` (PR #144)
  - `eslint`: `^10.8.0` (PR #145)
  - `eslint-plugin-jsdoc`: `^63.3.3` (PR #145)
  - `eslint-plugin-unicorn`: `^73.0.0` (PR #145)
  - `jest`: `^30.5.1` (PR #146)
  - `nock`: `^14.0.17` (PR #146)
  Update overrides:
  - `js-yaml`: `^3.15.2` (resolves CVE-2026-59870 / GHSA-5p4m-2wfm-xmqj)
  - `brace-expansion`: `^1.1.18` (or `npm audit fix` for transitive trees)
  - `browserslist`: `^4.28.9`
  - `postcss`: `^8.5.28`

- [ ] **Step 2: Run `npm install` and `npm audit fix`**
  Run `npm install` followed by `npm audit fix` if needed, then `npm audit` to verify 0 vulnerabilities.

- [ ] **Step 3: Verify lockfile consistency and architecture budget**
  Run `npm run architecture:check` to ensure lockfile is clean and file budgets are maintained.

---

### Task 2: Adversarial Review of Bumped Packages & Lint/Test Adaptation

**Files:**
- Modify (if required): `eslint.config.js`, source files if new unicorn/eslint rules trigger.
- Modify: `tests/**` if any Jest 30.5 behavior changed.

**Interfaces:**
- Consumes: Installed node_modules, `npm run check` results.
- Produces: Clean codebase passing all lints, types, tests, and formatting.

- [ ] **Step 1: Run `npm run lint` and analyze any new ESLint/unicorn diagnostics**
  Check whether `eslint-plugin-unicorn@73` or `eslint@10.8` introduced new rules or broke existing configs.
  Fix any issues without weakening security or JSDoc rules.

- [ ] **Step 2: Run `npm run type-check`**
  Verify TypeScript compiler passes with zero errors on `@types/node` 26.1.2.

- [ ] **Step 3: Run `npm test` and `npm run docs:build`**
  Verify all 453+ Jest unit tests pass, integration config parses, and VitePress docs build succeeds.

- [ ] **Step 4: Subagent Adversarial Audit**
  Dispatch research/adversarial review subagent to independently audit the diff for security regressions, breaking API contracts, or stealthy changes.

---

### Task 3: Documentation and Changelog Preparation

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: List of consolidated PRs (#140, #144, #145, #146) and security advisory resolutions.
- Produces: Detailed `CHANGELOG.md` entry under `0.33.2`.

- [ ] **Step 1: Draft CHANGELOG entry for 0.33.2**
  Detail all consolidated dependency bumps, security advisory CVE/GHSA fixes, and verified gates.

- [ ] **Step 2: Run prettier and verify markdown formatting**
  `npx prettier --check CHANGELOG.md`

---

### Task 4: PR Creation and CI Verification

**Files:**
- Git branch `chore/consolidated-updates-2026-09`

- [ ] **Step 1: Commit changes and push branch to origin**
  Use descriptive commit message adhering to project conventions.

- [ ] **Step 2: Create GitHub Pull Request via `gh pr create`**
  Reference PRs #140, #144, #145, #146 and list all resolved security advisories.

- [ ] **Step 3: Monitor GitHub Actions CI on the PR**
  Use `gh pr checks` / `gh run watch` to ensure all checks pass.

---

### Task 5: Merge, Version Bump, Tag, and Release

**Files:**
- `package.json`
- `package-lock.json`

- [ ] **Step 1: Merge PR into `main`**
  Use `gh pr merge --squash` or `gh pr merge --merge` (matching repo conventions).

- [ ] **Step 2: Pull latest `main` locally**
  `git checkout main && git pull origin main`

- [ ] **Step 3: Bump version to `0.33.2` and tag**
  Ensure package.json is 0.33.2, git tag `v0.33.2` created.

- [ ] **Step 4: Push commit and tag to origin**
  `git push origin main --tags`

- [ ] **Step 5: Create GitHub Release**
  `gh release create v0.33.2 --title "v0.33.2" --notes-file ...`

- [ ] **Step 6: Close superseded Dependabot PRs**
  Close #140, #144, #145, #146 if not automatically closed.
