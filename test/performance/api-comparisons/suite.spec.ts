import test from 'ava'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { apis, scenarios, engines, unavailable, prepare, execute, validate, route } from './suite.mjs'

test.serial('every exported operation has equivalent benchmark adapters and validated side effects', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-api-contract-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  t.deepEqual([...new Set(scenarios(true).map((s) => s.api))].sort(), apis)
  for (const s of scenarios(true)) {
    if (unavailable(s)) continue
    for (const mode of ['sync', 'async']) {
      for (const engine of engines(s)) {
        const c = prepare(path.join(root, 'sample'), s)
        const result = mode === 'sync' ? execute(engine, mode, s, c) : await execute(engine, mode, s, c)
        t.notThrows(() => validate(s, c, result), `${s.api}/${s.variant}/${mode}/${engine}`)
      }
      const c = prepare(path.join(root, 'route'), s)
      const fallback = ['cp', 'rm'].includes(s.api) && (mode === 'sync' || process.platform === 'win32')
      t.regex(await route(mode, s, c), fallback ? /^node-fallback$/ : /^native-/, `${s.api}/${mode}`)
    }
  }
})

test('mutation and metadata validation rejects missing work', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-api-invalid-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const api of ['writeFile', 'cp', 'rm', 'mkdir', 'truncate', 'rename', 'utimes']) {
    const s = scenarios(true).find((s) => s.api === api)!
    const c = prepare(path.join(root, api), s)
    t.throws(() => validate(s, c, [undefined]), undefined, api)
  }
})
