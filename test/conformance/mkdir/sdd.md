# mkdir SDD

## Scope

- Primary oracle: `node:fs/promises.mkdir`.
- Secondary oracle: `node:fs.mkdirSync` for the already exported sync API.
- Callback-style `node:fs.mkdir` is out of scope for the initial production target.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported options: `recursive?: boolean` and numeric `mode`.
- Supported return type: with `recursive: true`, resolves or returns the first directory path created, or `undefined`/`null` when no new directory was needed; without recursive, resolves or returns no value.
- Unsupported Node surface for this SDD: string mode values, `URL` paths, `Buffer` paths, callback API shape, and exact Node error object metadata.

## Functional Matrix

- Promise `mkdir` creates a single directory like Node.
- Promise `mkdir` with `recursive: true` creates nested directories like Node.
- Promise `mkdir` with `recursive: true` returns the first created path like Node when a directory was created.
- Promise `mkdir` with `recursive: true` returns no created path when the target already exists like Node.
- Sync `mkdirSync` matches Node for single and recursive directory creation.
- Existing directory without `recursive` rejects or throws in both implementations.
- Missing parent without `recursive` rejects or throws in both implementations.
- Recursive target file and file ancestor errors reject or throw in both implementations.
- Unix `mode` applies to created directories with the same umask constraints as Node.

## Known Gaps

| Behavior                           | Node oracle                                                     | Current Vooya FS behavior                                                                               | Reason                                                                                    | Follow-up                    |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| Error object fields                | Rejects or throws with Node-style `code`, `syscall`, and `path` | Message contains Node-like text, but N-API exposes `code: "GenericFailure"` and omits structured fields | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility  |
| Non-recursive success return value | Promise and sync APIs return `undefined`                        | Current N-API `Option<String>` mapping returns `null` when no directory path is returned                | Return-value mapping is shared with recursive first-created path handling                 | Runtime return compatibility |
| Path-like inputs                   | Node accepts strings, Buffers, and file URLs                    | Type surface currently accepts string paths only                                                        | Path input expansion is deferred globally                                                 | API surface expansion        |
| String mode input                  | Node accepts numeric and string mode values                     | Type surface currently accepts numbers only                                                             | Mode parsing is deferred until broader Node input parity                                  | API surface expansion        |

## Performance Metrics

- No dedicated local performance report in this rollout.
- Recursive `mkdir` is serial filesystem mutation; correctness, return values, and error semantics are higher-value than report-only microbenchmarks here.

## Docs Alignment

- Docs must state that `recursive: true` returns the first created path when a directory is created.
- Docs must document unsupported path and string mode inputs.
- Docs must keep the error object known gap visible until fixed.
