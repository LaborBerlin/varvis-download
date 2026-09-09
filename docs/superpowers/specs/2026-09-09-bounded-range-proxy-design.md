# Bounded-Range Reverse Proxy Design Specification

**Feature:** In-Process Bounded-Range Reverse Proxy for Remote Ranged Downloads  
**Target Issue:** https://github.com/LaborBerlin/varvis-download/issues/22  
**Date:** 2026-09-09  
**Status:** Approved for Implementation  

## 1. Problem Statement & Background

When `varvis-download` performs ranged downloads of BAM and VCF files via `samtools view` and `tabix`, the underlying HTSlib HTTP transport (`hfile_libcurl.c`) issues unbounded HTTP Range requests (`Range: bytes=N-`). 

Because Varvis provides pre-signed AWS S3 / CloudFront HTTPS URLs, AWS S3 attempts to stream the remainder of the multi-gigabyte file (e.g. 17–50 GB) at line rate. Due to TCP window scaling and the bandwidth-delay product, hundreds of megabytes or gigabytes of unwanted data are transferred across the AWS boundary before the client reads its required ~60–150 KB and closes the connection. 

AWS bills for all data transferred out of its network, and Varvis internal accounting registers two full download events per ranged query (one for header, one for genomic region), creating an unacceptable cost contingency risk.

Upstream HTSlib (up to 1.24 and develop as of September 2026) has not resolved this for pre-signed HTTPS URLs. PR #1998 is stalled on an ABI incompatibility with `struct hFILE`.

## 2. Solution Overview

`varvis-download` will incorporate an in-process, self-contained, ephemeral **Bounded-Range Reverse Proxy** (`js/net/boundedRangeProxy.cjs`).

When a ranged download is initiated:
1. `varvis-download` spawns an ephemeral Node.js `http.Server` listening on `127.0.0.1:0`.
2. A cryptographically random UUID token is generated per proxy instance for loopback security.
3. Instead of passing the remote S3 presigned URL to `samtools` or `tabix`, `varvis-download` passes the local proxy URL: `http://127.0.0.1:<port>/stream/<token>`.
4. The proxy handles incoming requests:
   - `HEAD`: Forwards to upstream S3 to discover `Content-Length` and `Accept-Ranges: bytes`.
   - `GET`: Intercepts `Range: bytes=N-` (unbounded) and clamps it to a bounded chunk: `Range: bytes=N-(N + CHUNK_SIZE - 1)`.
   - Streams the `206 Partial Content` response downstream to `samtools` / `tabix` with exact `Content-Range` and `Content-Length`.
   - Listens on `req.on('close')` / `res.on('close')`. If the client closes the socket before the chunk completes, the proxy immediately calls `abortController.abort()` on the upstream S3 request, cutting off network egress within milliseconds.
5. Once the `samtools` / `tabix` process exits, the proxy server is closed and torn down.

## 3. Configuration & CLI Interface

- Option: `--bounded-range-proxy` (boolean, default: `true`).
  - Negation: `--no-bounded-range-proxy` (sets to `false`).
  - Config key: `boundedRangeProxy: true | false`.
- Option: `--bounded-range-chunk-size` (number, default: `2097152` bytes [2 MiB]).
  - Config key: `boundedRangeChunkSize: number`.
  - Allowed bounds: 65536 (64 KiB) to 67108864 (64 MiB).

## 4. Automatic Upstream Guard & Tool Version Detection

In `js/toolChecks.cjs`:
- `isToolAffectedByUnboundedRangeBug(toolName, versionString)`
  - Current known affected versions: samtools < 1.25, tabix < 1.25.
  - If a future version (>= 1.25) merges bounded HTTPS range requests and user has not explicitly passed `--bounded-range-proxy`, proxy is bypassed with an informational log:
    `[info] Detected ${toolName} version ${version} with native bounded range support; proxy bypassed.`
  - If tool is affected (all versions <= 1.24), proxy is activated by default.

## 5. Security & Isolation

- **Interface:** Bound exclusively to `127.0.0.1`. Never bound to `0.0.0.0` or public interfaces.
- **Port:** Ephemeral port `0` assigned dynamically by OS kernel to avoid collisions.
- **Token Authorization:** Every request path requires `/<token>`. Requests with invalid or missing tokens return `403 Forbidden`.
- **Lifecycle:** Server closes automatically in a `finally` block when the child process terminates.\n