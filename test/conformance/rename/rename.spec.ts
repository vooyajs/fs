import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { rename, renameSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-rename-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('rename: promise moves files like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeSrc = path.join(root, 'node-src.txt')
  const nodeDest = path.join(root, 'node-dest.txt')
  const vooyaSrc = path.join(root, 'vooya-src.txt')
  const vooyaDest = path.join(root, 'vooya-dest.txt')
  await nodeFs.writeFile(nodeSrc, 'rename data')
  await nodeFs.writeFile(vooyaSrc, 'rename data')

  await nodeFs.rename(nodeSrc, nodeDest)
  await rename(vooyaSrc, vooyaDest)

  t.false(nodeFsSync.existsSync(vooyaSrc))
  t.is(nodeFsSync.readFileSync(vooyaDest, 'utf8'), nodeFsSync.readFileSync(nodeDest, 'utf8'))
})

test('rename: promise overwrites existing file destination like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeSrc = path.join(root, 'node-src.txt')
  const nodeDest = path.join(root, 'node-dest.txt')
  const vooyaSrc = path.join(root, 'vooya-src.txt')
  const vooyaDest = path.join(root, 'vooya-dest.txt')
  await nodeFs.writeFile(nodeSrc, 'new')
  await nodeFs.writeFile(nodeDest, 'old')
  await nodeFs.writeFile(vooyaSrc, 'new')
  await nodeFs.writeFile(vooyaDest, 'old')

  await nodeFs.rename(nodeSrc, nodeDest)
  await rename(vooyaSrc, vooyaDest)

  t.is(nodeFsSync.readFileSync(vooyaDest, 'utf8'), nodeFsSync.readFileSync(nodeDest, 'utf8'))
})

test('rename: sync moves directories like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeSrc = path.join(root, 'node-dir')
  const nodeDest = path.join(root, 'node-dir-renamed')
  const vooyaSrc = path.join(root, 'vooya-dir')
  const vooyaDest = path.join(root, 'vooya-dir-renamed')
  await nodeFs.mkdir(nodeSrc)
  await nodeFs.mkdir(vooyaSrc)
  await nodeFs.writeFile(path.join(nodeSrc, 'file.txt'), 'dir')
  await nodeFs.writeFile(path.join(vooyaSrc, 'file.txt'), 'dir')

  nodeFsSync.renameSync(nodeSrc, nodeDest)
  renameSync(vooyaSrc, vooyaDest)

  t.false(nodeFsSync.existsSync(vooyaSrc))
  t.true(nodeFsSync.statSync(vooyaDest).isDirectory())
  t.is(nodeFsSync.readFileSync(path.join(vooyaDest, 'file.txt'), 'utf8'), 'dir')
  t.is(nodeFsSync.existsSync(vooyaDest), nodeFsSync.existsSync(nodeDest))
})

test('rename: missing source rejects or throws in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeSrc = path.join(root, 'node-missing.txt')
  const nodeDest = path.join(root, 'node-dest.txt')
  const vooyaSrc = path.join(root, 'vooya-missing.txt')
  const vooyaDest = path.join(root, 'vooya-dest.txt')

  const nodeResult = await capture(() => nodeFs.rename(nodeSrc, nodeDest))
  const vooyaResult = await capture(() => rename(vooyaSrc, vooyaDest) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.renameSync(nodeSrc, nodeDest))
  t.throws(() => renameSync(vooyaSrc, vooyaDest))
})
