# readdir SDD

## Compatibility Target

- Primary oracle: `node:fs/promises.readdir`.
- Secondary oracle: `node:fs.readdirSync` for the already exported sync API.
- Callback-style `node:fs.readdir` is out of scope for the initial production target.

## Value Hypothesis

Vooya FS should lose or be close to Node on tiny directories because N-API bridge cost dominates. It should approach parity on medium trees and win on large recursive directory walks by keeping traversal and batching in Rust.

## Functional Matrix

- Names-only directory listing.
- `withFileTypes` listing with Dirent predicates.
- Recursive listing with normalized path separators and order-insensitive comparison.
- Missing directory rejection/error behavior.
- Known gap: `encoding: "buffer"` is documented as unsupported and must remain explicit.

## Scale Matrix

- `tiny`: exposes bridge overhead.
- `small`: typical small project directory.
- `medium`: expected break-even search zone.
- `large`: expected Vooya FS advantage zone.
- `extreme`: manual-only traversal stress case.

## Performance Metrics

- Promise and sync results are reported separately.
- Report wall-clock duration, `rss`, `heapUsed`, and `external`.
- Report Node/Vooya FS ratio without failing on performance.

## Docs Alignment

- Source doc: `docs/content/api/readdir.mdx`.
- Docs must state that tiny/non-recursive directory reads can be slower than Node because bridge overhead dominates.
- Docs must keep `encoding: "buffer"` listed as unsupported until conformance coverage says otherwise.
- If performance reports identify a new break-even point or best-practice boundary, update the Performance and Notes sections.
