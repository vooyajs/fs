# mkdtemp SDD

## Scope

- Primary oracle: `node:fs/promises.mkdtemp`.
- Secondary oracle: `node:fs.mkdtempSync` for the already exported sync API.
- Callback-style `node:fs.mkdtemp` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS prefix input today: `string`.
- Supported return type: promise resolves with the created directory path; sync returns the created directory path.
- Supported behavior: append a unique six-character suffix to the prefix and create that directory.
- Unsupported Node surface for this SDD: `Buffer` prefix, `URL` prefix, `encoding` option, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `mkdtemp` creates a directory whose path starts with the prefix like Node.
- Promise `mkdtemp` creates unique directories across repeated calls.
- Sync `mkdtempSync` creates a directory whose path starts with the prefix like Node.
- Missing parent directories reject or throw in both implementations.
- Prefix semantics match Node: the prefix is used literally, so callers must include a trailing separator when the random suffix should be a child of a directory.

## Known Gaps

| Behavior                | Node oracle                                                     | Current Vooya FS behavior                                                                                                   | Reason                                                                                    | Follow-up                   |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields     | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text for missing parents, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like prefix inputs | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string prefixes only                                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| `encoding` option       | Node can return Buffer output when `encoding: "buffer"`         | Vooya FS always returns a string                                                                                            | Encoding option is not part of the current Vooya FS surface                               | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `mkdtemp` combines random suffix generation and directory creation; correctness, uniqueness, and error semantics are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state the literal prefix behavior and cleanup responsibility.
- Docs must document unsupported prefix inputs and encoding option.
- Docs must keep the error object known gap visible until fixed.
