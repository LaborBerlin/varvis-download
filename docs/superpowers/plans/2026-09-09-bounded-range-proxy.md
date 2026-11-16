# Original bounded range proxy plan — superseded

The original single-chunk implementation failed real HTSlib reads that crossed a chunk boundary. Its assumed future version bypass and inferred egress savings were also unsupported.

The current implementation follows the [corrected specification](../specs/2026-09-09-bounded-range-proxy-design.md) and [PR correction plan](2026-09-14-proxy-corrections.md). Those documents define the complete HTTP stream contract and required verification.
