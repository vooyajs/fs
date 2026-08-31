# link SDD

## Scope

- Primary oracle: `node:fs/promises.link`.
- Secondary oracle: `node:fs.linkSync` for the already exported sync API.
- Callback-style `node:fs.link` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string` for `existingPath` and `newPath`.
- Supported behavior: create a hard link for an existing file and fail when the source is missing or destination already exists.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `URL` paths, `Buffer` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `link` creates a hard link whose contents match Node.
- Sync `linkSync` creates a hard link whose contents and inode behavior match Node where inode metadata is available.
- Missing source paths reject or throw in both implementations.
- Existing destination paths reject or throw in both implementations.
- Directory hard links remain platform/filesystem dependent and are not asserted as portable conformance.

## Known Gaps

| Behavior               | Node oracle                                                             | Current Vooya FS behavior                                                                               | Reason                                                                                    | Follow-up                   |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields    | Rejects or throws with Node-style `code`, `syscall`, `path`, and `dest` | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs       | Node accepts strings, Buffers, and file URLs                            | Type surface currently accepts string paths only                                                        | Path input expansion is deferred globally                                                 | API surface expansion       |
| Windows inode metadata | Node exposes platform-specific stat fields                              | Vooya FS stat inode fields are limited on Windows                                                       | Stats parity is tracked by the stat rollout                                               | Platform parity             |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `link` is a single metadata syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that hard-link support depends on filesystem and platform.
- Docs must document unsupported path inputs.
- Docs must keep the error object known gap visible until fixed.
