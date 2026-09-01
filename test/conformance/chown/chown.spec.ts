import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { chown, chownSync, statSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-chown-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('chown: promise current owner matches node:fs/promises on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chown parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.txt')
  const vooyaFile = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')
  const nodeBefore = nodeFsSync.statSync(nodeFile)
  const vooyaBefore = nodeFsSync.statSync(vooyaFile)

  await nodeFs.chown(nodeFile, nodeBefore.uid, nodeBefore.gid)
  await chown(vooyaFile, vooyaBefore.uid, vooyaBefore.gid)

  const nodeAfter = nodeFsSync.statSync(nodeFile)
  const vooyaAfter = statSync(vooyaFile) as any
  t.is(vooyaAfter.uid, nodeAfter.uid)
  t.is(vooyaAfter.gid, nodeAfter.gid)
})

test('chown: sync current owner matches node:fs on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chown parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.txt')
  const vooyaFile = path.join(root, 'vooya-sync.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')
  const nodeBefore = nodeFsSync.statSync(nodeFile)
  const vooyaBefore = nodeFsSync.statSync(vooyaFile)

  nodeFsSync.chownSync(nodeFile, nodeBefore.uid, nodeBefore.gid)
  chownSync(vooyaFile, vooyaBefore.uid, vooyaBefore.gid)

  const nodeAfter = nodeFsSync.statSync(nodeFile)
  const vooyaAfter = statSync(vooyaFile) as any
  t.is(vooyaAfter.uid, nodeAfter.uid)
  t.is(vooyaAfter.gid, nodeAfter.gid)
})

test('chown: missing paths reject or throw in both implementations', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chown parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')

  const nodeResult = await capture(() => nodeFs.chown(missing, 0, 0))
  const vooyaResult = await capture(() => chown(missing, 0, 0) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.chownSync(missing, 0, 0))
  t.throws(() => chownSync(missing, 0, 0))
})

test('chown: permission-denied behavior matches node:fs for privileged owner changes', async (t) => {
  if (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)) {
    t.pass('privileged owner changes are platform or root dependent')
    return
  }

  const root = await withFixture(t)
  const file = path.join(root, 'owned.txt')
  await nodeFs.writeFile(file, 'owned')

  const nodeResult = await capture(() => nodeFs.chown(file, 0, 0))
  const vooyaResult = await capture(() => chown(file, 0, 0) as Promise<unknown>)

  t.is(vooyaResult.ok, nodeResult.ok)
})
