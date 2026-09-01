import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { readlink, readlinkSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-readlink-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('readlink: promise reads absolute symlink targets like node:fs/promises', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const link = path.join(root, 'link.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(target, link)

  t.is(await readlink(link), await nodeFs.readlink(link))
})

test('readlink: promise preserves relative symlink targets like node:fs/promises', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const targetName = 'target.txt'
  const target = path.join(root, targetName)
  const link = path.join(root, 'relative-link.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(targetName, link)

  t.is(await readlink(link), await nodeFs.readlink(link))
  t.is(await readlink(link), targetName)
})

test('readlink: sync reads symlink targets like node:fs', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const target = path.join(root, 'sync-target.txt')
  const link = path.join(root, 'sync-link.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(target, link)

  t.is(readlinkSync(link), nodeFsSync.readlinkSync(link, 'utf8'))
})

test('readlink: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing-link.txt')

  const nodeResult = await capture(() => nodeFs.readlink(missing))
  const vooyaResult = await capture(() => readlink(missing) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.readlinkSync(missing))
  t.throws(() => readlinkSync(missing))
})

test('readlink: non-symlink paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'file.txt')
  await nodeFs.writeFile(file, 'not a link')

  const nodeResult = await capture(() => nodeFs.readlink(file))
  const vooyaResult = await capture(() => readlink(file) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.readlinkSync(file))
  t.throws(() => readlinkSync(file))
})
