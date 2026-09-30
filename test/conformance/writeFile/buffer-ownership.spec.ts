import test from 'ava'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, writeFileSync, appendFile, appendFileSync } from '../../../api.js'

for (const operation of ['writeFile', 'appendFile'] as const) {
  test(`public ${operation}: Buffer views and empty buffers match Node`, async (t) => {
    const root = fs.mkdtempSync(join(tmpdir(), 'vooya-buffer-view-'))
    t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
    const sync = operation === 'writeFile' ? writeFileSync : appendFileSync
    const asyncFn = operation === 'writeFile' ? writeFile : appendFile
    const nodeSync = operation === 'writeFile' ? fs.writeFileSync : fs.appendFileSync
    const nodeAsync = operation === 'writeFile' ? fs.promises.writeFile : fs.promises.appendFile
    for (const data of [Buffer.from([99, 0, 128, 255, 99]).subarray(1, 4), Buffer.alloc(0)]) {
      for (const mode of ['sync', 'async']) {
        const actual = join(root, 'actual')
        const expected = join(root, 'expected')
        fs.writeFileSync(actual, 'prefix')
        fs.writeFileSync(expected, 'prefix')
        const snapshot = Buffer.from(data)
        if (mode === 'sync') {
          sync(actual, data)
          nodeSync(expected, data)
        } else {
          await asyncFn(actual, data)
          await nodeAsync(expected, data)
        }
        t.deepEqual(fs.readFileSync(actual), fs.readFileSync(expected))
        t.deepEqual(data, snapshot)
      }
    }
  })

  test(`public ${operation}: concurrent async calls retain independent entry snapshots`, async (t) => {
    const root = fs.mkdtempSync(join(tmpdir(), 'vooya-buffer-snapshot-'))
    t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
    const operationFn = operation === 'writeFile' ? writeFile : appendFile
    const backing = Buffer.alloc(1024 * 1024 + 32, 0x19)
    const view = backing.subarray(16, -16)
    const pending: Promise<void>[] = []
    for (let i = 0; i < 8; i++) {
      view.fill(i)
      const file = join(root, String(i))
      fs.writeFileSync(file, 'prefix')
      pending.push(
        operationFn(file, view).then(() => {
          const expected = Buffer.alloc(view.length, i)
          t.deepEqual(
            fs.readFileSync(file),
            operation === 'appendFile' ? Buffer.concat([Buffer.from('prefix'), expected]) : expected,
          )
        }),
      )
    }
    backing.fill(255)
    await Promise.all(pending)
  })
}

test('public appendFile: sequential snapshots preserve append order', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-append-order-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'data')
  const bytes = Buffer.from([1, 2, 3])
  const first = appendFile(file, bytes)
  bytes.fill(4)
  await first
  await appendFile(file, bytes.subarray(1))
  t.deepEqual(fs.readFileSync(file), Buffer.from([1, 2, 3, 4, 4]))
})
