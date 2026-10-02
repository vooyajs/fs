# Public batch compatibility SDD

The exported package, rather than the generated native binding alone, is the
product contract. Runtime oracles are Node 22 and 24 on identical independent
fixtures. Preserve sync and Promise differences instead of assuming parity
between Node's two implementations.

Required evidence:

- Every existing export is present; direct Node ESM named imports work.
- readdir/readFile/cp/rm/scan accept documented string, Buffer and file URL paths.
- Callback filters, copy modes, cancellation and richer read inputs execute via
  Node where native batching cannot preserve their semantics.
- glob remains an actual Promise and adds async-iterator methods; overlap does
  not duplicate results. Rooted excludes, Unicode and platform case behavior use
  Node as oracle. Iteration is explicitly a materialized batch.
- Copy conflicts protect source data; permissions, modes, timestamps and link
  behavior are checked. Removal never follows symlink targets.
- Missing-path errors compare code, syscall, path and errno. Permission policies
  differ intentionally by API exactly as in Node (glob skips; readdir rejects).
- Invalid concurrency rejects before mutation.
- Scale reports use release bindings through the public entry. No speed assertion
  is used as a test gate, and Node execution routes claim no Rust speedup.

Standalone streams, watchers, callbacks and descriptor lifecycle are not part of
this batch contract. `scan` and `lines` have separate extension semantics.

Explicit `encoding: null` preserves Node defaults: readFile returns a Buffer and
readdir returns UTF-8 names, including recursive and Dirent results. Frozen caller
options are accepted and never changed during native option normalization.

### Null encoding routing evidence

Reproduce after `pnpm build`, from the repository root, with Node 22 or 24:

```sh
node test/performance/public/null-encoding.bench.cjs > /tmp/null-encoding.json
```

The optional first argument selects the baseline Git revision; the default is
`d3c0ad06087855d39dee229198bfddf3a7b63a14`. Both public entries use the same release
binding. Fixtures cover 128-byte / 1-MiB reads and 8 / 2,048-entry flat directories.
Two warmups and ten samples per case use a warm OS cache, sequentially, after
builds and tests completed. Results are validated before recording.

Raw [Node 22 samples](../../../docs/public/evidence/null-encoding-node22.json) and
[Node 24 samples](../../../docs/public/evidence/null-encoding-node24.json) retain
hardware, runtime and baseline identity. The prior null route throws and cannot
be timed successfully. On this macOS arm64 host, the unchanged default route's
median latencies stayed in the same range (tiny reads 0.011–0.015 ms, batch reads
0.078–0.089 ms, batch listings 1.19–1.25 ms). Flat directory listing remained slower
than Node (about 0.71 ms at 2,048 entries). These exploratory samples support no
acceleration claim; no peak-memory, Promise latency or other-platform performance
conclusion was measured. The new null branch creates one options wrapper; other
encodings retain their existing options object and execution route.
