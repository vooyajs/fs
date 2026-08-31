# exists SDD

## Scope

- Primary oracle: `node:fs.existsSync` boolean existence semantics.
- Secondary oracle: `node:fs/promises.access(path, F_OK)` for promise-style existence checks.
- Vooya FS `exists` is an extension API; Node does not expose a promise-returning `fs.promises.exists`.
- Callback-style `node:fs.exists` is deprecated and out of scope.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported return type: promise resolves with `boolean`; sync returns `boolean`.
- Supported behavior: return `true` for existing files and directories; return `false` for missing paths and broken symlinks.
- Unsupported Node surface for this SDD: `URL` paths and `Buffer` paths.

## Functional Matrix

- Promise `exists` returns `true` for existing files.
- Promise `exists` returns `true` for existing directories.
- Promise `exists` returns `false` for missing paths.
- Sync `existsSync` matches `node:fs.existsSync`.
- Symlink existence matches `node:fs.existsSync` where the platform can create symlinks.
- Broken symlinks return `false`, matching `node:fs.existsSync`.

## Known Gaps

| Behavior           | Node oracle                                                                                             | Current Vooya FS behavior                                    | Reason                                                    | Follow-up             |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | --------------------- |
| Promise entrypoint | Node has no `fs.promises.exists`; recommended patterns use `access`, `stat`, or direct operation errors | Vooya FS exposes promise `exists` as a convenience extension | This is intentional Vooya FS API surface, not Node parity | Documentation         |
| Path-like inputs   | Node `existsSync` accepts strings, Buffers, and file URLs                                               | Type surface currently accepts string paths only             | Path input expansion is deferred globally                 | API surface expansion |

## Performance Metrics

- No dedicated local performance report in this rollout.
- Existing docs already call out the sync fast-path boundary; conformance value is higher than additional microbenchmarks here.

## Docs Alignment

- Docs must state that promise `exists` is a Vooya FS convenience API rather than a Node `fs.promises` API.
- Docs must state the race-condition caveat.
- Docs must document unsupported `Buffer` and `URL` path behavior.
