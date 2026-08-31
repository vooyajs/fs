# lstat SDD

## Scope

- Primary oracle: `node:fs/promises.lstat`.
- Secondary oracle: `node:fs.lstatSync` for the already exported sync API.
- Callback-style `node:fs.lstat` is out of scope for the initial production target.
- `stat` shares the Rust implementation but is covered by its own API rollout item.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return type: Node-like `Stats` object with numeric fields, date getters, and file-type predicates.
- Supported symlink behavior: `lstat` does not follow symlinks and returns metadata for the link itself.
- Unsupported Node surface for this SDD: `bigint` stats, `throwIfNoEntry: false`, `URL` paths, `Buffer` paths, and callback API shape.

## Functional Matrix

- Promise `lstat` for files matches Node on stable numeric fields and predicates.
- Promise `lstat` for directories matches Node predicates.
- Sync `lstatSync` matches Node on stable numeric fields and predicates.
- `lstat` reports symlink metadata and `isSymbolicLink()` matches Node.
- Date getters are Date objects and align with Node at millisecond precision.
- Missing paths reject in both implementations.

## Known Gaps

| Behavior                              | Node oracle                                                   | Current Vooya FS behavior                                                                                    | Reason                                                                                                   | Follow-up                   |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields for missing paths | Rejects with `code: "ENOENT"`, `syscall: "lstat"`, and `path` | Message contains `stat` wording and N-API exposes `code: "GenericFailure"` while omitting `syscall` / `path` | Shared runtime error construction does not yet map filesystem metadata into Node-style JS errors per API | Runtime error compatibility |
| `bigint` stats                        | Node can return bigint-valued stats when `bigint: true`       | Not supported                                                                                                | Type surface currently exposes number-valued stats only                                                  | API surface expansion       |
| `throwIfNoEntry: false`               | Node sync lstat can return `undefined` instead of throwing    | Not supported                                                                                                | Options object is not part of current Vooya FS lstat API                                                 | API surface expansion       |
| `Buffer` and `URL` paths              | Accepted by Node                                              | Type surface currently accepts string paths only                                                             | Path input expansion is deferred globally                                                                | API surface expansion       |

## Performance Metrics

- Report single-file lstat, directory lstat, symlink lstat, and batch lstat over source files.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `lstat` does not follow symlinks and `stat` covers target metadata separately.
- Docs must document unsupported `bigint`, `throwIfNoEntry`, `Buffer` path, and `URL` path behavior.
- Docs must keep the error object known gap visible until fixed.
- Docs should expose local report parameters when generated performance numbers are published.
