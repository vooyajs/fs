# readFile SDD

## Scope

- Primary oracle: `node:fs/promises.readFile`.
- Secondary oracle: `node:fs.readFileSync` for the already exported sync API.
- Callback-style `node:fs.readFile` is out of scope for the initial production target.
- Vooya FS extension: `options.lines` reads a line range when a text encoding is provided.

## Node Oracle and Supported Surface

- Public core path inputs: string, Buffer and file URL. The generated native binding accepts strings.
- Supported return modes: `Buffer` when no encoding is provided, `string` when encoding is provided.
- Supported encodings: `utf8`, `utf-8`, `ascii`, `latin1`, `binary`, `base64`, `base64url`, and `hex`.
- Supported flags are a subset of Node open flags: `r`, `rs`, `r+`, `rs+`, `a+`, `ax+`, `w+`, and `wx+`.
- AbortSignal, FileHandle and additional flags/encodings use the public Node route. Callback forms remain out of scope.

## Functional Matrix

- Promise Buffer reads match Node byte-for-byte.
- Promise text reads match Node for supported encodings.
- Sync Buffer and text reads match Node where Vooya FS exposes `readFileSync`.
- Directory reads reject in both implementations.
- Missing paths reject in both implementations.
- Vooya FS `lines` extension is tested separately against documented Vooya FS behavior, not Node.

## Known Gaps

| Behavior       | Node oracle        | Current Vooya FS behavior                                            | Reason                | Follow-up |
| -------------- | ------------------ | -------------------------------------------------------------------- | --------------------- | --------- |
| `lines` option | No Node equivalent | Vooya FS extension that returns a selected line range for text reads | Intentional extension | Docs only |

## Performance Metrics

- Report small text, medium text, large text, and large Buffer reads.
- Record Node/Vooya FS wall-clock ratio plus `rss`, `heapUsed`, and `external`.
- Performance remains report-only and must not fail conformance.

## Docs Alignment

- Docs must state that `readFile` is promise-first and callback-style APIs are deferred.
- Docs must describe `lines` as a Vooya FS extension, not Node compatibility.
- Docs must keep unsupported `AbortSignal`, `Buffer` path, and `URL` path behavior visible until implemented.
- Docs should expose local scale report parameters when generated performance numbers are published.

## Encoding parity regression coverage

`test/conformance/writeFile/encoding-parity.spec.ts` compares native sync and Promise
results against Node for encoding aliases/case, ASCII and Latin-1 UTF-16 truncation,
Base64 alphabets/padding, write/append encoding-string shorthand, and malformed
whole-file UTF-8 decoding. UTF-16LE/UCS-2 support and lone-surrogate preservation
at the JS-to-Rust string boundary remain unverified or unsupported.

Core missing-path errors now expose code/syscall/path/errno. Public routing, cancellation,
file URL/Buffer inputs and permission behavior are tested in `../public/batch.spec.ts`.

The public entry accepts `encoding: null` as the default Buffer mode, in both
sync and Promise forms, without mutating the options object.
