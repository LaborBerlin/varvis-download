# PR #157 correction plan

The user approved integrating the reviewed, Playground-tested continuous-stream design into the existing PR. Review evidence and the experimental implementation are in `C:/development/varvis-download-review-157-artifacts/`.

## Requirements

- Preserve the complete downstream HTTP representation while reading bounded upstream chunks. Validate ranges, lengths, object identity, chunk sizes and cancellation. Use raw undici bytes and the configured dispatcher.
- Preserve VCF index discovery, retain explicit proxy opt-out, remove the speculative tool-version bypass, and preserve settings across archive resume.
- Surface real tool failures and exit nonzero when downloads fail. Keep all touched source/test files below 600 lines and rewire extracted modules directly.
- Replace inferred egress savings with an honest executable benchmark. Keep only functioning paths and documentation matching the final behavior.
- No new dependencies or CI workflow changes. Do not merge the PR. Push reviewed commits to its existing branch after verification.

## Tasks

1. Replace the proxy core using failing HTTP contract tests first. Separate range parsing/validation from server lifecycle as useful. API remains `createBoundedRangeProxy(url, {chunkSize, logger, dispatcher})` returning `proxyUrl`, `token`, `close`, `getMetrics`. Export chunk validation and default from `js/net/rangeProtocol.cjs` for config reuse. Requests that cannot be completed safely fail explicitly; do not silently download a full object, splice changed objects, retry emitted bytes, or fabricate metrics.
2. Integrate CLI/config/resume and remove the unsupported version guard. Current explicit CLI settings override restored settings; otherwise saved settings override defaults. Add focused contract tests for validation and failure propagation.
3. Refactor ranged execution by cohesion, wire the dispatcher, correct VCF pipeline completion/error handling, cap and redact tool diagnostics, and keep direct imports/mocks aligned. Test failures and cleanup.
4. Replace the benchmark with real tool execution and decoded-output comparison; update README, range guide, original spec/plan and module docs. Add repeatable real-tool tests and populated Playground regions.
5. Run lint, formatting, types, full Jest with coverage, architecture and Playground E2E; compare populated BAM/VCF, large and unmapped records with direct controls. Obtain independent code review, fix findings, commit with hooks and push to `feature/bounded-range-proxy`. Update the PR description to the final implementation and verified scope.

## Integration decisions

| Boundary | Producer / consumer | Decision |
| --- | --- | --- |
| Chunk validation | rangeProtocol / config merge | Finite safe integer, 65536–67108864, default 2097152 |
| Transport | command deps / ranged helpers / proxy | Pass existing dispatcher explicitly; never close a caller-owned dispatcher |
| Proxy defaults | CLI / normal and resumed handlers | Enabled unless explicitly disabled; no guessed future release threshold |
| Tool lifecycle | spawn/pipeline / CLI result | Reject failed tools, remove partial outputs, wait for every process and stream |
| Documentation | implementation / benchmark and PR | Report observed body bytes and output equality; no claims about vendor billing |

The tasks agree with the review requirements. Changes to module boundaries require direct consumer rewiring. The proxy implementation is delegated; integration and documentation remain with the coordinator until the core is ready. All implementation work is in the existing isolated worktree.
