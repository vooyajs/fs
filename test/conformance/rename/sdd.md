# rename SDD

## Scope

- Primary oracle: `node:fs/promises.rename`.
- Secondary oracle: `node:fs.renameSync` for the already exported sync API.
- Callback-style `node:fs.rename` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string` for `oldPath` and `newPath`.
- Supported behavior: rename/move files and directories within the same filesystem, and overwrite existing files where the platform allows it.
- Supported return type: promise resolves with `undefined`; sync returns `undefined`.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, callback API shape, cross-device fallback copy/delete, and exact Node error object metadata.

## Functional Matrix

- Promise `rename` moves files like Node.
- Promise `rename` overwrites an existing file destination like Node where supported.
- Sync `renameSync` moves directories like Node.
- Missing source paths reject or throw in both implementations.
- Cross-device moves are not exercised because Node itself fails with `EXDEV`; fallback copy/delete belongs to userland or a separate API.

## Known Gaps

| Behavior              | Node oracle                                                             | Current Vooya FS behavior                                                                                                 | Reason                                                                                    | Follow-up                   |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields   | Rejects or throws with Node-style `code`, `syscall`, `path`, and `dest` | Message contains Node-like text for missing paths, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs      | Node accepts strings, Buffers, and file URLs                            | Type surface currently accepts string paths only                                                                          | Path input expansion is deferred globally                                                 | API surface expansion       |
| Cross-device fallback | Node fails with `EXDEV`; it does not copy/delete automatically          | Vooya FS also delegates to platform rename and does not provide fallback                                                  | This is aligned with Node; richer move behavior belongs in a separate helper              | Non-goal                    |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `rename` is a single metadata syscall; behavior and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state platform-dependent overwrite and cross-device behavior.
- Docs must document unsupported path inputs.
- Docs must keep the error object known gap visible until fixed.
