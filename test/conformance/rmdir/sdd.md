# rmdir SDD

## Scope

- Primary oracle: `node:fs/promises.rmdir`.
- Secondary oracle: `node:fs.rmdirSync` for the already exported sync API.
- Callback-style `node:fs.rmdir` is out of scope for the initial production target.
- Recursive directory removal via deprecated `rmdir({ recursive: true })` is out of scope; use `rm({ recursive: true })`.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported behavior: remove an empty directory and fail for non-empty directories, file paths, and missing paths.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, options object, callback API shape, deprecated recursive rmdir behavior, and exact Node error object metadata.

## Functional Matrix

- Promise `rmdir` removes an empty directory like Node.
- Sync `rmdirSync` removes an empty directory like Node.
- Non-empty directories reject or throw in both implementations.
- File paths reject or throw in both implementations.
- Missing paths reject or throw in both implementations.

## Known Gaps

| Behavior            | Node oracle                                                     | Current Vooya FS behavior                                                                                                | Reason                                                                                    | Follow-up                   |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text for common cases, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs    | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Options object      | Node still accepts legacy/deprecated options                    | Vooya FS exports no `rmdir` options; recursive removal is covered by `rm`                                                | Keep deprecated recursive rmdir out of the promise-first target                           | Non-goal                    |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `rmdir` is a single metadata mutation syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that `rmdir` only removes empty directories and `rm` covers recursive removal.
- Docs must document unsupported path inputs and options object.
- Docs must keep the error object known gap visible until fixed.
