# Consolidated Dependency and Security Updates Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for implementation and `superpowers:requesting-code-review` for independent verification.

**Goal:** Update PR #150 on current main, incorporate #159–#162, remediate every open Dependabot alert, answer review comments, and request another review.

**Architecture:** Preserve main's runtime behavior, production `dotenv`, and version 0.35.0. Update existing dependency ranges and regenerate the npm lockfile; keep security overrides compatible with their consumers. Record changes under Unreleased.

**Tech Stack:** Node.js >=22.22.2, npm >=10, CommonJS, Jest 30, ESLint 10, TypeScript, VitePress.

**Spec:** September 14 user request to refresh #150 and consolidate all open Dependabot updates so they become superseded when #150 merges.

## Global Constraints

- Preserve changes already merged into main, including #158 and release #163.
- Do not weaken lint rules, bypass hooks, change CI workflows, or add top-level dependencies.
- Verify both production and development dependencies against current advisories.
- Do not describe a skipped live integration step as a passing integration test.

## Task 1: Rebase and consolidate

**Files:** `package.json`, `package-lock.json`, `CHANGELOG.md`.

- [x] Rebase the existing branch onto main; resolve conflicts while retaining production `dotenv` and version 0.35.0.
- [x] Drop the obsolete 0.33.2 release commit and move dependency release notes under Unreleased.
- [x] Incorporate the exact dependency targets from #159–#162: fs-extra 11.4.0, yargs 18.1.0, ESLint 10.10.0, jsdoc plugin 64.3.9, unicorn 74.0.0, Jest 30.5.1, Nock 14.0.17, Node types 26.5.1, lint-staged 17.5.1, and Prettier 3.9.6.
- [x] Regenerate the lockfile with `npm install`, inspect override compatibility, and verify `npm ci` reproducibility.

## Task 2: Verify compatibility and security

**Files:** Existing CLI loader compatibility changes, Jest configuration, and dependency manifests; adjust only where verification demonstrates a problem.

- [x] Independently review the CLI loader workaround and scoped transitive overrides.
- [x] Run `npm run check`, `npm test -- --coverage`, and `npm run docs:build` with supported Node.
- [x] Run `npm audit --json` and check every installed occurrence of each package against all open Dependabot advisory ranges.
- [ ] Inspect actual CI integration steps and document any environment-dependent skip.

## Task 3: Update the existing PR

**Files:** `CHANGELOG.md`, this plan, and GitHub PR metadata/comments.

- [x] Update the changelog to reflect the final dependency versions and security fixes.
- [ ] Commit validated changes and push the rebased branch using an explicit force-with-lease against the previously inspected remote head.
- [ ] Rewrite #150's title and body around the final implementation, validation, superseded dependency PRs, and alert coverage.
- [ ] Reply to both inline comments and the blocking review with verified outcomes; request review from the prior human reviewers.
- [ ] Verify GitHub checks on the updated head and leave the PR ready for review.

## Merge and verification notes

Preserve the four bot head commits in the consolidated branch after checking that every changed direct range and locked direct version is represented. Merge #150 with **Create a merge commit** so GitHub can indirectly merge #159–#162 by ancestry; squash/rebase loses this guarantee. Recheck captured bot heads before merging.

Local `npm ci`, the full `npm run check` gate (47 suites, 484 tests), the docs build, and the complete npm audit passed on Node 22.22.2. Every installed package occurrence is outside all 10 open advisory ranges.
