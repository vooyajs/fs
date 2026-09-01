# Node WASI filesystem probe

This experiment compares three synchronous traversals of the same generated
medium fixture:

1. Node recursive `readdirSync` plus `lstatSync`;
2. the production Node-API `scanSync` implementation;
3. a Rust `wasm32-wasip1` module using a `/data` preopen.

The module is instantiated once before sampling. The WASI function returns only a
file count, while `scanSync` creates metadata records and sorts them, so the setup
deliberately favors WASI. It measures current WASI filesystem overhead and is not
an API-equivalence or security benchmark.

```bash
cargo build \
  --manifest-path experiments/node-wasi/Cargo.toml \
  --target wasm32-wasip1 \
  --release \
  --target-dir target

node --experimental-wasi-unstable-preview1 experiments/node-wasi/bench.mjs
```

Do not ship the probe as a fallback. A real WASI package needs its own declared
capability surface and conformance suite.

## Latest local result

Apple M4 Pro, Node 24.20.0, 2 warmups and 10 samples, medium fixture with 2,728
files and 341 directories (mean wall time):

| Path                                       |     Mean |
| ------------------------------------------ | -------: |
| Node recursive `readdirSync` + `lstatSync` | 19.76 ms |
| Native Node-API `scanSync`                 |  9.86 ms |
| Rust `wasm32-wasip1` count-only traversal  | 15.96 ms |

The native path was about **1.62x faster than WASI** even though native returned,
converted, and sorted full metadata records while WASI returned only one integer.
Startup was excluded because the WASM module was compiled and instantiated once.
The conclusion is specific to this filesystem workload and runtime; it does not
generalize to compute-heavy WASM functions.
