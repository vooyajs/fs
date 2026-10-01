import * as fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Inspect the binding selected by the generated loader, including overrides and
// optional platform packages. Directory order and target-name guesses cannot
// establish which binary actually executed the benchmark.
export function nativeBinaryIdentity(binding = require('../index.js'), cache = require.cache) {
  const files = Object.entries(cache)
    .filter(([file, entry]) => file.endsWith('.node') && entry?.exports === binding)
    .map(([file]) => file)
  if (files.length !== 1)
    throw new Error(
      `Expected exactly one loaded native Vooya binary; found ${files.length}. WASM or unidentifiable bindings cannot produce native benchmark evidence.`,
    )
  const file = files[0]
  return { file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
}
