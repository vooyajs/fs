# scan SDD

`scan` is a Vooya extension, not a Node API. Its reference is recursive Node
readdir plus lstat, explicit relative-path filtering and deterministic sorting.

- String/UTF-8 Buffer/file URL directory roots; missing and file roots reject.
- Rooted include/exclude patterns; directory records are opt-in.
- Ignore files precede includes and work without a Git repository.
- Hidden entries, symlink-following policy, metadata and concurrency are explicit.
- The native walker propagates I/O errors and rejects cycles; it never reports a
  complete metadata batch after an unreadable subtree.
- Records are sorted by normalized relative path independently of worker count.

Evidence: `__test__/scan.spec.ts`, `test/conformance/public/batch.spec.ts`, and the
release-mode scale benchmark in `test/performance/scan/scan.bench.ts`.
