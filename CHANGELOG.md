# Changelog

All notable Vooya FS changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Reproducible competitor benchmark suite adapted from pinned fdir/tinyglobby
  workloads, with license notices, independent result validation, Node 22/24 raw
  evidence and a recursive readdir concurrency diagnostic.

- Public compatibility entry point with file URL/Buffer path handling for core batches,
  option-dependent Node execution paths, constants, result-aware TypeScript declarations,
  and an actual Promise-based glob batch that also supports async iteration.
- Node-oracle regression coverage for public exports, ESM imports, rooted exclusions,
  platform case rules, permissions, symlinks, overwrite behavior and callback options.

### Fixed

- `readdir`: filename encodings and Buffer names, empty/file roots, traversal failures,
  recursive symlinks, and the sync/Promise distinction for Dirent traversal.
- `glob`: wildcard prefixes, arrays/deduplication, cwd-rooted exclusions, parent paths,
  platform case rules and Node-compatible unreadable-directory handling.
- `scan` / `glob`: ignore-file rules take precedence over positive includes.
- `cp`: self/descendant/hardlink guards, overwrite precedence, destination inode
  replacement, directory modes, symlink handling and structured errors.
- `rm`: non-recursive directory rejection, retry eligibility and disappearance races.
- `readFile`: malformed UTF-8 replacement, preserved blank lines, inclusive line bounds
  without an extra line read, and structured I/O errors.
- `writeFile` / `appendFile`: encoding-string options, ASCII/Latin-1 UTF-16 truncation,
  Base64 alphabets/padding and case-insensitive encoding names.

### Performance

- Compatible native `glob` patterns share a traversal; workers collect results
  locally and merge once, with cross-walk deduplication only when needed.
- `writeFile` / `appendFile` borrow synchronous Buffer bytes and write async
  worker-owned snapshots directly, removing redundant payload copies while
  preserving entry-time snapshots and Buffer slice boundaries.
- Controlled public-entry Node 22/24 before/after evidence and reproduction
  instructions are included in the native overhead report, including small-input
  costs and the limits of local filesystem and RSS measurements.

### Compatibility policy

- The measured Rust fast paths remain focused on bulk work. Advanced options use
  Node explicitly as documented; their availability is not a performance claim.
- `cpSync` and `rmSync` use Node's existing native implementation. Windows copy/removal also
  use Node. No WASM or missing-native-installation fallback is introduced.
- Performance evidence measures the package entry under release builds on Node 22/24.

## [@vooya/fs 0.1.0] - 2026-09-02

### Added

- **`scan` / `scanSync`:** One native pass for rooted include/exclude matching,
  recursive traversal, ignore rules, optional directories, symlink policy, and
  metadata collection. Results are deterministic and sorted by relative path.
- **Performance evidence:** Added a scale-based `scan` benchmark and renamed report
  fields and environment variables from Rush-FS to Vooya FS.
- **Development gates:** Added repository-wide TypeScript checking, strict Clippy,
  and documentation builds to CI.

### Changed

- **Project identity:** Rush-FS became **Vooya FS**. The canonical npm
  package is `@vooya/fs`, the Rust crate is `vooya_fs`, and the native binary is
  `vooya-fs`. This release was published as `@vooya/fs@0.1.0`.
- **Positioning:** Documentation now describes a boundary-first batch engine rather
  than a universal `node:fs` drop-in or blanket performance replacement.
- **Concurrency:** Recursive operations with an explicit worker count use a bounded
  per-call pool; the default recursive read path can reuse the shared pool.
- **Traversal failures:** Recursive `readdir`, `glob`, and `scan` propagate walk and
  metadata failures instead of silently returning partial results.

### Fixed

- **`access`:** Unix checks use the operating system's `access(2)` semantics,
  including supplementary groups and filesystem ACL decisions.
- **`mkdir` / `writeFile`:** Creation modes respect the process umask; `writeFile`
  no longer changes permissions on an existing file.
- **`mkdir`:** Empty successful results now return `undefined` rather than `null`,
  matching Node and the declared API.
- **`readFile` / `writeFile`:** Unsupported flags now reject instead of silently
  falling back to default behavior.
- **`writeFile`:** Hex decoding follows Node behavior for odd and invalid trailing
  input.
- **`glob`:** Root-only patterns such as `*.txt` no longer match nested paths.
- **`rm`:** Broken symlinks can be removed; retries are limited to retryable errors
  and use Node-style linear delay.
- **`cp`:** Timestamp preservation now reports failed system calls.
- **Type declarations:** Async APIs generate concrete promise return types rather
  than `Promise<unknown>`.

## [@rush-fs/core 0.1.0] - 2026-03-05

### Changed

- **Package name:** Rush-FS moved from `rush-fs` to the scoped `@rush-fs/core`
  package. This historical release predates the Vooya FS migration.
- **glob:** `gitIgnore` defaulted to `false` to align with Node's glob behavior.

### Fixed

- Prefixed and recursive glob patterns without explicit `cwd` were corrected.
- Async `readFile(path, encoding)` returned decoded strings for string encoding
  arguments.

## [0.0.5]

- Republished Rush-FS with native platform packages correctly injected as optional
  dependencies.

## [0.0.4]

- Added the Nextra documentation site and installation troubleshooting.
- Fixed release ordering so platform packages were injected after N-API prepublish.

## [0.0.3] - historical

- Earlier Rush-FS releases remain in the original repository history.

---

[Unreleased]: https://github.com/vooyajs/fs/compare/fs-v0.1.0...HEAD
[@vooya/fs 0.1.0]: https://github.com/vooyajs/fs/releases/tag/fs-v0.1.0
[@rush-fs/core 0.1.0]: https://github.com/vooyajs/fs/compare/v0.0.5...v0.1.0
[0.0.5]: https://github.com/vooyajs/fs/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/vooyajs/fs/compare/v0.0.3...v0.0.4
