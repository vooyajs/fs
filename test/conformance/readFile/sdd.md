# readFile SDD

## Scope

- Primary oracle: `node:fs/promises.readFile`.
- Secondary oracle: `node:fs.readFileSync` for the already exported sync API.
- Callback-style `node:fs.readFile` is out of scope for the initial production target.
- Vooya FS extension: `options.lines` reads a line range when a text encoding is provided.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return modes: `Buffer` when no encoding is provided, `string` when encoding is provided.
- Supported encodings: `utf8`, `utf-8`, `ascii`, `latin1`, `binary`, `base64`, `base64url`, and `hex`.
- Supported flags are a subset of Node open flags: `r`, `rs`, `r+`, `rs+`, `a+`, `ax+`, `w+`, and `wx+`.
- Unsupported Node surface for this SDD: `AbortSignal`, file handles, `Buffer` paths, `URL` paths, and callback API shape.

## Functional Matrix

- Promise Buffer reads match Node byte-for-byte.
- Promise text reads match Node for supported encodings.
- Sync Buffer and text reads match Node where Vooya FS exposes `readFileSync`.
- Directory reads reject in both implementations.
- Missing paths reject in both implementations.
- Vooya FS `lines` extension is tested separately against documented Vooya FS behavior, not Node.

## Known Gaps

| Behavior                              | Node oracle                                                  | Current Vooya FS behavior                                                                                             | Reason                                                                                    | Follow-up                   |
| ------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields for missing paths | Rejects with `code: "ENOENT"`, `syscall: "open"`, and `path` | Message contains Node-like ENOENT text, but N-API error exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| `AbortSignal` option                  | May abort pending reads with `AbortError`                    | Not supported                                                                                                         | Promise-first target has not accepted abort semantics yet                                 | API surface expansion       |
| `Buffer` and `URL` paths              | Accepted by Node                                             | Type surface currently accepts string paths only                                                                      | Path input expansion is deferred globally                                                 | API surface expansion       |
| `lines` option                        | No Node equivalent                                           | Vooya FS extension that returns a selected line range for text reads                                                  | Intentional extension                                                                     | Docs only                   |

## Performance Metrics

- Report small text, medium text, large text, and large Buffer reads.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `readFile` is promise-first and callback-style APIs are deferred.
- Docs must describe `lines` as a Vooya FS extension, not Node compatibility.
- Docs must keep unsupported `AbortSignal`, `Buffer` path, and `URL` path behavior visible until implemented.
- Docs should expose local scale report parameters when generated performance numbers are published.
