# Full public API comparison contract

This suite covers all 26 exported operation families, in both sync and Promise
forms. `Stats` and `Dirent` are result types; `constants` is not an operation.
Export enumeration is tested so an added API cannot silently disappear from the
coverage matrix. This is a success-path performance suite, not a replacement for
the Node conformance tests or evidence for every option.

## Reproduce

The official [benchmark hub](https://rush-fs-docs.vercel.app/benchmarks) documents
`pnpm perf:matrix --node22 /path/to/node22 --node24 /path/to/node24 --output .perf/reproduction`,
which verifies runtimes and runs all three suite families sequentially. It rejects
existing report files and mismatched fixture manifests.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:competitor-contract
pnpm perf:all-apis --output docs/public/evidence/all-apis-node22.json
# Select Node 24.21.0 in your version manager, then run:
pnpm perf:all-apis --output docs/public/evidence/all-apis-node24.json
node scripts/render-all-api-evidence.mjs
```

Use `--apis readFile,writeFile` for focused work. `--smoke --samples 2 --warmups 1`
uses reduced fixtures for debugging; never publish it as full evidence. Run Node
versions sequentially with no competing builds/tests. Full runs are manual; CI
executes the reduced adapter contract with no speed threshold.

## Peers and what their columns mean

These are original adapters, not copied upstream benchmark code. The earlier
[fdir/tinyglobby suite](../competitors/SOURCES.md) supplies the crawl adapters.
Exact installed versions are in the lockfile and every raw report.

| Library           | APIs used                                                         | Interpretation and primary source                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node              | `node:fs` sync; `node:fs/promises` async                          | Native runtime baseline; async glob is fully collected.                                                                                                                          |
| fs-extra          | Common fs methods; `copy`, `remove`, `pathExists`                 | Basic methods are Node/graceful-fs wrappers; tree copy is its copy algorithm. [Project](https://github.com/jprichardson/node-fs-extra)                                           |
| graceful-fs       | Sync fs methods; callback methods promisified once outside timing | EMFILE handling/compatibility wrapper, not an independent filesystem engine. [Project](https://github.com/isaacs/node-graceful-fs)                                               |
| rimraf            | `rimraf` and explicit `manual`                                    | Default selects Node native on this macOS/runtime; manual is separately shown. No glob expansion. [Project](https://github.com/isaacs/rimraf)                                    |
| mkdirp            | `mkdirp` and explicit `mkdirpManual`                              | Default uses native recursive mkdir on this runtime; manual is separately shown. [Project](https://github.com/isaacs/node-mkdirp)                                                |
| copy-file         | `copyFile` / `copyFileSync`, no progress callback                 | Included only in the preserve workload: this library also restores timestamps/mode and requests an advisory clone. [Project](https://github.com/sindresorhus/copy-file)          |
| fdir / tinyglobby | Crawl, plus composed metadata collection for scan                 | Scan compositions include lstat, constructing every ScanEntry field and sorting within timing; these are not native scan methods.                                                |
| fast-glob / glob  | Shared glob adapter                                               | Same relative path strings, matching files AND directories.                                                                                                                      |
| Vooya             | Public package entry                                              | Native or Node fallback is checked outside timing. `vooya-c4` explicitly requests four traversal workers. Sync cp/rm still delegate to Node and ignore this acceleration option. |

For ordinary syscalls there are no extra independent algorithms hidden behind
fs-extra/graceful-fs. They are included to answer the migration-cost question, not
to multiply apparent competitors or justify claims of beating Rust libraries.

## Equal work and measurement

- All operations: two warmups, ten samples per library/case/runtime, cyclic order
  rotates per case and iteration; public API and result materialization timed.
  Sync has no artificial await. Async batches use the same maximum of eight
  operations in flight. The scheduler and retained results are included.
- Basic calls: one operation and a batch of 256 distinct paths. Repeating 256
  one-file calls is explicitly not a native batch API. `exists` also has a
  256-missing-path case; stat/lstat include separate symlink cases.
- File I/O: 4 KiB Buffer and mixed non-ASCII UTF-8 string cases, plus one 8 MiB
  Buffer operation. Copy defaults do not explicitly preserve times. The separate
  preserve-copy workload adds stat, advisory-clone copy, utimes and chmod for
  Node/Vooya/wrappers to match copy-file's result contract. Copy-file's additional
  checks remain timed. Forced-clone semantics are not tested.
- Trees: four or 1,000 files, 4 KiB each, distributed 25 per nested directory,
  with an empty directory. No links, dotfiles, ignores, errors or mutation races.
  The earlier competitor report supplies real-repository, wide-directory and
  multi-pattern glob cases; these new synthetic trees do not supersede it.
- Scan: all files and directories with path/name/kind/size/mode/mtime/depth,
  sorted by relative path. Node and peer pipelines include metadata and object
  creation; async metadata concurrency is eight. This is a composed workload,
  since Node and these peers expose no identical scan operation.
- Fresh equivalent fixtures before EVERY implementation/sample. Setup, cleanup,
  explicit GC and independent validation are outside timing. Full byte content,
  exact paths, file types, metadata and operation-specific effects are checked.
  rm must remove the tree; rename must remove the source; hard links must share
  an inode; symlinks must have the expected target. mkdir compares the resulting
  directories; peer-specific return values from mkdir/rm/copy are not compared.
- chmod changes 0644-like files to 0640; chown sets the current uid/gid (no
  privileged owner change); utimes sets fixed times; truncate shrinks to 1 KiB;
  rmdir removes empty directories. Access tests present files with F_OK.
- macOS/Linux permission/symlink cases are tested; the Windows contract explicitly
  skips POSIX ownership/permission and symlink-privilege workloads. Windows scan
  mode normalization differs, so its common contract checks the other fields.
- Cache is warm and all libraries are loaded in one process. There is no fsync or
  flush in any write workload. Read/write/copy times do not imply durable-storage
  throughput. Copy may exploit filesystem clones; logical MiB/s is not physical
  disk bandwidth. Tree setup and validation also warm the cache.
- CPU is process user + system time, including workers; RSS/heap/external are
  immediate deltas, not peaks or retained-memory measurements. Raw distributions
  and p90 are published. Tiny sub-millisecond differences are noisy; do not rank
  them as stable product advantages. No cold-cache, network filesystem, error,
  streaming, event-loop responsiveness or cross-platform speed claim is made.

## Validation

The AVA contract exercises every adapter/mode on reduced fixtures and verifies
native/Node routing. Negative tests reject no-op mutation implementations.
The full runner repeats validation for every warmup and measured sample. A failed
validation aborts the run; partial reports have `complete: false`. The renderer
rejects incomplete reports or unexpected sample counts.
