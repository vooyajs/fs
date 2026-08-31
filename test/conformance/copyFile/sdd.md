# copyFile SDD

## Scope

- Primary oracle: `node:fs/promises.copyFile`.
- Secondary oracle: `node:fs.copyFileSync` for the already exported sync API.
- Callback-style `node:fs.copyFile` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string` for `src` and `dest`.
- Supported mode input today: numeric copy mode flags.
- Supported behavior: copy a single file, overwrite existing destination by default, and reject when `COPYFILE_EXCL` is set and destination exists.
- Unsupported Node surface for this SDD: `URL` paths, `Buffer` paths, callback API shape, exact Node error object metadata, and reflink semantics for `COPYFILE_FICLONE_FORCE`.

## Functional Matrix

- Promise `copyFile` copies file bytes like Node.
- Promise `copyFile` overwrites an existing destination like Node.
- Promise `copyFile` with `COPYFILE_EXCL` rejects when the destination exists like Node.
- Sync `copyFileSync` copies file bytes like Node.
- Missing source paths reject or throw in both implementations.
- Directory-tree copy is out of scope; use `cp` for recursive copy.

## Known Gaps

| Behavior                 | Node oracle                                                                       | Current Vooya FS behavior                                                                               | Reason                                                                                    | Follow-up                   |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields      | Rejects or throws with Node-style `code`, `syscall`, `path`, and sometimes `dest` | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs         | Node accepts strings, Buffers, and file URLs                                      | Type surface currently accepts string paths only                                                        | Path input expansion is deferred globally                                                 | API surface expansion       |
| `COPYFILE_FICLONE_FORCE` | Node requires copy-on-write reflink support or fails                              | Vooya FS currently falls back to ordinary copy                                                          | Reflink-specific semantics are not implemented                                            | API surface expansion       |

## Performance Metrics

- Report small, medium, and large single-file copy scenarios.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `copyFile` is single-file only and `cp` covers directory trees.
- Docs must document unsupported path inputs and reflink-force semantics.
- Docs must keep the error object known gap visible until fixed.
- Docs should expose local report parameters when generated performance numbers are published.
