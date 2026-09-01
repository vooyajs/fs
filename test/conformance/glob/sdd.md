# glob SDD

## Compatibility Target

- Primary oracle: `node:fs/promises.glob` where available.
- Secondary oracle: `node:fs.globSync` for the already exported sync API.
- Ecosystem packages such as `fast-glob` are competitive references, not the compatibility oracle.

## Value Hypothesis

Vooya FS may lose on tiny and small glob patterns because bridge and matcher setup dominate. It should become competitive around medium recursive trees and win on large trees by parallelizing traversal and minimizing JS-side work.

## Functional Matrix

- `cwd`-relative patterns.
- Recursive `**` patterns.
- Path-prefix patterns.
- `withFileTypes` output.
- Empty matches.
- Exclude patterns.
- Hidden/dot path behavior.
- Root-only patterns such as `*.txt` match only at `cwd`; recursive patterns require `**/`.

## Scale Matrix

- `tiny`: single-level fixture.
- `small`: shallow tree.
- `medium`: transition zone.
- `large`: expected Vooya FS advantage zone.
- `extreme`: manual-only matcher/traversal stress case.

## Performance Metrics

- Promise and sync results are reported separately.
- Report wall-clock duration, `rss`, `heapUsed`, and `external`.
- Report Node/Vooya FS ratio without failing on performance.

## Docs Alignment

- Source doc: `docs/content/api/glob.mdx`.
- Docs must state that Node's built-in `fs.promises.glob` / `fs.globSync` is the compatibility oracle.
- Docs may mention `fast-glob` only as a competitive benchmark reference, not as the API oracle.
- Docs must explain rooted matching for `*.txt` versus `**/*.txt`.
- If performance reports identify a new break-even point or best-practice boundary, update the Performance and Notes sections.
