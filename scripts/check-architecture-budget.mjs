#!/usr/bin/env node
/**
 * Architecture Budget Check
 *
 * Mechanical enforcement of repository-wide structural limits. Run via
 * `npm run architecture:check` locally and in CI.
 *
 * Rules:
 *   - Source/test files at or above WARN_LINE_THRESHOLD emit a warning.
 *   - Source/test files at or above NEW_FILE_HARD_THRESHOLD block the build,
 *     UNLESS the file is listed in KNOWN_OVERSIZED_FILES (legacy debt) — those
 *     emit advisory warnings until they are split.
 *   - Exactly one package-manager lockfile is allowed (`package-lock.json`).
 *     A stray `pnpm-lock.yaml` or `yarn.lock` is a blocking error.
 *
 * Exit code is 1 if any blocking issue is reported, 0 otherwise.
 *
 * When you split or grow a file, update KNOWN_OVERSIZED_FILES below.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WARN_LINE_THRESHOLD = 500;
const NEW_FILE_HARD_THRESHOLD = 600;

const CHECK_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts']);

const SKIP_DIRS = new Set([
  '.git',
  '.husky',
  '.worktrees',
  'assets',
  'build',
  'coverage',
  'dist',
  'logs',
  'node_modules',
  'release',
  'worktrees',
]);

const SKIP_PREFIXES = [
  'docs/.vitepress/cache/',
  'docs/.vitepress/dist/',
  'docs/api/',
];

// Pinned legacy files. Touching one is an implicit request to split it.
// Remove the entry once the file drops below NEW_FILE_HARD_THRESHOLD.
const KNOWN_OVERSIZED_FILES = new Set([
  'tests/integration/archive.test.js',
  'tests/unit/rangedUtils.enhanced.test.js',
]);

function toRepoPath(rootDir, path) {
  return relative(rootDir, path).split(sep).join('/');
}

function isSkipped(path) {
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function extensionOf(path) {
  const match = path.match(/(\.mjs|\.cjs|\.js|\.ts)$/);
  return match?.[1] ?? '';
}

async function collectFiles(rootDir, currentDir = rootDir, files = []) {
  for (const entry of await readdir(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectFiles(rootDir, resolve(currentDir, entry.name), files);
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const absolutePath = resolve(currentDir, entry.name);
    const repoPath = toRepoPath(rootDir, absolutePath);
    if (CHECK_EXTENSIONS.has(extensionOf(repoPath)) && !isSkipped(repoPath)) {
      files.push({ absolutePath, repoPath });
    }
  }
  return files;
}

export async function runArchitectureBudget({
  rootDir = process.cwd(),
  write = true,
} = {}) {
  const blocking = [];
  const warnings = [];
  const root = resolve(rootDir);

  // Lockfile sanity: npm is authoritative here.
  const hasNpmLock = existsSync(resolve(root, 'package-lock.json'));
  const hasPnpmLock = existsSync(resolve(root, 'pnpm-lock.yaml'));
  const hasYarnLock = existsSync(resolve(root, 'yarn.lock'));
  if (hasPnpmLock) {
    blocking.push(
      'Remove pnpm-lock.yaml; package-lock.json is the authoritative lockfile.',
    );
  }
  if (hasYarnLock) {
    blocking.push(
      'Remove yarn.lock; package-lock.json is the authoritative lockfile.',
    );
  }
  if (!hasNpmLock) {
    warnings.push(
      'package-lock.json is missing; run `npm install` to regenerate it.',
    );
  }

  for (const file of await collectFiles(root)) {
    const contents = await readFile(file.absolutePath, 'utf8');
    const lineCount = contents.length === 0 ? 0 : contents.split('\n').length;

    if (lineCount >= NEW_FILE_HARD_THRESHOLD) {
      if (KNOWN_OVERSIZED_FILES.has(file.repoPath)) {
        warnings.push(
          `${file.repoPath} has ${lineCount} lines; known oversized legacy file — split when touched.`,
        );
      } else {
        blocking.push(
          `${file.repoPath} has ${lineCount} lines; new files must stay below ${NEW_FILE_HARD_THRESHOLD} lines.`,
        );
      }
    } else if (lineCount >= WARN_LINE_THRESHOLD) {
      warnings.push(
        `${file.repoPath} has ${lineCount} lines; approaching the ${NEW_FILE_HARD_THRESHOLD}-line limit — consider splitting.`,
      );
    }
  }

  const ok = blocking.length === 0;
  if (write) {
    console.log('Architecture budget report');
    console.log(
      `  Thresholds: warn >= ${WARN_LINE_THRESHOLD} lines, block >= ${NEW_FILE_HARD_THRESHOLD} lines (new files)`,
    );
    console.log(`  Blocking issues: ${blocking.length}`);
    for (const issue of blocking) console.log(`    - ${issue}`);
    console.log(`  Warnings: ${warnings.length}`);
    for (const warning of warnings) console.log(`    - ${warning}`);
    console.log(ok ? '  Status: OK' : '  Status: BLOCKED');
  }

  return { ok, blocking, warnings };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  const result = await runArchitectureBudget();
  process.exitCode = result.ok ? 0 : 1;
}
