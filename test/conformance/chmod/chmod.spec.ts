import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { chmod, chmodSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-chmod-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

function fileMode(file: string): number {
  return nodeFsSync.statSync(file).mode & 0o777
}

test('chmod: promise file mode matches node:fs/promises on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chmod parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.txt')
  const vooyaFile = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  await nodeFs.chmod(nodeFile, 0o640)
  await chmod(vooyaFile, 0o640)

  t.is(fileMode(vooyaFile), fileMode(nodeFile))
})

test('chmod: promise directory mode matches node:fs/promises on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chmod parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const nodeDir = path.join(root, 'node-dir')
  const vooyaDir = path.join(root, 'vooya-dir')
  await nodeFs.mkdir(nodeDir)
  await nodeFs.mkdir(vooyaDir)

  await nodeFs.chmod(nodeDir, 0o750)
  await chmod(vooyaDir, 0o750)

  t.is(fileMode(vooyaDir), fileMode(nodeDir))
})

test('chmod: sync file mode matches node:fs on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows chmod parity is documented as a current gap')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.txt')
  const vooyaFile = path.join(root, 'vooya-sync.txt')
  await nodeFs.writeFile(nodeFile, 'node')
  await nodeFs.writeFile(vooyaFile, 'vooya')

  nodeFsSync.chmodSync(nodeFile, 0o600)
  chmodSync(vooyaFile, 0o600)

  t.is(fileMode(vooyaFile), fileMode(nodeFile))
})

test('chmod: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')

  const nodeResult = await capture(() => nodeFs.chmod(missing, 0o644))
  const vooyaResult = await capture(() => chmod(missing, 0o644) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.chmodSync(missing, 0o644))
  t.throws(() => chmodSync(missing, 0o644))
})
