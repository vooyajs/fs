# access SDD

## Scope

- Primary oracle: `node:fs/promises.access`.
- Secondary oracle: `node:fs.accessSync` for the already exported sync API.
- Callback-style `node:fs.access` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported modes: Node numeric `fs.constants.F_OK`, `R_OK`, `W_OK`, `X_OK`, and bitwise combinations.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `URL` paths, `Buffer` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `access` with default mode matches Node for existing files.
- Promise `access` with `F_OK`, `R_OK`, `W_OK`, and combined modes matches Node for readable/writable files.
- Sync `accessSync` matches Node for existing files and explicit modes.
- Unix `X_OK` matches Node for executable files.
- Missing paths reject or throw in both implementations.
- Permission-denied paths reject or throw in both implementations where the platform can model the permission.

## Known Gaps

| Behavior                     | Node oracle                                                     | Current Vooya FS behavior                                                                                | Reason                                                                                    | Follow-up                   |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields          | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs             | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Windows permission semantics | Node delegates to platform access checks                        | Vooya FS approximates readonly checks for `W_OK` and treats other checks as existence-oriented           | Cross-platform permission modeling is intentionally minimal in v1                         | Platform parity             |

## Performance Metrics

- No dedicated local performance report in this rollout.
- Existing docs keep legacy benchmark notes, but conformance value is higher than microbenchmark value for `access` because behavior depends heavily on platform permissions.

## Docs Alignment

- Docs must state that `access` is a lower-level permission check and `exists` is simpler for existence-only checks.
- Docs must document unsupported `Buffer` and `URL` path behavior.
- Docs must keep the error object known gap visible until fixed.
