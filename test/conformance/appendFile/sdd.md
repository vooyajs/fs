# appendFile SDD

## Scope

- Primary oracle: `node:fs/promises.appendFile`.
- Secondary oracle: `node:fs.appendFileSync` for the already exported sync API.
- Callback-style `node:fs.appendFile` is out of scope for the initial production target.
- `appendFile` shares Vooya FS write option handling with `writeFile`, but it is an exported API and has its own conformance coverage.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported data input today: `string` and `Buffer`.
- Supported options today: `encoding`, numeric `mode`, and `flag`.
- Supported behavior: append to existing files, create missing files, and honor exclusive append flags.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, TypedArray/DataView data, `AbortSignal`, `flush`, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `appendFile` appends string data like Node.
- Promise `appendFile` creates missing files like Node.
- Promise `appendFile` honors representative encodings like Node.
- Sync `appendFileSync` appends Buffer data like Node.
- Exclusive append flags reject existing files in both implementations.
- Missing parent directories reject or throw in both implementations.

## Known Gaps

| Behavior               | Node oracle                                                       | Current Vooya FS behavior                                                                                                | Reason                                                                                    | Follow-up                   |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields    | Rejects or throws with Node-style `code`, `syscall`, and `path`   | Message contains Node-like text for common cases, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs       | Node accepts strings, Buffers, and file URLs                      | Type surface currently accepts string paths only                                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Additional data inputs | Node accepts Buffer, TypedArray, DataView, and string data        | Vooya FS currently accepts string and Buffer only                                                                        | N-API type surface is narrower than Node                                                  | API surface expansion       |
| Modern write options   | Node supports options such as `signal` and newer `flush` behavior | Vooya FS currently supports `encoding`, `mode`, and `flag`                                                               | Broader write option parity is deferred                                                   | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- Single-file append is already documented as on par with Node; conformance value is higher than adding another microbenchmark here.

## Docs Alignment

- Docs must state that `appendFile` creates the file when missing and supports string/Buffer data.
- Docs must document unsupported path/data inputs and modern write options.
- Docs must keep the error object known gap visible until fixed.
