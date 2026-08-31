import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { unlink, unlinkSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-unlink-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('unlink: promise removes files like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.txt')
  const vooyaFile = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  await nodeFs.unlink(nodeFile)
  await unlink(vooyaFile)

  t.is(nodeFsSync.existsSync(vooyaFile), nodeFsSync.existsSync(nodeFile))
})

test('unlink: promise removes symlink entries without deleting targets like node:fs/promises', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const nodeLink = path.join(root, 'node-link.txt')
  const vooyaLink = path.join(root, 'vooya-link.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(target, nodeLink)
  await nodeFs.symlink(target, vooyaLink)

  await nodeFs.unlink(nodeLink)
  await unlink(vooyaLink)

  t.false(nodeFsSync.existsSync(vooyaLink))
  t.true(nodeFsSync.existsSync(target))
})

test('unlink: sync removes files like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.txt')
  const vooyaFile = path.join(root, 'vooya-sync.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  nodeFsSync.unlinkSync(nodeFile)
  unlinkSync(vooyaFile)

  t.is(nodeFsSync.existsSync(vooyaFile), nodeFsSync.existsSync(nodeFile))
})

test('unlink: directory paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-dir')
  const vooyaDir = path.join(root, 'vooya-dir')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)

  const nodeResult = await capture(() => nodeFs.unlink(nodeDir))
  const vooyaResult = await capture(() => unlink(vooyaDir) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.unlinkSync(nodeDir))
  t.throws(() => unlinkSync(vooyaDir))
})

test('unlink: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeMissing = path.join(root, 'node-missing.txt')
  const vooyaMissing = path.join(root, 'vooya-missing.txt')

  const nodeResult = await capture(() => nodeFs.unlink(nodeMissing))
  const vooyaResult = await capture(() => unlink(vooyaMissing) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.unlinkSync(nodeMissing))
  t.throws(() => unlinkSync(vooyaMissing))
})
