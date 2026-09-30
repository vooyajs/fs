# cp SDD

## Compatibility Target

- Primary oracle: `node:fs/promises.cp`.
- Secondary oracle: `node:fs.cpSync` for the already exported sync API.
- Callback-style `node:fs.cp` is out of scope for the initial production target.

## Value Hypothesis

Vooya FS should be close to or slower than Node on tiny copies. It should become competitive on medium trees and win on large recursive copies when concurrency can amortize bridge cost.

## Functional Matrix

- File and directory recursive copy.
- Existing destination behavior.
- `force` and `errorOnExist`.
- `preserveTimestamps`.
- Symlink behavior where the platform supports it.
- Missing source rejection/error behavior.

## Scale Matrix

- `tiny`: overhead-dominated copy.
- `small`: shallow copy.
- `medium`: break-even search zone.
- `large`: expected Vooya FS advantage zone.
- `extreme`: manual-only copy stress case.

## Performance Metrics

- Promise and sync results are reported separately.
- Report wall-clock duration, `rss`, `heapUsed`, and `external`.
- Report Node/Vooya FS ratio without failing on performance.

## Docs Alignment

- Source doc: `docs/content/api/cp.mdx`.
- Docs must explain that recursive directory copy is the main performance target.
- Docs must keep tiny/small copy overhead visible if performance reports show Vooya FS losing or only matching Node.
- If concurrency guidance changes, update both the Options and Performance sections.

## Public entry and boundary regressions

`../public/batch.spec.ts` checks the shipped `@vooya/fs` entry against the same
Node runtime. See `docs/content/api/compatibility.mdx` for native vs Node execution
policy, intentional extensions and unsupported combinations. Benchmarks import
the public package; compatibility routes must not be presented as native speedups.

## Buffer path routing

UTF-8 Buffer paths are a native Unix Promise-copy extension. Windows and advanced
options delegate unchanged to Node; tests compare Node's Buffer-path rejection
on those routes rather than requiring successful copies everywhere. Portable
copy inputs are string paths and file URLs. No implementation behavior changes
are needed for this platform-oracle correction.
