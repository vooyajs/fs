import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { exists, existsSync } from '../../../index.js'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-exists-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('exists: promise returns true for files and directories', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'file.txt')
  const dir = path.join(root, 'dir')
  await nodeFs.writeFile(file, 'exists')
  await nodeFs.mkdir(dir)

  t.true((await exists(file)) as boolean)
  t.true((await exists(dir)) as boolean)
})

test('exists: promise returns false for missing paths', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')

  t.false((await exists(missing)) as boolean)
})

test('exists: sync matches node:fs.existsSync', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'file.txt')
  const dir = path.join(root, 'dir')
  const missing = path.join(root, 'missing.txt')
  await nodeFs.writeFile(file, 'exists')
  await nodeFs.mkdir(dir)

  for (const entry of [file, dir, missing]) {
    t.is(existsSync(entry), nodeFsSync.existsSync(entry))
  }
})

test('exists: symlink and broken symlink behavior matches node:fs.existsSync', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const link = path.join(root, 'link.txt')
  const broken = path.join(root, 'broken.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(target, link)
  await nodeFs.symlink(path.join(root, 'missing-target.txt'), broken)

  t.is(await exists(link), nodeFsSync.existsSync(link))
  t.is(await exists(broken), nodeFsSync.existsSync(broken))
  t.is(existsSync(link), nodeFsSync.existsSync(link))
  t.is(existsSync(broken), nodeFsSync.existsSync(broken))
})
