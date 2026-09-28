# Index-planned ranged downloads: implementation plan

> **Execution note (2026-09-28):** Implementation replaced the single-pass `blockEnd` bound in Task 4 with the two-pass exact end-block fetch and HTSlib-identical `max_off` described in the spec. `planRanges` returns `{ranges, blocks}`, and `vcfHeaderEnd` became `vcfHeader`. The merge gap is 16 KiB.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranged and unmapped BAM downloads and ranged VCF downloads transfer only the BGZF blocks named in the local index, instead of letting HTSlib stream the file remotely.

**Architecture:**
1. A pure planner turns BAI/TBI chunks into merged byte ranges.
2. A fetcher writes those bounded ranges into a sparse temporary file.
3. The unchanged samtools/tabix commands run on that local file.
4. `withRangedSource` picks the strategy and falls back to today's remote streaming on any failure.

**Tech Stack:** Node ≥ 22 CommonJS, `node:zlib` (inflateRawSync, gunzipSync), undici `request`, Jest 30, samtools/tabix/bgzip for real-tool tests.

**Spec:** `docs/superpowers/specs/2026-09-28-index-planned-ranges-design.md`

## Global Constraints

- CommonJS `.cjs`, `node:` imports, camelCase filenames, typed JSDoc on exports. Every file < 600 lines; aim for < 300.
- No new npm dependencies and no new external tools.
- Default strategy is `planned`. `--range-strategy stream` restores the old behaviour exactly.
- Output record set must be identical to remote samtools/tabix output.
- Never download the full object when the server ignores Range: abort on a 200 response.
- Never log signed URLs from the new modules; log the file name only.

## Review Focus

1. **A BGZF block or record that crosses the planned boundary.** A missing block must make the tool fail loudly (zeros are not valid BGZF), and the fallback must then produce correct output. Test: a planner unit test where `blockEnd` uses the next known offset; the fallback test in `rangedSource`.
2. **Contig naming that differs between the BED and the header** (`1` vs `chr1`, `AN:` alias). Expected: alias resolution, or the contig is skipped exactly as samtools skips it. Test: in `bamHeader`.
3. **A BAI linear index with zero entries or a window past its end.** Expected: a conservative `min_off`. Test: in `rangePlanner`.
4. **Outputs that already exist without `--overwrite`.** Expected: no mirror is built and no traffic is used. Test: in `rangedSource`.
5. **A server that returns 200 or changes its ETag during the fetch.** Expected: abort, then fall back to streaming. Test: in `rangeFetcher` plus the `rangedSource` fallback.

---

### Task 1: BGZF framing (`js/range/bgzf.cjs`)

**Produces:**
- `readBlockSize(buf: Buffer, pos: number): number | null` returns the total block length (BSIZE+1), or `null` when fewer than 18 header bytes are available. It throws on an invalid header.
- `inflateBlocks(buf: Buffer): {data: Buffer, consumed: number}` decompresses complete blocks from the start of `buf` and ignores a trailing partial block.
- `BGZF_EOF: Buffer`, the 28-byte EOF block.
- `MAX_BLOCK_SIZE = 65536`.

- [ ] Test (`tests/unit/range/bgzf.test.js`):
  - Build blocks with `zlib.deflateRawSync`, wrapped in the BGZF header (`1f 8b 08 04 … 06 00 42 43 02 00 BSIZE`) plus CRC32 and ISIZE.
  - Check sizes, partial-buffer handling, bad-magic rejection, and `BGZF_EOF` decompressing to zero bytes.
- [ ] Implement:
  - The header check requires `buf[pos]=0x1f`, `0x8b`, `0x08`, FLG & 4, and a `BC` subfield. BSIZE is the uint16 at the `BC` subfield offset.
  - Inflate with `zlib.inflateRawSync(buf.subarray(pos+18, pos+size-8))`.
- [ ] Run the test and commit: `feat(range): add BGZF block framing helpers`.

### Task 2: Index parser (`js/range/indexParser.cjs`)

**Produces:** `parseIndex(bytes: Buffer): ParsedIndex`, where:

```ts
ParsedIndex = {
  format: 'bai' | 'tbi',
  names: string[] | null,
  refs: Array<{ bins: Map<number, Array<[bigint, bigint]>>, linear: bigint[] }>,
  nNoCoor: bigint | null,
}
```

`parseIndexFile(path)` gunzips a `.tbi` (magic `1f 8b`) and reads a `.bai` raw.

- [ ] Test (`tests/unit/range/indexParser.test.js`):
  - Synthetic BAI buffer builder in the test: magic `BAI\1`, n_ref, bins, chunks, linear index, optional n_no_coor.
  - A TBI version with names (`TBI\1`, 8 int32 header fields, l_nm, NUL-separated names), gzipped.
  - A CSI magic must throw `/unsupported index/i`.
  - Truncated buffers must throw.
- [ ] Implement with a bounds-checked cursor (`readInt32LE`, `readUInt32LE`, `readBigUInt64LE`).
- [ ] Commit: `feat(range): parse BAI and TBI indexes`.

### Task 3: BAM header (`js/range/bamHeader.cjs`)

**Produces:** `parseBamHeader(data: Buffer): {names: string[], nameToTid: Map<string, number>} | null`. It returns `null` when `data` is still incomplete.

- [ ] Test (`tests/unit/range/bamHeader.test.js`):
  - Build `BAM\1`, l_text, text containing `@SQ\tSN:chr1\tLN:10\tAN:1,NC_000001`, n_ref, refs.
  - Truncation returns `null`.
  - Aliases map to the same tid. An alias never overrides a primary name.
- [ ] Implement.
- [ ] Commit: `feat(range): parse BAM header reference names and aliases`.

### Task 4: Planner (`js/range/rangePlanner.cjs`)

**Produces:**
- `parseRegion(region: string): {contig: string, beg: number, end: number}`, returning the half-open interval `[max(0, s-1), e)`, or `[0, 2**29)` when only a contig is given. It throws on malformed input.
- `planRanges({index, tids: Array<{tid, beg, end}>, includeUnmapped, fileSize, headerEnd, mergeGap = 65536}): Array<[number, number]>`, returning half-open, sorted, merged ranges. It always includes `[0, headerEnd)` and `[fileSize-28, fileSize)`.
- `vcfHeaderEnd(index, fileSize): number`.

Algorithm:
- **Region chunks:**
  - `reg2bins(beg, end)` for levels (26,1), (23,9), (20,73), (17,585), (14,4681), plus bin 0.
  - `minOff = linear[min(beg>>14, n-1)]`, stepping back past zero entries.
  - Keep chunks with `v > minOff` and set `u' = max(u, minOff)`.
- **Known block starts:** a sorted, unique set of `coffset` values from every chunk boundary and linear entry across all refs, plus `fileSize`.
- **blockEnd(c):** `min(first known > c, c + 65536, fileSize)`.
- **Range per chunk:** `[coffset(u'), blockEnd(coffset(v)))`.
- **Unmapped:** `start = coffset(max over all chunk ends)`, fetched through `fileSize`.
- **Merge:** join ranges when the gap is ≤ `mergeGap`.

- [ ] Test (`tests/unit/range/rangePlanner.test.js`), using hand-built `ParsedIndex` objects:
  - A leaf-bin chunk.
  - A chunk in a parent bin.
  - `minOff` trimming.
  - A zero linear entry stepping back.
  - `beg>>14` past the end of the linear array.
  - `blockEnd` bounded by the next known offset.
  - The unmapped range.
  - Merge and non-merge by gap.
  - `parseRegion` for `chr1`, `chr1:100-200`, `chr1:100`, and bad input.
- [ ] Implement.
- [ ] Commit: `feat(range): plan compressed byte ranges from index chunks`.

### Task 5: Fetcher (`js/range/rangeFetcher.cjs`)

**Produces:**
- `fetchRange({url, start, end, dispatcher, fileHandle, expect}): Promise<{size: number, etag: string | undefined, bytes: number}>`. `end` is exclusive, and `expect` is `{size?, etag?}`.
- `fetchRanges({url, ranges, dispatcher, fileHandle, expect, concurrency = 4}): Promise<number>`, which returns the total bytes.

Behaviour:
- Headers `range: bytes=start-(end-1)`, `accept-encoding: identity`, and `if-match` when the ETag is strong.
- Require status 206 and `Content-Range` equal to `bytes start-(end-1)/total`. The total must equal `expect.size` when that is known.
- Stream the body into `fileHandle.write(chunk, 0, len, pos)` and check that the byte count equals `end-start`.
- Retry up to 3 times with 250 ms × 2^n backoff on network errors, 5xx or 429. Do not retry on 4xx.
- A 200 response destroys the body and throws `RangeNotSupportedError`.
- `headersTimeout` and `bodyTimeout` are 30 s.
- Error messages never contain the URL.

- [ ] Test (`tests/unit/range/rangeFetcher.test.js`) against a local `http.createServer` that serves a `Buffer`:
  - The bytes written match the requested range.
  - A 200 response rejects.
  - A mismatched `Content-Range` rejects.
  - A changing ETag (412 from If-Match) rejects.
  - A 503 once, then success, retries.
  - The concurrency pool writes every range correctly.
- [ ] Implement.
- [ ] Commit: `feat(range): fetch validated bounded ranges into a file`.

### Task 6: Sparse mirror (`js/range/sparseMirror.cjs`)

**Produces:** `buildSparseMirror({url, indexPath, format: 'bam' | 'vcf', regions: string[], includeUnmapped: boolean, dispatcher, logger, fileName}): Promise<{dir, dataPath, indexPath, stats: {bytes, requests, fileSize}}>`.

Steps:
1. Create the directory with `mkdtemp(os.tmpdir()/varvis-mirror-)`. The data path is `<dir>/<fileName>`.
2. Fetch the head:
   - BAM: loop over 64 KiB windows from 0, appending, calling `inflateBlocks`, then `parseBamHeader`, until it returns a result. Cap the header at 64 MiB. `headerEnd` is the end of the last complete block consumed.
   - VCF: skip this step.
3. Resolve tids:
   - BAM: `nameToTid`.
   - VCF: `index.names`.
   - Skip unknown contigs with a debug log.
4. Compute the size:
   - BAM: known from the first response.
   - VCF: a `bytes=0-0` probe.
5. Plan. For VCF, `headerEnd = vcfHeaderEnd(index, size)`.
6. `ftruncate(size)`, then fetch the ranges that have not been fetched yet (skipping head bytes already written).
7. Copy the index:
   - VCF: to `<dataPath>.tbi`.
   - BAM: return the original index path.
8. `utimes(dataPath, indexMtime-60s)`.
9. On error, remove the directory and rethrow.

`cleanup(mirror)` removes the directory (`rm -rf`).

- [ ] Test (`tests/unit/range/sparseMirror.test.js`, real tools skipped via `which`): serve a samtools-built BAM and a bgzip/tabix VCF from a local server.
  - The mirror's `samtools view -X` output (BED regions) is identical to direct local output.
  - `tabix -h` output is identical.
  - Served bytes are below 60% of the file size for sparse regions.
  - An unknown contig yields empty output, not an error.
- [ ] Implement.
- [ ] Commit: `feat(range): build sparse local mirrors from planned ranges`.

### Task 7: Strategy wrapper and handlers

**Files:** create `js/download/rangedSource.cjs`; modify `js/download/bamHandler.cjs`, `js/download/vcfHandler.cjs`, `js/cli/args.cjs`, `js/cli/configMerge.cjs`, `js/types.d.ts`.

**Produces:** `withRangedSource({strategy, url, indexPath, format, regions, includeUnmapped, outputs, overwrite, fileName}, deps, run: (source: {location: string, indexPath: string}) => Promise<void>): Promise<void>`.

Behaviour:
- Use streaming, calling `run({location: url, indexPath})` directly, when any of these holds:
  - `strategy === 'stream'`;
  - every path in `outputs` exists and `!overwrite`;
  - there are no regions and no unmapped reads were requested.
- Otherwise:
  1. Build the mirror.
  2. Log the planned-read info line and add the bytes to `metrics.totalBytesDownloaded`.
  3. Call `run({location: mirror.dataPath, indexPath: mirror.indexPath})`.
  4. On any error, log a warning `Planned ranged read failed for <fileName> (<msg>); retrying with streamed remote access.` and call `run({location: url, indexPath})`.
  5. Always clean up the mirror.

Handlers:
- BAM ranged/unmapped: wrap the `rangedDownloadBAM(source.location, …, source.indexPath, …)` and `unmappedDownloadBAM` calls.
- VCF: wrap the region loop.
- VCF `rangedDownloadVCF` already uses `path.dirname(indexFile)` as the working directory. With a local path and a sibling `.tbi` this still works; the index argument is `source.indexPath`.

Config:
- `rangeStrategy` comes from argv (`--range-strategy`, choices `planned` and `stream`, default `planned`), otherwise from the config file, otherwise defaults to `planned`.
- Any other value makes `validateConfig` throw a `ConfigurationError`.
- `FinalConfig.rangeStrategy: 'planned' | 'stream'`. The handler `finalConfig` Pick adds an optional `rangeStrategy`.

- [ ] Tests:
  - `tests/unit/download/rangedSource.test.js`: mock `sparseMirror`. Cover the stream strategy, skip when outputs exist, planned success (location is the mirror, metrics updated, cleanup called), and fallback after `run` throws on the mirror.
  - Update `bamHandler.test.js` / `vcfHandler.test.js` to mock `rangedSource` with a pass-through.
  - Config tests for `rangeStrategy`.
- [ ] Implement.
- [ ] Commit: `feat(download): use index-planned ranged reads by default`.

### Task 8: Docs, changelog, gate

- [ ] `docs/guide/range-downloads.md`: add a "How ranged reads fetch data" section explaining the strategy, `--range-strategy`, the traffic log line and the fallback.
- [ ] `CHANGELOG.md` Unreleased: Added / Changed entries.
- [ ] Hand-maintained docs `docs/reference/cli.md` / `config-schema.md`: add the option, if those files exist.
- [ ] Run `npm run check`.
- [ ] Commit: `docs: document index-planned ranged reads`.
