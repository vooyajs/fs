## Problem and native value

<!-- Describe the workload and resulting behavior. For native work, identify the
Rust crate/algorithm and why it can improve on Node after N-API conversion costs.
For compatibility/correctness-only work, state that purpose without a speed claim. -->

## Compatibility and tests

<!-- Link the API SDD and regression/public-entry tests. Identify Node versions,
sync/Promise behavior, platform coverage, error/side-effect checks and deliberate
extensions. Explain any unchanged tests or unavailable platform runs specifically. -->

## Performance evidence

<!-- Required when changing hot paths, scheduling, dependencies, copying,
allocations or routing. Otherwise explain why performance is unaffected.
Link raw samples and commands; identify prior/proposed revision or patch, Node
baseline, release build, public entry, OS/CPU, fixture, options, concurrency,
warmups/sample counts and cache conditions. Include tiny/small and target scales,
regressions, memory tradeoffs and the resulting recommended boundary.
An existing benchmark is sufficient when it covers the changed scenario.
Node fallback measurements are not Rust acceleration evidence. -->

| Workload / options | Node baseline | Before | After | Memory / limits |
| ------------------ | ------------- | ------ | ----- | --------------- |

## Documentation and validation

- [ ] Feature/behavior changes include relevant tests, API SDD, API docs and CHANGELOG in this change.
- [ ] Public types, routing, compatibility policy and README claims agree with the implementation.
- [ ] Native fast-path recommendations have repeatable evidence; slower cases and limits are visible.
- [ ] Relevant build, tests, typecheck, lint, Rust formatting and Clippy checks pass.
- [ ] Node 22/24 and platform CI coverage is recorded; unavailable runtime checks are identified.
- [ ] Changed site documentation builds successfully.
- [ ] Any inapplicable item has a concrete explanation above; no placeholder file changes.

<!-- Pure docs/internal-only changes may reuse tests and evidence with a reason.
Shared-runner timing ratios are not hard CI assertions. Reviewers must assess
behavior equivalence and evidence quality, not merely checked boxes. -->

[Development contract](../CONTRIBUTING.md#development-contract-required)
