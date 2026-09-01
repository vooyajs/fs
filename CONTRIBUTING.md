# Contributing Guide

Welcome to contributing to vooya-fs! This document walks you through environment setup, project structure, implementing new APIs, writing tests, and opening a PR.

## Table of contents

- [Environment setup](#environment-setup)
- [Project structure](#project-structure)
- [Implementing a new API (full flow)](#implementing-a-new-api-full-flow)
- [Referencing Node.js source](#referencing-nodejs-source)
- [Writing Rust implementations](#writing-rust-implementations)
- [Performance: parallelism](#performance-parallelism)
- [Writing tests](#writing-tests)
- [Running benchmarks](#running-benchmarks)
- [Code style and commit conventions](#code-style-and-commit-conventions)
- [CI](#ci)

---

## Environment setup

### Required tools

| Tool        | Version             | Purpose                     |
| ----------- | ------------------- | --------------------------- |
| **Node.js** | 22 or 24            | Run tests and build scripts |
| **pnpm**    | >= 9                | Package manager             |
| **Rust**    | stable (via rustup) | Build native module         |
| **rustup**  | Latest              | Rust toolchain manager      |

### Initial setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd vooya-fs

# 2. Ensure Rust toolchain is ready
rustup default stable

# 3. Install Node.js dependencies
pnpm install

# 4. Build native module (debug mode for development)
pnpm build:debug

# 5. Run tests to confirm environment
pnpm test
```

> **Note:** Always use the scripts defined in `package.json`; do not run `cargo build` or `napi build` directly. napi-rs requires specific arguments to produce the correct `.node` binary and type declarations.

### Command reference

```bash
pnpm build:debug     # Dev build (no optimizations, fast compile)
pnpm build           # Release build (LTO, slower compile, faster output)
pnpm test            # Run all tests (AVA)
pnpm test:conformance # Run Node-aligned conformance tests
pnpm test:governance # Run branch and commit message rule tests
pnpm bench           # Run all benchmarks
pnpm perf:fs         # Run manual fs performance reports
pnpm perf:fs readdir # Run only readdir performance reports
pnpm docs:sync-perf  # Sync a JSON performance report into API docs
pnpm lint            # Lint (oxlint)
pnpm format          # Format all code (Prettier + cargo fmt + taplo)
```

---

## Project structure

```
vooya-fs/
├── src/                    # Rust source (core implementation)
│   ├── lib.rs              # Module registration entry
│   ├── types.rs            # Shared types (Dirent, Stats)
│   ├── utils.rs            # Utilities (file type checks, etc.)
│   ├── readdir.rs          # readdir / readdirSync
│   ├── stat.rs             # stat / lstat
│   ├── read_file.rs        # readFile / readFileSync
│   ├── write_file.rs       # writeFile / appendFile
│   ├── cp.rs               # cp / cpSync (recursive copy, concurrent)
│   └── ...                 # One file per API
├── __test__/               # Test files (TypeScript, AVA)
│   ├── readdir.spec.ts
│   ├── stat.spec.ts
│   └── ...
├── test/
│   ├── conformance/        # SDD-first Node-aligned behavior tests
│   │   └── <api>/sdd.md    # Per-API SDD before TDD
│   ├── fixtures/           # Shared fixture and scale builders
│   ├── governance/         # Branch and commit rule tests
│   └── performance/        # Manual speed and memory reports
├── benchmark/             # Performance benchmarks
│   ├── bench.ts            # Benchmark entry (auto-discovers and runs)
│   ├── readdir.ts          # readdir benchmarks
│   ├── glob.ts             # glob benchmarks
│   ├── stat.ts             # stat / lstat benchmarks
│   ├── read_file.ts        # readFile benchmarks (various sizes)
│   ├── write_file.ts       # writeFile / appendFile benchmarks
│   ├── copy_file.ts        # copyFile benchmarks
│   ├── exists.ts           # exists / access benchmarks
│   ├── mkdir.ts            # mkdir benchmarks
│   ├── rm.ts               # rm benchmarks (including concurrency)
│   └── cp.ts               # cp benchmarks (concurrency, tree/flat dirs)
├── reference/             # Node.js fs source reference
│   ├── fs.js               # Node.js main fs module
│   └── internal/fs/        # Node.js internal implementation
├── index.js                # napi-rs generated JS loader
├── index.d.ts              # napi-rs generated type declarations
├── Cargo.toml              # Rust dependencies
└── package.json            # Node.js project config
```

### Tech stack

- **napi-rs** — Rust ↔ Node.js bindings; JS glue is generated via macros
- **jwalk** — Parallel directory traversal (readdir recursive)
- **ignore** — Glob matching + .gitignore support
- **rayon** — Data parallelism (e.g. rm concurrency)
- **AVA** — Test framework (TypeScript, ESM)
- **mitata** — Micro-benchmark library

---

## Implementing a new API (full flow)

Using `symlink` as an example.

### Step 1: Reference Node.js source

In `reference/`, look up the Node.js implementation and understand:

1. **Signature:** Argument types, options, return value
2. **Edge behavior:** Empty path? Missing file? Permission errors?
3. **Error format:** Node uses messages like `ENOENT: no such file or directory, symlink 'xxx' -> 'yyy'`

```bash
# Find symlink in Node.js
# reference/fs.js — search for "function symlink"
# reference/internal/fs/promises.js — search for "async function symlink"
```

### Step 2: Add Rust source file

Create `symlink.rs` under `src/` following this pattern:

```rust
use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

// 1. Internal implementation (not exposed to JS)
fn symlink_impl(target: String, path: String) -> Result<()> {
    // Implementation...
    // Match Node.js error format:
    // "ENOENT: no such file or directory, symlink 'target' -> 'path'"
    Ok(())
}

// 2. Sync export
#[napi(js_name = "symlinkSync")]
pub fn symlink_sync(target: String, path: String) -> Result<()> {
    symlink_impl(target, path)
}

// 3. Async export (AsyncTask)
pub struct SymlinkTask {
    pub target: String,
    pub path: String,
}

impl Task for SymlinkTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        symlink_impl(self.target.clone(), self.path.clone())
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi(js_name = "symlink")]
pub fn symlink(target: String, path: String) -> AsyncTask<SymlinkTask> {
    AsyncTask::new(SymlinkTask { target, path })
}
```

### Patterns to follow

- **Options:** Use `#[napi(object)]` and `Option<T>` fields
- **Polymorphic return:** Use `Either<A, B>` (e.g. `string[] | Dirent[]`)
- **Error prefix:** Match Node.js style (`ENOENT:`, `EACCES:`, `EEXIST:`, etc.)
- **Platform differences:** Use `#[cfg(unix)]` / `#[cfg(not(unix))]`

### Step 3: Register the module

In `src/lib.rs`, add (alphabetically):

```rust
pub mod symlink;       // In mod declarations
pub use symlink::*;    // In use declarations
```

### Step 4: Build and verify

```bash
pnpm build:debug
```

After a successful build, `index.d.ts` is updated and the new function’s types are generated.

---

## Referencing Node.js source

The `reference/` directory holds key files copied from the Node.js repo:

| File                                | Content                                           |
| ----------------------------------- | ------------------------------------------------- |
| `reference/fs.js`                   | All fs API callback/sync implementations          |
| `reference/internal/fs/utils.js`    | Stats construction, validation, errors, constants |
| `reference/internal/fs/promises.js` | Promise-based implementations (for async APIs)    |
| `reference/internal/fs/dir.js`      | `opendir` / `Dir` implementation                  |
| `reference/internal/fs/watchers.js` | `watch` / `watchFile` implementation              |

Before implementing any API, search for the function name in these files and understand behavior and edge cases.

---

## Performance: parallelism

vooya-fs uses Rust’s parallelism for heavy operations. Common approaches:

### 1. jwalk — parallel directory walk

Used for `readdir` recursive:

```rust
use jwalk::{Parallelism, WalkDir};

let walk = WalkDir::new(path)
    .parallelism(Parallelism::RayonNewPool(concurrency));
```

### 2. rayon — data parallelism

Used for concurrent `rm`:

```rust
use rayon::prelude::*;

entries.par_iter().try_for_each(|entry| {
    remove_recursive(&entry.path(), opts)
})?;
```

### 3. ignore crate — parallel glob

Used for `glob`:

```rust
use ignore::WalkBuilder;

let mut builder = WalkBuilder::new(&cwd);
builder
    .overrides(overrides)
    .threads(concurrency);

builder.build_parallel().run(/* ... */);
```

### Guidelines

- Choose sensible default `concurrency` (e.g. 4 or auto); allow overrides
- For small workloads, parallelism overhead may dominate; validate with benchmarks
- Use `Arc<Mutex<Vec<T>>>` (or similar) to collect results; keep lock scope small

---

## Writing tests

### Location

One test file per API: `__test__/<api_name>.spec.ts`

For the SDD-first conformance workflow, new high-value API work also uses:

- `test/conformance/<api>/sdd.md` for API-specific SDD before TDD
- `test/conformance/<api>/*.spec.ts` for Node-aligned behavior tests
- `test/performance/<api>/*.bench.ts` for manual speed and memory reports

### Framework

[AVA](https://github.com/avajs/ava); TypeScript is compiled via `@oxc-node/core`. Tests run in ESM — use `import` only, not `require()`.

### Template

```typescript
import test from 'ava'
import { symlinkSync, symlink } from '../index.js'
import { existsSync, mkdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// Sync tests
test('symlinkSync: should create a symbolic link', (t) => {
  // ...
})

test('symlinkSync: should throw on non-existent target', (t) => {
  t.throws(() => symlinkSync('/no/such/path', dest), { message: /ENOENT/ })
})

// Async tests
test('symlink: async should create a symbolic link', async (t) => {
  await symlink(target, dest)
  t.true(existsSync(dest))
})

// Parity with node:fs (important)
test('symlinkSync: should match node:fs behavior', (t) => {
  const nodeResult = nodeFs.readlinkSync(link)
  const hyperResult = readlinkSync(link)
  t.is(hyperResult, nodeResult)
})
```

### Three kinds of tests

#### 1. Functional tests

Verify correct behavior for sync and async in normal cases.

#### 2. Parity tests

Call both `node:fs` and vooya-fs and compare results. Essential for API compatibility:

```typescript
import * as nodeFs from 'node:fs'
import { statSync } from '../index.js'

test('statSync: should match node:fs stat values', (t) => {
  const nodeStat = nodeFs.statSync('./package.json')
  const hyperStat = statSync('./package.json')

  t.is(hyperStat.size, nodeStat.size)
  t.is(hyperStat.mode, nodeStat.mode)
  t.is(hyperStat.isFile(), nodeStat.isFile())
  t.is(hyperStat.isDirectory(), nodeStat.isDirectory())
})
```

#### 3. Error handling tests

Assert error message format matches Node.js (`ENOENT`, `EACCES`, `EEXIST`, etc.):

### SDD and docs alignment

Before writing conformance tests for a high-value API, update `test/conformance/<api>/sdd.md` and compare it with the official docs page under `docs/content/api/`.

Each API SDD should include:

- Compatibility target and Node oracle
- Value hypothesis and performance boundary
- Functional matrix
- Scale matrix
- Performance metrics
- Docs Alignment section pointing to the relevant `docs/content/api/<api>.mdx`

If conformance tests or performance reports produce an important conclusion, update the docs in the same change. Examples include unsupported Node options, known compatibility gaps, break-even scale, tiny-case bridge overhead, or recommended concurrency guidance.

```typescript
test('should throw ENOENT on missing file', (t) => {
  t.throws(() => someSync('./no-such-file'), { message: /ENOENT/ })
})

test('async should throw ENOENT on missing file', async (t) => {
  await t.throwsAsync(async () => await someAsync('./no-such-file'), { message: /ENOENT/ })
})
```

### Running tests

```bash
pnpm test                        # All tests
npx ava __test__/stat.spec.ts    # Single file
```

---

## Running benchmarks

### Layout

Benchmarks live in `benchmark/`. Read-only operations (stat, readFile, exists) use [mitata](https://github.com/evanwashere/mitata) for micro-benchmarks; destructive or side-effectful ones (writeFile, copyFile, mkdir, rm) use manual iterations and `process.hrtime`, with test data recreated per run.

The SDD/TDD performance reports live in `test/performance/`. They are report-only and do not fail on speed or memory results. Use them to attach evidence to PRs for APIs where Vooya FS is expected to improve on Node.js.

### Existing benchmarks

| File            | APIs covered                                              | Mode   |
| --------------- | --------------------------------------------------------- | ------ |
| `readdir.ts`    | readdir (names / withFileTypes / recursive / concurrency) | mitata |
| `glob.ts`       | glob vs node-glob vs fast-glob                            | mitata |
| `stat.ts`       | stat / lstat / batch stat                                 | mitata |
| `read_file.ts`  | readFile (11B / 64KB / 4MB, Buffer / utf8)                | mitata |
| `exists.ts`     | exists / access / batch exists                            | mitata |
| `write_file.ts` | writeFile / appendFile (various sizes)                    | manual |
| `copy_file.ts`  | copyFile (11B / 64KB / 4MB)                               | manual |
| `mkdir.ts`      | mkdir (single / recursive / already exists)               | manual |
| `rm.ts`         | rm (flat / deep / tree + concurrency)                     | manual |

### Commands

```bash
pnpm bench              # All benchmarks
pnpm bench readdir      # Only readdir
pnpm bench stat
pnpm bench read_file
pnpm bench glob
pnpm perf:fs            # Manual fs speed + memory reports
pnpm perf:fs readdir    # Only readdir performance report
pnpm perf:fs readdir --iterations 10 --warmup 2 --json .perf/readdir.json
pnpm docs:sync-perf readdir --report .perf/readdir.json
```

### Adding a benchmark

Create `benchmark/<api_name>.ts`:

```typescript
import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import { someSync } from '../index.js'

group('Some API', () => {
  bench('Node.js', () => fs.someSync(args)).baseline()
  bench('Vooya FS', () => someSync(args))
})

group('Vooya FS Concurrency', () => {
  bench('Default', () => someSync(args)).baseline()
  bench('4 Threads', () => someSync(args, { concurrency: 4 }))
  bench('8 Threads', () => someSync(args, { concurrency: 8 }))
})

await run({ colors: true })
```

### Benchmark notes

- Use a **release build** (`pnpm build`), not `pnpm build:debug`
- Mark Node.js as `.baseline()` for comparison
- Prefer real-world data (e.g. `node_modules`) where useful
- mitata warms up automatically; for manual benches, run a warmup first
- For `test/performance/`, defaults are 2 warmup runs and 10 measured runs; override with `--warmup`, `--iterations`, `VOOYA_FS_PERF_WARMUP`, or `VOOYA_FS_PERF_ITERATIONS`
- Manual performance reports record wall-clock time plus `rss`, `heapUsed`, and `external`; generated docs use trimmed mean for time and average per-run memory deltas
- For `test/performance/`, default scales stop at `medium`; pass `--large` for the 156k-file fixture or `--extreme` for the manual stress fixture
- Performance reports should expose both wins and losses. Tiny cases may show Vooya FS losing because bridge overhead dominates.
- Use `--json <path>` when results should be reviewed or synced into API docs.

---

## Code style and commit conventions

### Rust

- Indent: 2 spaces (`rustfmt.toml`)
- Format: `pnpm format:rs` (same as `cargo fmt`)
- Lint: `cargo clippy` (also run in CI)
- `#![deny(clippy::all)]` is enabled in `lib.rs`

### TypeScript / JavaScript

- Format: `pnpm format:prettier`
- Rules: 120 chars, no semicolons, single quotes, trailing commas
- Lint: `pnpm lint` (oxlint)

### Submitting changes

```bash
git checkout -b feat/add-symlink

pnpm build:debug
pnpm test
pnpm test:conformance

pnpm format

git add .
git commit -m "✨ feat(symlink): add promise symlink support"

# Attach performance results in PRs for performance-sensitive APIs
pnpm build
pnpm perf:fs readdir --json .perf/readdir.json
pnpm docs:sync-perf readdir --report .perf/readdir.json
```

(husky validates branch names and commit messages, then lint-staged formats staged files on commit.)

### Branch names

Use lowercase kebab-case branch names:

- Development branches: `feat/<slug>`, `fix/<slug>`, `perf/<slug>`, `docs/<slug>`, `refactor/<slug>`, `chore/<slug>`, `build/<slug>`, `ci/<slug>`, `release/<slug>`
- Temporary test branches: `test-<original-branch>`, for example `test-feat/node-fs-conformance`
- Delete development and test branches after the PR is merged

### Commit messages

Commit messages are English and intentionally concise. Prefer describing the capability or behavior change, not tiny implementation trivia.

Format:

```text
[emoji] type(scope): concise English summary
```

Emoji is optional and, when used, goes at the start:

```text
✨ feat(glob): add promise conformance matrix
✅ test(readdir): cover recursive scale fixtures
⚡ perf(cp): add large tree memory report
📝 docs: clarify promise-first compatibility target
```

Allowed types: `feat`, `fix`, `test`, `perf`, `docs`, `refactor`, `build`, `ci`, `chore`, `release`.

API behavior changes must include an API scope, for example `feat(glob)`, `test(readdir)`, or `perf(cp)`. Non-API work may omit scope or use a tooling scope such as `build(husky)` or `chore(openspec)`.

Split commits by API and change type. Do not bundle unrelated API work into one commit.

### PR checklist

- [ ] New `.rs` file under `src/`
- [ ] Module registered in `src/lib.rs`
- [ ] `pnpm build:debug` passes with no warnings
- [ ] Tests in `__test__/` (functional + parity + error cases)
- [ ] `pnpm test` passes
- [ ] README.md and README.zh-CN.md Roadmap updated
- [ ] **Docs**: When adding or changing an API, add or update the corresponding page under `docs/content/api/` (see [Documentation](#documentation) and `.cursor/rules/docs-conventions.mdc`). For SDD/TDD work, compare `test/conformance/<api>/sdd.md` against the docs page and sync important conclusions. Run `pnpm bench` or `pnpm perf:fs <api> --json <path>` for the Performance section and use table(s) with at least Node.js `fs` as baseline.
- [ ] (If applicable) Benchmark added and results included in PR

---

## Documentation

- **Every supported API must have a doc page** under `docs/content/api/`. The docs site (Nextra) is in the `docs/` directory; run `pnpm doc:dev` from the repo root to preview.
- **When you add or change an API**, add or update the corresponding file (e.g. `docs/content/api/readdir.mdx`) and register it in `docs/content/api/_meta.js`. Each API page must include: **Basic usage**, **Methods** (signatures and options), **Performance** (data from `pnpm bench`, in table form, at least vs Node.js `fs`), and **Notes** (known issues, tips). See `.cursor/rules/docs-conventions.mdc` for the full convention.
- **Keep docs in sync**: If you change behavior or options, update the API doc and the README roadmap so the docs stay accurate.
- **Use SDD as a docs checkpoint**: For APIs with `test/conformance/<api>/sdd.md`, the SDD's Docs Alignment section is the minimum checklist for keeping official docs consistent with conformance and performance findings.

### Deploying the docs

The docs are deployed with **Vercel’s built-in Git integration** (no custom CI):

1. In [Vercel](https://vercel.com), import the GitHub repo.
2. Set **Root Directory** to `docs` (the Next.js app lives there).
3. Leave **Framework Preset** as Next.js; build/install commands are set in `docs/vercel.json` (pnpm).
4. Deploy. Every push to the connected branch will trigger a new build and deploy; previews are created for PRs if enabled.

To deploy elsewhere (e.g. Netlify, self-hosted), run `pnpm doc:build` and use the output in `docs/.next` (or run `pnpm doc:start` in a Node server). A custom CI job can run `pnpm doc:build` and upload artifacts if you need automation outside Vercel.

---

## CI

GitHub Actions on push/PR:

1. **Lint** — oxlint, `cargo fmt --check`, `cargo clippy`
2. **Build** — Cross-platform (macOS x64/arm64, Windows x64, Linux x64)
3. **Test** — Tests on macOS, Windows, Linux (Node 20 & 22)
4. **Publish** — Triggered by version tags; see [Release workflow](.github/workflows/Release.yml)

For local development, `pnpm build:debug` and `pnpm test` are enough; CI handles cross-platform checks.

### Release checklist (maintainers)

When cutting a new version (before running the Release workflow):

1. **Bump version** in both places (must stay in sync):
   - `package.json` → `"version": "x.y.z"`
   - `Cargo.toml` → `version = "x.y.z"`
   - npm does not allow re-publishing the same version; if a previous run partially published (e.g. 0.0.4 already on npm), bump to the next version (e.g. 0.0.5) and release again.
2. **Update [CHANGELOG.md](CHANGELOG.md):** move items from **\[Unreleased]** into a new `## [x.y.z] - YYYY-MM-DD` section, and add the version link at the bottom (`[x.y.z]: https://github.com/vooyajs/fs/compare/vA.B.C...vx.y.z`).
3. **Run Release:** push to `main`, then either **Actions → Release → Run workflow** or `git tag vx.y.z && git push origin vx.y.z`.
