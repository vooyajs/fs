import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { mkdir, mkdirSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-mkdir-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

function modeOf(file: string): number {
  return nodeFsSync.statSync(file).mode & 0o777
}

test('mkdir: promise creates a single directory like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node')
  const vooyaDir = path.join(root, 'vooya')

  const nodeResult = await nodeFs.mkdir(nodeDir)
  const vooyaResult = await mkdir(vooyaDir)

  t.is(nodeResult, undefined)
  t.is(vooyaResult, undefined)
  t.true(nodeFsSync.statSync(vooyaDir).isDirectory())
})

test('mkdir: promise recursive creates nested directories and returns first created path', async (t) => {
  const root = await withFixture(t)
  const nodeTarget = path.join(root, 'node', 'a', 'b')
  const vooyaTarget = path.join(root, 'vooya', 'a', 'b')

  const nodeResult = await nodeFs.mkdir(nodeTarget, { recursive: true })
  const vooyaResult = await mkdir(vooyaTarget, { recursive: true })

  t.is(typeof vooyaResult, typeof nodeResult)
  t.true(String(vooyaResult).endsWith('vooya'))
  t.true(nodeFsSync.statSync(vooyaTarget).isDirectory())
})

test('mkdir: promise recursive returns no created path when target exists like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeTarget = path.join(root, 'node')
  const vooyaTarget = path.join(root, 'vooya')
  await nodeFs.mkdir(nodeTarget)
  await nodeFs.mkdir(vooyaTarget)

  const nodeResult = await nodeFs.mkdir(nodeTarget, { recursive: true })
  const vooyaResult = await mkdir(vooyaTarget, { recursive: true })

  t.is(vooyaResult, nodeResult)
})

test('mkdir: sync recursive behavior matches node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeTarget = path.join(root, 'node-sync', 'a', 'b')
  const vooyaTarget = path.join(root, 'vooya-sync', 'a', 'b')

  const nodeResult = nodeFsSync.mkdirSync(nodeTarget, { recursive: true })
  const vooyaResult = mkdirSync(vooyaTarget, { recursive: true })

  t.is(typeof vooyaResult, typeof nodeResult)
  t.true(String(vooyaResult).endsWith('vooya-sync'))
  t.true(nodeFsSync.statSync(vooyaTarget).isDirectory())
})

test('mkdir: non-recursive errors match node:fs existence behavior', async (t) => {
  const root = await withFixture(t)
  const existing = path.join(root, 'existing')
  const missingParent = path.join(root, 'missing', 'child')
  await nodeFs.mkdir(existing)

  const nodeExisting = await capture(() => nodeFs.mkdir(existing))
  const vooyaExisting = await capture(() => mkdir(existing) as Promise<unknown>)
  const nodeMissingParent = await capture(() => nodeFs.mkdir(missingParent))
  const vooyaMissingParent = await capture(() => mkdir(missingParent) as Promise<unknown>)

  t.false(nodeExisting.ok)
  t.false(vooyaExisting.ok)
  t.false(nodeMissingParent.ok)
  t.false(vooyaMissingParent.ok)
  t.throws(() => nodeFsSync.mkdirSync(existing))
  t.throws(() => mkdirSync(existing))
  t.throws(() => nodeFsSync.mkdirSync(missingParent))
  t.throws(() => mkdirSync(missingParent))
})

test('mkdir: recursive file target and file ancestor errors match node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-file')
  const vooyaFile = path.join(root, 'vooya-file')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  const nodeTargetFile = await capture(() => nodeFs.mkdir(nodeFile, { recursive: true }))
  const vooyaTargetFile = await capture(() => mkdir(vooyaFile, { recursive: true }) as Promise<unknown>)
  const nodeAncestorFile = await capture(() => nodeFs.mkdir(path.join(nodeFile, 'child'), { recursive: true }))
  const vooyaAncestorFile = await capture(
    () => mkdir(path.join(vooyaFile, 'child'), { recursive: true }) as Promise<unknown>,
  )

  t.false(nodeTargetFile.ok)
  t.false(vooyaTargetFile.ok)
  t.false(nodeAncestorFile.ok)
  t.false(vooyaAncestorFile.ok)
})

test('mkdir: mode applies to created directories on unix like node:fs', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows mode bits are platform dependent')
    return
  }

  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-mode')
  const vooyaDir = path.join(root, 'vooya-mode')

  await nodeFs.mkdir(nodeDir, { mode: 0o700 })
  await mkdir(vooyaDir, { mode: 0o700 })

  t.is(modeOf(vooyaDir), modeOf(nodeDir))
})

test('mkdir: creation mode respects process umask like node:fs', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows mode bits are platform dependent')
    return
  }

  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-umask')
  const vooyaDir = path.join(root, 'vooya-umask')
  await nodeFs.mkdir(nodeDir, { mode: 0o777 })
  await mkdir(vooyaDir, { mode: 0o777 })

  t.is(modeOf(vooyaDir), modeOf(nodeDir))
})
