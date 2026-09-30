# Vooya FS development contract

Applies to this repository. Read the development contract in CONTRIBUTING.md
before implementing behavior or performance changes.

## Product direction

- Use napi-rs and stable Node-API to expose useful Rust ecosystem capabilities to
  Node.js with minimal application changes. Node-compatible APIs are the adoption
  contract; measured native performance is the reason to select an implementation.
- Prioritize native algorithms, mature Rust crates, batching, fused traversal and
  metadata, bounded parallelism, and reduced copying/allocation. A Rust rewrite or
  a larger API count alone is not a product benefit. N-API crossings and result
  conversion must be included in the measured cost.
- Keep familiar signatures, options, results, errors and sync/Promise behavior on
  the declared compatibility surface. Document extensions and exceptions. Never
  silently change semantics to obtain a faster benchmark.
- Node execution routes are valid compatibility choices. Do not count their
  results as Rust acceleration. Do not replace an efficient Node implementation
  without evidence for the intended workload.

## Required delivery

- Every feature or observable behavior change must include relevant tests and
  user documentation in the same change; fixes need regression coverage. Update
  the API SDD and CHANGELOG for changed contracts. Internal-only refactors may
  reuse coverage/docs, but explain that assessment in the PR; no placeholder edits.
- Test the public @vooya/fs entry, including types and routing. Native-binding
  tests supplement public tests. Use Node 22/24 as behavior oracles for Node APIs,
  with independent fixtures and separately checked sync/Promise semantics.
- Before adding a native fast path, state its workload, Node baseline, Rust
  mechanism and expected benefit. Require release-build, public-entry evidence
  of a repeatable benefit before recommending or making it the default.
- For changes affecting hot paths, scheduling, dependencies, copies, allocations
  or routing, rerun relevant benchmarks on the prior and proposed implementation
  against Node under the same conditions. Preserve raw samples and reproduction
  commands; include tiny/small and representative target scales and regressions.
- Report latency/throughput and memory tradeoffs with runtime, OS/CPU, fixture,
  encoding/options, concurrency, warmup/sample counts and cache conditions. RSS
  deltas are not peak memory. Do not compare different results or durability work.
- If performance does not improve, keep correctness fixes, remove acceleration
  claims and reassess the native route or scope. Unmeasured work is unverified,
  not complete performance work. Do not broaden benchmarks without a reason.
- Run relevant checks: release build, tests, typecheck, lint, Rust formatting,
  Clippy and docs build. API/binding changes require the Node 22/24 matrix and
  platform CI results; explicitly record unavailable runtime checks. A cross
  compile is not runtime verification.

## Repository mechanics

- api.js/api.d.ts are the public policy/types; index.js/index.d.ts are generated
  by napi-rs. Change Rust annotations and rebuild rather than editing generated
  bindings by hand. Register native modules in src/lib.rs.
- Conformance contracts/tests: test/conformance/<api> and public/; binding tests:
  **test**/; benchmarks: test/performance/<api>; raw evidence: docs/public/evidence;
  user docs: docs/content/api and guide. Keep these consistent.
- Use pnpm build:debug for iteration and pnpm build for release measurements.
  Follow the branch and commit rules in CONTRIBUTING.md. Keep existing user work.
- Use the PR template to record scope, compatibility, checks, evidence and limits.
  Automated CI checks and human evidence review are both required; timing ratios
  are not hard CI assertions on shared runners.
