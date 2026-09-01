import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { truncate, truncateSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-truncate-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('truncate: promise defaults to length 0 like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-default.txt')
  const vooyaFile = path.join(root, 'vooya-default.txt')
  await nodeFs.writeFile(nodeFile, 'node default')
  await nodeFs.writeFile(vooyaFile, 'vooya default')

  await nodeFs.truncate(nodeFile)
  await truncate(vooyaFile)

  t.is(nodeFsSync.statSync(vooyaFile).size, nodeFsSync.statSync(nodeFile).size)
})

test('truncate: promise truncates files shorter like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-short.txt')
  const vooyaFile = path.join(root, 'vooya-short.txt')
  await nodeFs.writeFile(nodeFile, 'hello world')
  await nodeFs.writeFile(vooyaFile, 'hello world')

  await nodeFs.truncate(nodeFile, 5)
  await truncate(vooyaFile, 5)

  t.is(await nodeFs.readFile(vooyaFile, 'utf8'), await nodeFs.readFile(nodeFile, 'utf8'))
})

test('truncate: promise extends files like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-long.bin')
  const vooyaFile = path.join(root, 'vooya-long.bin')
  await nodeFs.writeFile(nodeFile, Buffer.from('abc'))
  await nodeFs.writeFile(vooyaFile, Buffer.from('abc'))

  await nodeFs.truncate(nodeFile, 8)
  await truncate(vooyaFile, 8)

  t.deepEqual(await nodeFs.readFile(vooyaFile), await nodeFs.readFile(nodeFile))
})

test('truncate: sync truncates files like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.txt')
  const vooyaFile = path.join(root, 'vooya-sync.txt')
  await nodeFs.writeFile(nodeFile, 'sync truncate')
  await nodeFs.writeFile(vooyaFile, 'sync truncate')

  nodeFsSync.truncateSync(nodeFile, 4)
  truncateSync(vooyaFile, 4)

  t.is(nodeFsSync.readFileSync(vooyaFile, 'utf8'), nodeFsSync.readFileSync(nodeFile, 'utf8'))
})

test('truncate: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeMissing = path.join(root, 'node-missing.txt')
  const vooyaMissing = path.join(root, 'vooya-missing.txt')

  const nodeResult = await capture(() => nodeFs.truncate(nodeMissing, 1))
  const vooyaResult = await capture(() => truncate(vooyaMissing, 1) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.truncateSync(nodeMissing, 1))
  t.throws(() => truncateSync(vooyaMissing, 1))
})

test('truncate: negative lengths clamp to zero like supported Node runtimes', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-negative.txt')
  const vooyaFile = path.join(root, 'vooya-negative.txt')
  await nodeFs.writeFile(nodeFile, 'unchanged')
  await nodeFs.writeFile(vooyaFile, 'unchanged')

  await nodeFs.truncate(nodeFile, -1)
  await truncate(vooyaFile, -1)
  t.is(nodeFsSync.statSync(vooyaFile).size, nodeFsSync.statSync(nodeFile).size)

  await nodeFs.writeFile(nodeFile, 'again')
  await nodeFs.writeFile(vooyaFile, 'again')
  nodeFsSync.truncateSync(nodeFile, -1)
  truncateSync(vooyaFile, -1)
  t.is(nodeFsSync.statSync(vooyaFile).size, nodeFsSync.statSync(nodeFile).size)
})
