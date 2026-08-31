# chmod SDD

## Scope

- Primary oracle: `node:fs/promises.chmod`.
- Secondary oracle: `node:fs.chmodSync` for the already exported sync API.
- Callback-style `node:fs.chmod` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported mode input today: numeric mode bits.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unix behavior sets mode bits using the platform permission model.
- Windows behavior is intentionally limited in the current implementation.
- Unsupported Node surface for this SDD: string mode values, `URL` paths, `Buffer` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `chmod` changes file mode bits like Node on Unix.
- Promise `chmod` changes directory mode bits like Node on Unix.
- Sync `chmodSync` changes file mode bits like Node on Unix.
- Missing paths reject or throw in both implementations.
- Windows tests are limited to existence/error behavior because mode-bit parity is not implemented in Vooya FS v1.

## Known Gaps

| Behavior                | Node oracle                                                     | Current Vooya FS behavior                                                                                                  | Reason                                                                                    | Follow-up                   |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields     | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text for missing paths, but N-API exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs        | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                                           | Path input expansion is deferred globally                                                 | API surface expansion       |
| String mode input       | Node accepts numeric and string mode values                     | Type surface currently accepts numbers only                                                                                | Mode parsing is deferred until broader Node input parity                                  | API surface expansion       |
| Windows chmod semantics | Node can update readonly-related permissions                    | Vooya FS currently validates existence and otherwise no-ops on non-Unix platforms                                          | Cross-platform chmod parity is intentionally minimal in v1                                | Platform parity             |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `chmod` is a single metadata mutation syscall; correctness and platform semantics are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that numeric mode values are the supported Vooya FS surface.
- Docs must document Windows limitations and unsupported path/string mode inputs.
- Docs must keep the error object known gap visible until fixed.
