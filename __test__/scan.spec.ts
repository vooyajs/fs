import test from 'ava'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import { scan, scanSync } from '../index.js'

async function fixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-scan-'))
  t.teardown(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(path.join(root, 'root.txt'), 'root')
  await fs.writeFile(path.join(root, 'skip.log'), 'skip')
  await fs.mkdir(path.join(root, 'nested'))
  await fs.writeFile(path.join(root, 'nested', 'child.txt'), 'child')
  await fs.mkdir(path.join(root, '.hidden'))
  await fs.writeFile(path.join(root, '.hidden', 'secret.txt'), 'secret')
  return root
}

test('scanSync returns file metadata in one rooted traversal', async (t) => {
  const root = await fixture(t)
  const entries = scanSync(root, { include: ['**/*.txt'], skipHidden: true })

  t.deepEqual(
    entries.map((entry) => entry.path),
    ['nested/child.txt', 'root.txt'],
  )
  for (const entry of entries) {
    const metadata = await fs.lstat(path.join(root, entry.path))
    t.is(entry.kind, 'file')
    t.is(entry.size, metadata.size)
    t.true(Math.abs(entry.mtimeMs - metadata.mtimeMs) < 2)
  }
})

test('scan keeps root-only include patterns rooted', async (t) => {
  const root = await fixture(t)
  const entries = await scan(root, { include: ['*.txt'] })
  t.deepEqual(
    entries.map((entry) => entry.path),
    ['root.txt'],
  )
})

test('scan supports excludes, directories, and deterministic ordering', async (t) => {
  const root = await fixture(t)
  const entries = await scan(root, {
    include: ['**'],
    exclude: ['**/*.log', '.hidden/**'],
    withDirectories: true,
    skipHidden: true,
    concurrency: 4,
  })

  t.deepEqual(
    entries.map((entry) => `${entry.kind}:${entry.path}`),
    ['directory:nested', 'file:nested/child.txt', 'file:root.txt'],
  )
})

test('scan serial and parallel traversals return the same records', async (t) => {
  const root = await fixture(t)
  const serial = await scan(root, { include: ['**'], concurrency: 1 })
  const parallel = await scan(root, { include: ['**'], concurrency: 4 })
  t.deepEqual(parallel, serial)
})

test('scan rejects missing roots instead of returning a partial result', async (t) => {
  const missing = path.join(os.tmpdir(), `vooya-fs-scan-missing-${Date.now()}`)
  await t.throwsAsync(() => scan(missing))
  t.throws(() => scanSync(missing))
})
