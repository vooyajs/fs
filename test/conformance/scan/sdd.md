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
- File and directory sizes match Node lstat; Windows directory sizes are zero,
  while Unix directory sizes retain the filesystem value. Followed directory links
  use Node stat target sizes; unfollowed links remain link metadata.

Evidence: `__test__/scan.spec.ts`, `test/conformance/public/batch.spec.ts`, and the
release-mode scale benchmark in `test/performance/scan/scan.bench.ts`.
Public directory/file size and link-following regressions:
`test/conformance/scan/metadata.spec.ts`. User contract: `docs/content/api/scan.mdx`.
