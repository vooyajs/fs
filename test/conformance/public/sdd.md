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
