# unlink SDD

## Scope

- Primary oracle: `node:fs/promises.unlink`.
- Secondary oracle: `node:fs.unlinkSync` for the already exported sync API.
- Callback-style `node:fs.unlink` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported behavior: remove files and symlinks; reject directories and missing paths.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `unlink` removes files like Node.
- Promise `unlink` removes symlink entries without deleting their target like Node where symlink creation is available.
- Sync `unlinkSync` removes files like Node.
- Directory paths reject or throw in both implementations.
- Missing paths reject or throw in both implementations.

## Known Gaps

| Behavior                  | Node oracle                                                                            | Current Vooya FS behavior                                                                                                | Reason                                                                                    | Follow-up                   |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields       | Rejects or throws with Node-style `code`, `syscall`, and `path`                        | Message contains Node-like text for common cases, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs          | Node accepts strings, Buffers, and file URLs                                           | Type surface currently accepts string paths only                                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Directory error code text | Node reports platform-specific directory unlink failures, commonly `EISDIR` or `EPERM` | Vooya FS currently reports `EPERM` text for directories                                                                  | Directory unlink errors are simplified                                                    | Runtime error compatibility |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `unlink` is a single metadata mutation syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that `unlink` removes files and symlink entries, not directories.
- Docs must document unsupported path inputs.
- Docs must keep the error object and platform directory-code gaps visible until fixed.
