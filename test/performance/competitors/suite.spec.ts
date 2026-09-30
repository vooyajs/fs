import test from 'ava'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  canonical,
  validate,
  createSynthetic,
  inventory,
  cases,
  eligibleEngines,
  execute,
  expectedPaths,
  executionRoute,
} from './suite.mjs'

test('competitor adapters preserve the shared result contract in sync and async modes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-competitor-contract-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  createSynthetic(root, 8)
  const manifest = inventory(root)
  t.true(manifest.entries.some((entry) => entry.path === '.hidden/secret.js'))
  for (const scenario of cases) {
    const expected = expectedPaths(manifest, scenario)
    for (const mode of ['sync', 'async']) {
      for (const engine of eligibleEngines(scenario)) {
        const result = await execute(engine, mode, root, scenario)
        t.notThrows(() => validate(result, expected, `${scenario.id}/${mode}/${engine}`))
      }
      t.is(await executionRoute(mode, root, scenario), scenario.id === 'configs' ? 'node-fallback' : 'native')
    }
  }
})

test('benchmark equality gate rejects duplicate, missing, extra and incorrectly typed results', (t) => {
  t.deepEqual(canonical(['dir\\file.js', 'folder/']), ['dir/file.js', 'folder'])
  t.throws(() => validate(['a', 'a'], ['a'], 'duplicates'), { message: /duplicate/ })
  t.throws(() => validate(['a'], ['a', 'b'], 'missing'), { message: /mismatch/ })
  t.throws(() => validate(['a', 'b'], ['a'], 'extra'), { message: /mismatch/ })
  t.throws(() => canonical([{} as never]), { instanceOf: TypeError })
})
