# stat SDD

## Scope

- Primary oracle: `node:fs/promises.stat`.
- Secondary oracle: `node:fs.statSync` for the already exported sync API.
- Callback-style `node:fs.stat` is out of scope for the initial production target.
- `lstat` shares the Rust implementation but is covered by its own API rollout item.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return type: Node-like `Stats` object with numeric fields, date getters, and file-type predicates.
- Supported symlink behavior: `stat` follows symlinks and returns metadata for the target.
- Unsupported Node surface for this SDD: `bigint` stats, `throwIfNoEntry: false`, `URL` paths, `Buffer` paths, and callback API shape.

## Functional Matrix

- Promise `stat` for files matches Node on stable numeric fields and predicates.
- Promise `stat` for directories matches Node predicates.
- Sync `statSync` matches Node on stable numeric fields and predicates.
- `stat` follows symlinks like Node.
- Date getters are Date objects and align with Node at millisecond precision.
- Missing paths reject in both implementations.

## Known Gaps

| Behavior                              | Node oracle                                                  | Current Vooya FS behavior                                                                                             | Reason                                                                                    | Follow-up                   |
| ------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields for missing paths | Rejects with `code: "ENOENT"`, `syscall: "stat"`, and `path` | Message contains Node-like ENOENT text, but N-API error exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| `bigint` stats                        | Node can return bigint-valued stats when `bigint: true`      | Not supported                                                                                                         | Type surface currently exposes number-valued stats only                                   | API surface expansion       |
| `throwIfNoEntry: false`               | Node sync stat can return `undefined` instead of throwing    | Not supported                                                                                                         | Options object is not part of current Vooya FS stat API                                   | API surface expansion       |
| `Buffer` and `URL` paths              | Accepted by Node                                             | Type surface currently accepts string paths only                                                                      | Path input expansion is deferred globally                                                 | API surface expansion       |

## Performance Metrics

- Report single-file stat, directory stat, and batch stat over source files.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `stat` follows symlinks and `lstat` covers link metadata separately.
- Docs must document unsupported `bigint`, `throwIfNoEntry`, `Buffer` path, and `URL` path behavior.
- Docs must keep the error object known gap visible until fixed.
- Docs should expose local report parameters when generated performance numbers are published.
