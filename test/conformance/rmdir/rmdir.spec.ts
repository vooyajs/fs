import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { rmdir, rmdirSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-rmdir-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('rmdir: promise removes empty directories like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-empty')
  const vooyaDir = path.join(root, 'vooya-empty')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)

  await nodeFs.rmdir(nodeDir)
  await rmdir(vooyaDir)

  t.is(nodeFsSync.existsSync(vooyaDir), nodeFsSync.existsSync(nodeDir))
})

test('rmdir: sync removes empty directories like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-sync-empty')
  const vooyaDir = path.join(root, 'vooya-sync-empty')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)

  nodeFsSync.rmdirSync(nodeDir)
  rmdirSync(vooyaDir)

  t.is(nodeFsSync.existsSync(vooyaDir), nodeFsSync.existsSync(nodeDir))
})

test('rmdir: non-empty directories reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-full')
  const vooyaDir = path.join(root, 'vooya-full')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)
  await nodeFs.writeFile(path.join(nodeDir, 'file.txt'), 'node')
  await nodeFs.writeFile(path.join(vooyaDir, 'file.txt'), 'vooya')

  const nodeResult = await capture(() => nodeFs.rmdir(nodeDir))
  const vooyaResult = await capture(() => rmdir(vooyaDir) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.rmdirSync(nodeDir))
  t.throws(() => rmdirSync(vooyaDir))
})

test('rmdir: file paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-file.txt')
  const vooyaFile = path.join(root, 'vooya-file.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  const nodeResult = await capture(() => nodeFs.rmdir(nodeFile))
  const vooyaResult = await capture(() => rmdir(vooyaFile) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.rmdirSync(nodeFile))
  t.throws(() => rmdirSync(vooyaFile))
})

test('rmdir: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeMissing = path.join(root, 'node-missing')
  const vooyaMissing = path.join(root, 'vooya-missing')

  const nodeResult = await capture(() => nodeFs.rmdir(nodeMissing))
  const vooyaResult = await capture(() => rmdir(vooyaMissing) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.rmdirSync(nodeMissing))
  t.throws(() => rmdirSync(vooyaMissing))
})
