<h1 align="center">Vooya FS</h1>

<p align="center">
  <strong>Native batch filesystem operations for Node.js, powered by Rust.</strong>
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> ·
  <a href="https://github.com/vooyajs/fs">Repository</a> ·
  <a href="https://vooyajs.com/">Vooya</a> ·
  <a href="https://vooyajs.github.io/vooya-lab/">Vooya Lab</a>
</p>

Vooya FS is the continuation of **Rush-FS** under the Vooya project. It keeps a
Node-compatible filesystem surface where that compatibility is useful, and adds
bounded batch operations for workloads where one native Rust call can replace
thousands of JavaScript-to-filesystem round trips.

It is not intended to make every `node:fs` call faster. Tiny operations such as
`existsSync` are normally best left to Node. Vooya FS focuses on large directory
walks, globbing, recursive copy/removal, and combined traversal + metadata work.

> [!IMPORTANT]
> The `@vooya/fs` rename and the APIs documented on this branch are under
> development. No npm package is published by this change.

## The boundary

```text
application code
      │
      ├── tiny / one-off operation ───────────────→ node:fs
      │
      └── recursive or batch operation
                    │ one N-API call
                    ▼
              Rust traversal engine
                    │ parallel walk, filter, metadata, I/O
                    ▼
              one batched JS result
```

This is the same boundary-first idea used by Vooya on the web: keep the host
application and its ecosystem, then move a measured, self-contained workload
behind a typed Rust boundary. Vooya FS targets Node through stable Node-API;
Vooya components target browsers through WebAssembly. Neither project claims
that Rust or WASM makes ordinary host work universally faster.

## Example: scan once

`scan` combines recursive traversal, glob filtering, and metadata collection.
It is a Vooya FS extension rather than a Node compatibility API.

```ts
import { scan } from '@vooya/fs'

const sources = await scan('./packages', {
  include: ['**/*.{ts,tsx,rs}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  skipHidden: true,
  concurrency: 4,
})

for (const source of sources) {
  console.log(source.path, source.size, source.mtimeMs)
}
```

On the local Apple M4 Pro / Node 22.22 development benchmark, scanning a fixture
with 2,728 files and 341 directories took about **10.7 ms** with Vooya FS versus
**34.0 ms** for recursive `node:fs.readdir` followed by `lstat` calls. On a tiny
8-file fixture, Node was faster. The scale boundary is part of the API story,
not a footnote.

The existing `readFile(..., { lines })` extension shows the same fusion principle:
selecting the first 100 lines of a 16 MB text file took about **0.08 ms**, versus
**17.36 ms** for Node reading, decoding, splitting, and slicing the whole file. This
is an API-shape advantage, not evidence that every single-file read is 200x faster.

## Node-aligned operations

```ts
import { cp, glob, readdir, rm } from '@vooya/fs'

const entries = await readdir('./node_modules', {
  recursive: true,
  withFileTypes: true,
})

const manifests = await glob('**/package.json', {
  cwd: './node_modules',
  concurrency: 4,
})

await cp('./cache', './cache-copy', { recursive: true, concurrency: 4 })
await rm('./cache-copy', { recursive: true, force: true, concurrency: 4 })
```

The package also exposes promise and sync variants for `access`, `appendFile`,
`chmod`, `chown`, `copyFile`, `exists`, `link`, `lstat`, `mkdir`, `mkdtemp`,
`readFile`, `readlink`, `realpath`, `rename`, `rmdir`, `stat`, `symlink`,
`truncate`, `unlink`, `utimes`, and `writeFile`.

Compatibility is deliberately scoped. Current paths are strings, callback APIs
are not provided, and some advanced Node options remain unsupported. See the
[API documentation](./docs/content/api/index.mdx) and conformance SDDs under
[`test/conformance`](./test/conformance) for exact boundaries.

## Native first; WASM optional later

The production path remains Rust compiled as a Node-API native addon:

- native code has direct operating-system filesystem semantics;
- Rayon and walker libraries use real host threads;
- Node-API keeps the JavaScript ABI stable across supported Node versions.

WASI remains a possible explicit portability package, not an automatic fallback.
The current code has Unix-specific permission, ownership, symlink, and timestamp
semantics that cannot be silently represented by a generic WASI build. A WASI
package must pass its declared conformance suite and throw for unsupported
capabilities before it can be considered.

A reproducible Node 24.20 probe under [`experiments/node-wasi`](./experiments/node-wasi)
measured the native `scanSync` path at **9.86 ms** versus **15.96 ms** for a
count-only WASI traversal on the same 2,728-file tree. The module was instantiated
once, and the comparison favors WASI because it returns one integer while native
returns sorted metadata. WASM is useful here for portability/isolation, not as the
default performance path.

## Development

Requirements: Node.js 22 or 24, pnpm, and a current stable Rust toolchain.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
cargo clippy --all-targets --all-features -- -D warnings
corepack pnpm test
corepack pnpm doc:build
```

Run evidence-oriented benchmarks with:

```bash
corepack pnpm perf:fs scan --iterations 10 --warmup 2 --json .perf/scan.json
```

Performance output is evidence, not a test assertion. Reports record runtime,
fixture scale, samples, wall-clock summaries, and memory deltas.

## Migration from Rush-FS

The canonical package is `@vooya/fs`; the Rust crate and native binary are named
`vooya_fs` and `vooya-fs`. The previous `@rush-fs/core` and `rush-fs` releases
remain installable, but are deprecated on npm with a direct migration message.

npm deprecation is a warning, not a package redirect. We intentionally do not
publish a compatibility wrapper: the legacy packages support Node.js 18, while
`@vooya/fs` starts at Node.js 22, so silently forwarding would turn a patch update
into a runtime requirement change.

## Project relationship

- [Vooya](https://github.com/vooyajs/vooya) owns the browser component compiler,
  runtime contracts, and framework adapters.
- [Vooya Lab](https://github.com/vooyajs/vooya-lab) demonstrates measured Rust,
  WASM, and host-framework boundaries.
- [Vooya FS](https://github.com/vooyajs/fs) applies the same evidence-gated
  boundary design to Node filesystem workloads with a native Rust runtime.

## License

MIT
