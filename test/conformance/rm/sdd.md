# rm SDD

## Compatibility Target

- Primary oracle: `node:fs/promises.rm`.
- Secondary oracle: `node:fs.rmSync` for the already exported sync API.
- Callback-style `node:fs.rm` is out of scope for the initial production target.

## Value Hypothesis

Vooya FS should lose or be close on tiny removals because bridge cost dominates. It should become competitive on medium trees and win on large recursive removals when parallel deletion helps.

## Functional Matrix

- File removal.
- Recursive directory removal.
- `force` missing-path behavior.
- Non-recursive directory error behavior.
- `maxRetries` and `retryDelay` compatibility.
- Platform-specific permission and busy-file behavior.

## Scale Matrix

- `tiny`: overhead-dominated removal.
- `small`: shallow removal.
- `medium`: break-even search zone.
- `large`: expected Vooya FS advantage zone.
- `extreme`: manual-only removal stress case.

## Performance Metrics

- Promise and sync results are reported separately.
- Report wall-clock duration, `rss`, `heapUsed`, and `external`.
- Report Node/Vooya FS ratio without failing on performance.

## Docs Alignment

- Source doc: `docs/content/api/rm.mdx`.
- Docs must explain that recursive removal is the main performance target.
- Docs must keep tiny/small removal overhead visible if performance reports show Vooya FS losing or only matching Node.
- If retry or concurrency behavior changes, update both the Options and Notes sections.
