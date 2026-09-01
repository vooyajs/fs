# realpath SDD

## Scope

- Primary oracle: `node:fs/promises.realpath`.
- Secondary oracle: `node:fs.realpathSync` for the already exported sync API.
- Callback-style `node:fs.realpath` and `realpath.native` are out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return type: promise resolves with a canonical absolute path string; sync returns a canonical absolute path string.
- Supported behavior: resolve `.`, `..`, and symlinks; fail when the path or symlink target does not exist.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, `encoding` options including `encoding: "buffer"`, callback API shape, `realpath.native`, legacy cache option, and exact Node error object metadata.

## Functional Matrix

- Promise `realpath` resolves relative paths like Node.
- Promise `realpath` resolves symlinks to the target path like Node.
- Sync `realpathSync` resolves paths like Node.
- Missing paths reject or throw in both implementations.
- Broken symlink paths reject or throw in both implementations.

## Known Gaps

| Behavior                           | Node oracle                                                     | Current Vooya FS behavior                                                                                                 | Reason                                                                                    | Follow-up                   |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields                | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text for missing paths, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs                   | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                                          | Path input expansion is deferred globally                                                 | API surface expansion       |
| Encoding option                    | Node can return a Buffer when `encoding: "buffer"`              | Vooya FS always returns a string                                                                                          | Encoding option is not part of the current Vooya FS surface                               | API surface expansion       |
| `realpath.native` and cache option | Node exposes additional realpath variants/options               | Vooya FS exports only `realpath` and `realpathSync`                                                                       | Promise-first top-level API is the current compatibility target                           | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `realpath` resolution depends on filesystem topology and symlink depth; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that `realpath` resolves symlinks and fails for missing targets.
- Docs must document unsupported path inputs, encoding option, `realpath.native`, and legacy cache option.
- Docs must keep the error object known gap visible until fixed.
