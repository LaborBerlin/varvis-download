# Bounded range proxy specification

Updated 2026-09-14 following real-tool and Playground review of PR #157. This replaces the original single-chunk design, which truncated HTTP responses and broke later HTSlib seeks.

## HTTP contract

- Listen only on `127.0.0.1`, an ephemeral port and a random per-instance route. Preserve the source basename so tabix can discover the downloaded local index.
- A GET without Range returns status 200 and the full object length. A ranged GET returns 206 and the complete requested span, including ranges larger than one upstream chunk.
- Fetch sequential bounded GET requests with raw undici bytes, identity encoding and the existing configured dispatcher. Metadata requests use GET `bytes=0-0`, because a presigned GET URL may not authorize HEAD.
- Validate status 206, exact Content-Range and Content-Length, body length, stable object size and a strong ETag before combining multiple requests. Weak or missing validators cannot establish byte identity across requests. Reject an upstream server that ignores Range; never silently download the full object as fallback.
- Support single open, finite and suffix ranges and HEAD. Invalid or unsatisfiable ranges fail explicitly. Abort when the downstream response closes, a tool fails or the owner closes the proxy. Respect backpressure. Close is idempotent and leaves caller-owned dispatchers open.
- Maximum upstream range size is a safe integer from 65536 to 67108864 bytes; default 2097152. A downstream query can require many chunks.

## CLI and process contract

Cross-request validation uses the [HTTP strong entity-tag comparison and If-Match contract](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match), which distinguishes byte changes from weak cache equivalence.

- Enable for ranged BAM, ranged VCF and unmapped BAM unless explicitly disabled. No speculative version threshold.
- Validate chunk configuration before authentication. Persist settings with restoration entries and restore them unless explicit current settings override them.
- Pass the configured HTTP dispatcher through handlers. Keep local VCF index discovery working.
- Wait for every tool and output stream. Reject failed extraction/indexing, clean partial output, preserve diagnostics without signed URLs and return nonzero from the CLI when a download fails.
- Keep modules and tests under 600 lines, with direct imports after extraction.

## Evidence and limits

Local HTTP contract tests cover full and partial reads, malformed responses, object changes, cancellation, authorization and dispatcher routing. Real tools must match direct decoded-record controls for populated VCF/BAM regions, later BAM seeks, a chromosome spanning multiple chunks, and unmapped BAM reads.

The executable benchmark records actual tool results, hashes, timings and observed proxy HTTP body bytes. It does not measure billing or infer direct traffic from object size. Network failures are failures. Mid-stream retries, URL renewal and provider billing estimation are outside this implementation.
