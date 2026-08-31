# utimes SDD

## Scope

- Primary oracle: `node:fs/promises.utimes`.
- Secondary oracle: `node:fs.utimesSync` for the already exported sync API.
- Callback-style `node:fs.utimes` and file-descriptor `futimes` are out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported time input today: numbers representing seconds since the Unix epoch.
- Supported behavior: update access and modification times for files and directories.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, `Date` time values, string time values, file descriptor APIs, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `utimes` updates file atime and mtime like Node within timestamp tolerance.
- Promise `utimes` updates directory atime and mtime like Node within timestamp tolerance.
- Sync `utimesSync` updates file times like Node within timestamp tolerance.
- Fractional-second numeric timestamps are preserved within platform precision.
- Missing paths reject or throw in both implementations.

## Known Gaps

| Behavior                    | Node oracle                                                     | Current Vooya FS behavior                                                                                                 | Reason                                                                                    | Follow-up                   |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields         | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text for missing paths, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs            | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                                          | Path input expansion is deferred globally                                                 | API surface expansion       |
| Date and string time values | Node accepts numbers, numeric strings, and Date values          | Type surface currently accepts numbers only                                                                               | Time input coercion is deferred until broader Node input parity                           | API surface expansion       |
| File descriptor APIs        | Node exposes `futimes` variants                                 | Vooya FS exports path-based `utimes` only                                                                                 | File descriptor APIs are outside the current promise-first surface                        | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `utimes` is a single metadata mutation syscall; timestamp correctness and tolerance are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that current Vooya FS time inputs are numeric seconds.
- Docs must document unsupported path inputs, Date/string time values, and file descriptor APIs.
- Docs must keep the error object known gap visible until fixed.
