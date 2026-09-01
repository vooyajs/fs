# symlink SDD

## Scope

- Primary oracle: `node:fs/promises.symlink`.
- Secondary oracle: `node:fs.symlinkSync` for the already exported sync API.
- Callback-style `node:fs.symlink` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string` for `target` and `path`.
- Supported type input today: optional string; on Windows the implementation handles `file`, `dir`, and `junction`, and on Unix it is ignored.
- Supported behavior: create symlinks and store relative targets as-is.
- Unsupported Node surface for this SDD: `Buffer` paths, `URL` paths, strict type union typing/validation, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `symlink` creates file symlinks like Node where the platform permits symlink creation.
- Promise `symlink` stores relative targets like Node.
- Sync `symlinkSync` creates directory symlinks like Node where the platform permits symlink creation.
- Existing link paths reject or throw in both implementations.
- Missing parent directories reject or throw in both implementations.
- Windows tests must be guarded because symlink privileges vary by environment.

## Known Gaps

| Behavior                   | Node oracle                                                             | Current Vooya FS behavior                                                                                                | Reason                                                                                    | Follow-up                   |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| Error object fields        | Rejects or throws with Node-style `code`, `syscall`, `path`, and `dest` | Message contains Node-like text for common cases, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility |
| Path-like inputs           | Node accepts strings, Buffers, and file URLs                            | Type surface currently accepts string paths only                                                                         | Path input expansion is deferred globally                                                 | API surface expansion       |
| Type typing and validation | Node documents `type` as `file`, `dir`, or `junction`                   | Type surface currently accepts any string and runtime validation is minimal                                              | Type narrowing and validation are deferred                                                | API surface expansion       |

## Performance Metrics

- No dedicated local performance report in this rollout.
- `symlink` is a single metadata mutation syscall; behavior, platform guards, and error parity are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state platform privilege concerns for symlink creation, especially on Windows.
- Docs must document unsupported path inputs and current type validation gap.
- Docs must keep the error object known gap visible until fixed.
