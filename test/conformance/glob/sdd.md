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

## Public entry and boundary regressions

`../public/batch.spec.ts` checks the shipped `@vooya/fs` entry against the same
Node runtime. See `docs/content/api/compatibility.mdx` for native vs Node execution
policy, intentional extensions and unsupported combinations. Benchmarks import
the public package; compatibility routes must not be presented as native speedups.

## Incremental native overhead reduction

Group patterns only when literal roots, hidden-entry policy and root-inclusion semantics agree. Preserve exclusions, ignore precedence, symlink traversal, path spelling, names/Dirents and deduplication across groups. Compare grouped calls with Node and the union of individual calls. Thread-local result collection must neither lose nor duplicate entries.

## Review boundary regressions

- Compare strings and Dirents against separate sync and Promise Node oracles for
  repeated adjacent globstars, wildcard excludes, and root inclusion.
- Normal public calls request a native compatibility retry when a directory
  symlink is encountered. Discard partial native output and rerun with Node,
  preserving its pattern-dependent finite symlink expansion. Do not enable
  unconditional link following. Raw generated bindings do not request this retry.
- Keep no-symlink `**/*`, repeated globstars and compatible multi-pattern queries
  native; assert the public route rather than relying on timing assertions.
- Ordinary wildcard excludes use Node. The `gitIgnore` extension retains its
  existing ignore/globset wildcard exclusions and native no-follow traversal for
  discovered symlinks; test that combining wildcard exclusions and ignore files
  never restores ignored files. Callback/advanced excludes remain unsupported.
- Measure before/after public-entry glob costs on release Node 22/24 builds.
