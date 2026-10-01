# Competitor benchmark provenance

This suite adapts overlapping workloads from upstream benchmarks. It does not
copy their published timing numbers or claim to reproduce their hardware results.
The original scripts and full MIT notices are preserved in `upstream/` as `.txt`
files for reference; they are not executed or typechecked.

## Pinned upstream sources

- fdir commit `790c182eb54809ea7bc14f1bcb40acce89506bb4`:
  [glob benchmark](https://github.com/thecodrr/fdir/blob/790c182eb54809ea7bc14f1bcb40acce89506bb4/benchmarks/glob-benchmark.ts),
  [recursive crawler benchmark](https://github.com/thecodrr/fdir/blob/790c182eb54809ea7bc14f1bcb40acce89506bb4/benchmarks/benchmark.js).
  Copyright 2023 Abdullah Atta; MIT notice in `upstream/fdir-LICENSE.txt`.
- tinyglobby commit `d9f76e12a99902e6a564bbc43dc6e7c84978a5c2`:
  [benchmark](https://github.com/SuperchupuDev/tinyglobby/blob/d9f76e12a99902e6a564bbc43dc6e7c84978a5c2/benchmark/bench.ts),
  [fixture setup](https://github.com/SuperchupuDev/tinyglobby/blob/d9f76e12a99902e6a564bbc43dc6e7c84978a5c2/benchmark/setup.ts).
  Copyright (c) 2024 Madeline Gurriarán; MIT notice in `upstream/tinyglobby-LICENSE.txt`.
- Real fixture: [typescript-eslint commit 338fad9](https://github.com/typescript-eslint/typescript-eslint/tree/338fad98047cf80b88e2090c85dab9def3e2e782).
  Downloaded source archive only; no dependencies installed and no fixture code
  executed. Its LICENSE remains in the extracted checkout. Fixture files are
  ignored under `.perf/`; the repository does not redistribute that source tree.

Upstream script revisions and measured npm versions are separate: the workloads
come from the pinned scripts, while the report identifies the published package
versions actually run. The lockfile fixes their transitive dependencies.

## Adaptations needed for equivalent work

| Workload                   | Origin           | Adaptation                                                                                                                                                                                                        |
| -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**/*`                     | tinyglobby       | Return files AND directories in every library; upstream defaults mix files-only and all entries. No sorting required.                                                                                             |
| `packages/*/tsconfig.json` | tinyglobby       | Preserve the pattern and real repository. Measure sync as well as async. Vooya currently delegates this non-globstar directory wildcard to Node.                                                                  |
| `**/*.js`                  | fdir             | Use the same pattern in both modes, relative strings throughout, dot:false throughout. Original script mixes sync patterns and returns Dirents for one competitor.                                                |
| Recursive readdir          | fdir             | Return relative paths for files AND directories, including hidden entries. Use the pinned source tree rather than an installation-dependent node_modules tree. Only compare Node readdir, fdir and Vooya readdir. |
| Four extension patterns    | Vooya supplement | Exercise shared traversal on the same fixtures; not attributed to an upstream benchmark.                                                                                                                          |
| Tiny and wide fixtures     | Vooya supplement | Add small-input cost and flat-directory fan-out coverage; not claimed to be upstream fixtures.                                                                                                                    |

All glob cases ignore dot entries, do not apply gitignore rules, and return
unsorted relative path strings for matching files and directories. Unsupported
fixture symlinks or special files abort the run, so differing follow-link defaults
cannot silently change work. A directory named `folder.js` and hidden fixtures
exercise the output contract. Node is a competitor, not the sole correctness
oracle: an independent manifest selects expected paths for these simple patterns.
Every warmup and measured sample must match exactly and contain no duplicates.
Only slash spelling and trailing directory slash are normalized for validation.
The root `.` is excluded by the fdir adapter inside timing. Output normalization
and equality checks are excluded from timing; the result contract permits the
libraries' path-separator/trailing-slash conventions. Application-specific
canonicalization costs would need a separate end-to-end benchmark.

## Reproduction

From the repository root, prepare the exact source fixture once:

```sh
mkdir -p .perf/competitors/typescript-eslint
curl --fail --location --output .perf/competitors/typescript-eslint.tar.gz \
  https://codeload.github.com/typescript-eslint/typescript-eslint/tar.gz/338fad98047cf80b88e2090c85dab9def3e2e782
tar -xzf .perf/competitors/typescript-eslint.tar.gz \
  -C .perf/competitors/typescript-eslint --strip-components=1
pnpm install --frozen-lockfile
pnpm build
pnpm perf:competitors --fixture .perf/competitors/typescript-eslint \
  --output .perf/competitors-node22.json
npm exec --yes --package=node@24.21.0 -- node --expose-gc \
  scripts/benchmark-competitors.mjs --fixture .perf/competitors/typescript-eslint \
  --output .perf/competitors-node24.json
```

Use Node 22.22.0 for the first run to reproduce the recorded runtime. The fixture
manifest (relative paths, file kinds and byte sizes) is verified against its
recorded SHA-256 before measurement; an existing dirty extraction is rejected.
No CPU governor, system cache or power settings are changed. Do not run builds,
tests or other benchmarks during timing. Defaults: two warmups, ten samples,
rotating library order, GC before timing. Matchers/crawlers are constructed for
each call; caller-created reusable glob caches are not benchmarked. Warm OS cache
and library-internal warm caches are allowed. Sync calls are timed without an
`await`; async iterators are fully collected. File fixture creation and validation
are outside timing. API routing instrumentation is restored before timing.

Raw evidence includes median/p90 latency, process CPU time (including native
workers), and before/after RSS deltas. RSS deltas are NOT peak memory; all libraries
share one process. Startup/import latency, streaming first-result latency,
event-loop delay, peak memory, cold-cache I/O, metadata-heavy scan, symlinks,
permission races and Rust-only engines are not measured by this suite. No timing
assertions run in CI. `suite.spec.ts` tests correctness of the comparison adapters.
