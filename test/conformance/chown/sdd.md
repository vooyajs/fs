# chown SDD

## Scope

- Primary oracle: `node:fs/promises.chown`.
- Secondary oracle: `node:fs.chownSync` for the already exported sync API.
- Callback-style `node:fs.chown` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported owner inputs: numeric `uid` and `gid`.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unix behavior delegates to the platform `chown` syscall.
- Non-Unix behavior is intentionally limited in the current implementation.
- Unsupported Node surface for this SDD: `URL` paths, `Buffer` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `chown` with the file's current `uid` and `gid` matches Node on Unix.
- Sync `chownSync` with the file's current `uid` and `gid` matches Node on Unix.
- Missing paths reject or throw in both implementations.
- Permission-denied ownership changes reject or throw in both implementations where the platform can model the permission.
- Non-Unix tests are limited to existence/error behavior because ownership mutation parity is not implemented in Vooya FS v1.

## Known Gaps

| Behavior                     | Node oracle                                                      | Current Vooya FS behavior                                                                                | Reason                                                                                    | Follow-up                   |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields          | Rejects or throws with Node-style `code`, `syscall`, and `path`  | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs             | Node accepts strings, Buffers, and file URLs                     | Type surface currently accepts string paths only                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Non-Unix ownership semantics | Node delegates to platform behavior                              | Vooya FS currently validates existence and otherwise no-ops on non-Unix platforms                        | Cross-platform chown parity is intentionally minimal in v1                                | Platform parity             |
| Specific OS error codes      | Node distinguishes `EPERM`, `EINVAL`, and other syscall failures | Vooya FS maps non-missing Unix failures to `EPERM` text                                                  | Error mapping is simplified                                                               | Runtime error compatibility |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `chown` is a single metadata mutation syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that numeric `uid` and `gid` values are the supported Vooya FS surface.
- Docs must document non-Unix limitations and unsupported path inputs.
- Docs must keep the error object known gap visible until fixed.
