# Index-planned ranged downloads

Candidate alternative to PR #157 (bounded-range proxy).

Measured on a synthetic 20 MB panel BAM served over HTTP, with records identical to direct access in every case:

| Regions | Streamed (direct) | #157 proxy | Planned | Output |
|---|---|---|---|---|
| 99 | 40.4 MB | 20.7–22.3 MB | 8.82 MB | 4.95 MB |
| 30 | 40.4 MB | 20.7–22.3 MB | 2.76 MB | 1.50 MB |
| 10 | 130.1 MB | 8.2–32.9 MB | 0.89 MB | 0.50 MB |

## Problem

Ranged BAM/VCF downloads give samtools or tabix the presigned S3 URL, and HTSlib then reads it remotely. HTSlib's libcurl backend (1.17 through current `develop`) handles a forward seek shorter than `MIN_SEEK_FORWARD` (1,000,000 bytes) by reading the skipped bytes and discarding them. Every longer seek opens a new request with no end offset (`bytes=N-`), which transfers data past the point the client needs.

On gene panels, most gaps between BED regions are under 1 MB of compressed data, so HTSlib streams most of the file. The field measurement on PR #157 (32 TwistCustomv1 samples) was:

- 18.3 GB of traffic with the proxy, against 37.7 GB for full downloads.
- 180 MB of actual output, about 102× less than the traffic.

A local reproduction matched this. The proxy passed through 100% of the file whenever the region gaps were under 1 MB, whatever chunk size it used.

A proxy cannot fix this, because it cannot know which bytes HTSlib will discard. The bytes that are needed are already known: they are stored in the `.bai`/`.tbi` index, which we download first.

## Goal

For ranged and unmapped BAM downloads and for ranged VCF downloads, transfer only these bytes:

- the compressed (BGZF) blocks the tool will actually decode;
- the file header;
- the 28-byte end-of-file (EOF) marker.

Output must be byte-for-byte the same record set that remote samtools/tabix access produces today. Nothing new is added to the external tools: still samtools, tabix and bgzip only.

## Approach: sparse local mirror

1. **Index.** Parse the local `.bai`, or the `.tbi` after decompression. The index already stores bins, chunks (pairs of virtual offsets) and a linear index for every reference sequence.
2. **Names.**
   - BAM: fetch the header one 64 KiB bounded range at a time from offset 0. Decompress complete BGZF blocks until the whole binary header has been parsed. Map reference names to IDs, including `@SQ AN:` aliases, the way HTSlib's `sam_hdr_name2tid` does.
   - VCF: the reference names are stored in the TBI itself.
3. **Plan** (a pure function). For each region, reproduce the chunk selection in HTSlib's `hts_itr_query` and `hts_itr_multi_bam` (checked against HTSlib 1.20 source):
   - Candidate bins come from `reg2bins`, skipping the pseudo-bin 37450.
   - **`min_off`** is a lower bound for HTSlib's value. Take the linear-index entry for `beg>>14`, then step back to the nearest smaller earlier entry. HTSlib does this whenever the reference has placed unmapped reads. If the entry is zero, beyond the end of the index, or has no smaller predecessor, use 0, because HTSlib may use the bin's `loff` there.
   - **`max_off`** is identical to HTSlib's: the first chunk start of the nearest populated bin to the right of `end`, walking up to parent bins at the first child of each group. Chunks starting at or after it are dropped, and chunk ends are clipped to it.
   - Keep chunks with `v > min_off`, and clip their start to `min_off`. The selection is therefore always a superset of what HTSlib reads.
   - **End of each chunk:** a chunk ending at uncompressed offset 0 ends on a block boundary, and HTSlib stops before loading the next block. Otherwise the block at `coffset(v)` is needed in full, and it is recorded as a *partial end block*.
   - **Unmapped (`*`) reads:** fetch from `coffset` of the largest chunk end across all references up to the end of the file.
   - **VCF header:** fetch from 0 up to the end of the lowest-starting chunk, plus its end block. That chunk contains the first record, which `tabix -h` reads.
   - **Merging:** merge ranges separated by ≤ 16 KiB.
4. **Fetch, in two passes.**
   - **Pass 1:** the merged ranges, plus the 18-byte header of each partial end block.
   - **Pass 2:** read each end block's exact size from its header (`BSIZE`), then fetch the rest of the block, skipping bytes already fetched.
   - This removes the up-to-64 KiB guess per range at the cost of about one extra request per region.
   - Requests:
     - Use bounded `Range: bytes=a-b` GETs through the configured undici dispatcher (with `--proxy` support), 4 at a time, with up to 3 attempts on network errors, 5xx and 429 responses.
     - Require status 206 with a `Content-Range` that exactly matches the request, and check the body length.
     - Send `If-Match` with the strong ETag, and require the same total size and ETag on every response.
     - If the server ignores the Range header and returns 200, abort immediately. Never download the whole object as a fallback.
   - Write each range at its offset into a file in a private temp directory. The file is pre-sized to the object size, so disk usage is only the fetched bytes.
   - The 28-byte EOF marker is always fetched, so HTSlib's EOF check passes.
5. **Run the tools locally.** The existing `samtools view -X <sparse> <index> ...` and `tabix -h <sparse> region` commands run unchanged, pointed at the local path instead of the URL.
   - For tabix, copy the index next to the sparse file as `<name>.tbi`.
   - Set the sparse file's mtime older than the index's, to suppress HTSlib's "index is older than data" warning.

### Safety

Every unfetched byte in the sparse file is zero. HTSlib checks each BGZF block's header and CRC32. If the plan ever missed a block, the tool would fail loudly on the zero bytes and could never silently return wrong records. On any failure in planning, fetching or running the tool, we log a warning and retry the same operation with today's remote streaming. Output correctness therefore never depends on the planner. Only traffic does.

## Configuration

- New option `--range-strategy <planned|stream>`, also available as the `rangeStrategy` config key. The default is `planned`; `stream` uses today's behaviour and acts as a kill switch.
- Resumed archived downloads use the default (`planned`, with fallback). No new restoration-state fields.

## Observability

Log one `info` line per file:

```
Planned ranged read: fetched 12.3 MB in 41 requests (1.0% of 1.18 GB)
```

The fetched bytes are added to `metrics.totalBytesDownloaded`.

## Modules (all < 300 lines, CommonJS, typed JSDoc)

| Module | Responsibility |
|---|---|
| `js/range/bgzf.cjs` | BGZF block framing and decompression helpers. |
| `js/range/indexParser.cjs` | Parses BAI and TBI (bins, chunks, linear index, TBI names). Rejects CSI and unknown magic. |
| `js/range/bamHeader.cjs` | Parses the BAM binary header into a name→tid map with aliases. |
| `js/range/rangePlanner.cjs` | Pure planner: regions → merged byte ranges. |
| `js/range/rangeFetcher.cjs` | Bounded-range HTTP fetch into a file handle with validation. |
| `js/range/sparseMirror.cjs` | Orchestrates index → header → plan → fetch → local file. |
| `js/download/rangedSource.cjs` | Strategy selection, skip-if-outputs-exist, fallback, cleanup and metrics. |

Handlers (`bamHandler`, `vcfHandler`) wrap their existing ranged calls in `withRangedSource`. `rangedUtils.cjs` is unchanged.

## Region interpretation

A region string `chr[:s[-e]]` becomes the half-open interval `[max(0, s-1), e)`. This covers both 1-based range strings and the 0-based BED coordinates that `parseRegions` currently passes through unchanged. A region with only a chromosome name covers the whole reference. A reference missing from the index or header is skipped, as samtools and tabix also produce no records for it.

## Out of scope

- CSI indexes, which fall back to streaming.
- CRAM.
- Retrying mid-request or renewing expired URLs during a fetch.
- Reusing a mirror across several files.

## Testing

- **Unit tests:**
  - BGZF framing.
  - BAI/TBI parsing against synthetic buffers.
  - Planner: bins, `min_off`, zero windows, merging, unmapped, VCF header.
  - Fetcher, against a local HTTP server: 206 validation, a 200 response, ETag change, retries.
  - `rangedSource`: fallback, skip, cleanup.
  - Handler wiring.
- **Real-tool test** (skipped automatically when samtools/tabix/bgzip are missing):
  - Build a synthetic panel BAM and a VCF, and serve them from a local HTTP server that counts every byte sent.
  - Check that the records are identical to direct local extraction for BED, `--range` + unmapped, unmapped-only and multi-region VCF.
  - Check that the bytes served are much smaller than the file.
