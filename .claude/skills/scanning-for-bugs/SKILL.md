---
name: scanning-for-bugs
description: Use when asked to find, scan for, audit, or review varvis-download for bugs, defects, or regressions, when triaging a suspected defect or an external reviewer's finding, or before reporting any code-scan finding as confirmed.
---

# Scanning for bugs

Report findings; don't fix unless asked. Never delete or weaken a failing test
to make a finding go away.

## History first — this repo's bug classes recur

Run `git log --oneline --grep="^fix"` before reading code; files fixed before
get fixed again. The recurring classes and their hot seams:

| Class                 | Hot seams                                                | What to look for                                                                                                                             |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Config/flag semantics | `js/cli/configMerge.cjs`, `js/cli/args.cjs`              | Precedence inversions, explicit-flag detection gaps (bundled shorts like `-oL`), yargs defaults masking config values, numeric-vs-string IDs. |
| Lifecycle/cleanup     | `varvis-download.cjs`, `js/io/regionParsing.cjs`         | Dispatcher/readline closed in `finally`; temp files uniquely named (a fixed name like `regions.bed` clobbers under concurrency) and cleaned on throw paths, not just success. |
| Resume/restore state  | `js/commands/resume.cjs`, `js/download/`, `js/archiveUtils.cjs` | Restore context round-trips (incl. unmapped BAM), every region processed (not just `[0]`), dependencies wired through.                  |
| Duplicated mechanics  | `js/commands/*` vs `js/download/` handlers               | Command-file copies of shared download logic drift — a fix lands in the handler but not the copy. Duplication itself is the finding.          |
| Region/URL math       | `js/io/regionParsing.cjs`, `js/urlUtils.cjs`             | Chromosome-only ranges, signed-URL expiry windows, off-by-one range math.                                                                     |
| Shell-out safety      | `js/rangedUtils.cjs`                                     | The BAM path spawns with an arg array (safe); anything built as an `sh -c` string is suspect.                                                 |
| Upgrade breakage      | `package.json` majors                                    | undici and yargs majors have silently broken login headers and parsing before; diff release notes when deps moved.                            |

## Contracts to scan against

Semantic bugs are invisible without the intended contract — a scan that only
reads code shape misses them:

- **Precedence:** explicit CLI flag > env var > config file > default.
  Explicitness comes from the `__varvisExplicitOptions` metadata
  (`EXPLICIT_OPTIONS_KEY` in `js/cli/args.cjs`), never from comparing a value
  to its default.
- **Lifecycle:** the undici agent closes in the entry point's `finally`
  (`varvis-download.cjs`).
- **Downloads:** a path either goes through the shared `js/download/` handlers
  (URL expiry guarded via `getValidDownloadUrl`, `js/download/urlRefresh.cjs`)
  or provably fetches fresh links first — `js/commands/resume.cjs` does the
  latter by design; don't report it as a missing expiry guard.
- **Type gates lie by omission:** tsc is strict but `noUncheckedIndexedAccess`
  is off — unguarded `arr[0]` after a possibly-empty fetch is a live bug class
  the gate won't catch. Conversely, don't report null/`unknown` handling the
  strict gate already enforces.

## Verify before you report

Plausible findings die on the real call path: past reviews refuted a
"crash on chromosome-only range" and an "only `regions[0]` downloaded" finding
because the code routes through the guarded shared helper (`regionToBedLine`,
`js/io/regionParsing.cjs`). For each candidate, in order:

1. **Trace the actual call path** end-to-end — is a guarded shared helper in
   between?
2. **Execute the seam** when it runs without network:
   `node -e "const {mergeConfig}=require('./js/cli/configMerge.cjs'); console.log(mergeConfig(...))"`.
3. **For dynamic claims** (streams, timers, retries): write a failing Jest test
   (see the `testing-varvis-modules` skill); in a read-only review, execute the
   seam inline and spell out the test you'd write. Don't ship a "would
   OOM/deadlock" claim untested when a test is feasible.
4. **A passing test is not a verdict** — tests can pin buggy behavior. Check
   the test asserts the contract, not the implementation.

Label every finding **confirmed** (traced + executed or tested) or
**plausible** (static read only) — per claim, not per finding: a finding that
bundles an executed claim with a static one carries both labels. Never report
an untraced pattern-match.

## Report format

Rank by user impact: wrong data/destination > crash or hang > resource leak >
confusing error > efficiency. Per finding: `file:line` — one-sentence defect —
concrete failure scenario (inputs/state → wrong behavior) — confidence — how
verified. End with an explicit list of what you did NOT scan.
