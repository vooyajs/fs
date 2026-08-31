import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { utimes, utimesSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-utimes-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

function assertTimeClose(
  t: { true(value: boolean, message?: string): void },
  actualMs: number,
  expectedMs: number,
): void {
  t.true(Math.abs(actualMs - expectedMs) < 10, `${actualMs} should be close to ${expectedMs}`)
}

test('utimes: promise updates file timestamps like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-file.txt')
  const vooyaFile = path.join(root, 'vooya-file.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')
  const atime = 1_700_000_000.123
  const mtime = 1_700_000_001.456

  await nodeFs.utimes(nodeFile, atime, mtime)
  await utimes(vooyaFile, atime, mtime)

  const nodeStats = nodeFsSync.statSync(nodeFile)
  const vooyaStats = nodeFsSync.statSync(vooyaFile)
  assertTimeClose(t, vooyaStats.atimeMs, nodeStats.atimeMs)
  assertTimeClose(t, vooyaStats.mtimeMs, nodeStats.mtimeMs)
})

test('utimes: promise updates directory timestamps like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-dir')
  const vooyaDir = path.join(root, 'vooya-dir')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)
  const atime = 1_600_000_000
  const mtime = 1_600_000_001

  await nodeFs.utimes(nodeDir, atime, mtime)
  await utimes(vooyaDir, atime, mtime)

  const nodeStats = nodeFsSync.statSync(nodeDir)
  const vooyaStats = nodeFsSync.statSync(vooyaDir)
  assertTimeClose(t, vooyaStats.atimeMs, nodeStats.atimeMs)
  assertTimeClose(t, vooyaStats.mtimeMs, nodeStats.mtimeMs)
})

test('utimes: sync updates file timestamps like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.txt')
  const vooyaFile = path.join(root, 'vooya-sync.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')
  const atime = 1_500_000_000
  const mtime = 1_500_000_001

  nodeFsSync.utimesSync(nodeFile, atime, mtime)
  utimesSync(vooyaFile, atime, mtime)

  const nodeStats = nodeFsSync.statSync(nodeFile)
  const vooyaStats = nodeFsSync.statSync(vooyaFile)
  assertTimeClose(t, vooyaStats.atimeMs, nodeStats.atimeMs)
  assertTimeClose(t, vooyaStats.mtimeMs, nodeStats.mtimeMs)
})

test('utimes: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeMissing = path.join(root, 'node-missing.txt')
  const vooyaMissing = path.join(root, 'vooya-missing.txt')

  const nodeResult = await capture(() => nodeFs.utimes(nodeMissing, 1, 2))
  const vooyaResult = await capture(() => utimes(vooyaMissing, 1, 2) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.utimesSync(nodeMissing, 1, 2))
  t.throws(() => utimesSync(vooyaMissing, 1, 2))
})
