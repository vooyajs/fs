# readlink SDD

## Scope

- Primary oracle: `node:fs/promises.readlink`.
- Secondary oracle: `node:fs.readlinkSync` for the already exported sync API.
- Callback-style `node:fs.readlink` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return type: promise resolves with the symlink target string; sync returns the symlink target string.
- Supported behavior: return the raw symlink target exactly as stored, not a resolved absolute path.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, `encoding` options including `encoding: "buffer"`, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `readlink` reads absolute symlink targets like Node.
- Promise `readlink` preserves relative symlink targets like Node.
- Sync `readlinkSync` reads symlink targets like Node.
- Missing paths reject or throw in both implementations.
- Non-symlink paths reject or throw in both implementations.

## Known Gaps

| Behavior            | Node oracle                                                     | Current Vooya FS behavior                                                                               | Reason                                                                                    | Follow-up                   |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs    | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                        | Path input expansion is deferred globally                                                 | API surface expansion       |
| Encoding option     | Node can return a Buffer when `encoding: "buffer"`              | Vooya FS always returns a string                                                                        | Encoding option is not part of the current Vooya FS surface                               | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `readlink` is a single metadata syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that `readlink` returns the raw stored target, not a resolved real path.
- Docs must document unsupported path inputs and encoding option.
- Docs must keep the error object known gap visible until fixed.
