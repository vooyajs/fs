# writeFile SDD

## Scope

- Primary oracle: `node:fs/promises.writeFile`.
- Secondary oracle: `node:fs.writeFileSync` for the already exported sync API.
- Callback-style `node:fs.writeFile` is out of scope for the initial production target.
- `appendFile` uses the same Rust source file but is a separate exported API and is covered by its own rollout item later.

## Node Oracle and Supported Surface

- Supported Vooya FS path input today: `string`.
- Supported data input today: `string` and `Buffer`.
- Supported encodings: `utf8`, `utf-8`, `ascii`, `latin1`, `binary`, `base64`, `base64url`, and `hex`.
- Supported flags are a subset of Node write flags: `w`, `wx`, `a`, and `ax`.
- Supported mode behavior: numeric `mode` on Unix-like platforms.
- Unsupported Node surface for this SDD: `AbortSignal`, file handles, typed arrays other than `Buffer`, `DataView`, `URL` paths, `Buffer` paths, and callback API shape.

## Functional Matrix

- Promise string writes match Node filesystem side effects.
- Promise Buffer writes match Node byte-for-byte.
- Promise encoded string writes match Node for representative supported encodings.
- Sync string and Buffer writes match Node where Vooya FS exposes `writeFileSync`.
- `flag: "wx"` rejects when the destination already exists in both implementations.
- Missing parent directories reject in both implementations.
- Mode is checked on Unix-like platforms with process umask tolerance.
- Creation mode respects umask and writing an existing file does not change its mode.
- Odd-length and invalid-trailing hex strings match Node's string encoding behavior.
- Unsupported flags reject without modifying the destination.

## Known Gaps

| Behavior                                                         | Node oracle                                | Current Vooya FS behavior                                                                                      | Reason                                                                                    | Follow-up                        |
| ---------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- | --------------------- |
| Error object fields for missing parent / existing file with `wx` | Rejects with `code`, `syscall`, and `path` | Message contains Node-like text, but N-API error exposes `code: "GenericFailure"` and omits `syscall` / `path` | Runtime error construction does not yet map filesystem metadata into Node-style JS errors | Runtime error compatibility      |
| `AbortSignal` option                                             | May abort pending writes with `AbortError` | Not supported                                                                                                  | Promise-first target has not accepted abort semantics yet                                 | API surface expansion            |
| TypedArray / DataView data                                       | Accepted by Node                           | Type surface currently accepts `string                                                                         | Buffer`                                                                                   | Data input expansion is deferred | API surface expansion |
| `Buffer` and `URL` paths                                         | Accepted by Node                           | Type surface currently accepts string paths only                                                               | Path input expansion is deferred globally                                                 | API surface expansion            |

## Performance Metrics

- Report small string, medium string, large string, and medium Buffer writes.
- Use unique destination files per sample so write setup does not pollute measured API behavior.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `writeFile` is promise-first and callback-style APIs are deferred.
- Docs must document supported data and path input limits.
- Docs must keep the error object gap visible and describe current hex and mode behavior.
- Docs should expose local report parameters when generated performance numbers are published.
