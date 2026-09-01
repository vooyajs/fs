import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { mkdtemp, mkdtempSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-mkdtemp-root-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('mkdtemp: promise creates directory with prefix like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodePrefix = path.join(root, 'node-')
  const vooyaPrefix = path.join(root, 'vooya-')

  const nodeDir = await nodeFs.mkdtemp(nodePrefix)
  const vooyaDir = (await mkdtemp(vooyaPrefix)) as string

  t.true(nodeDir.startsWith(nodePrefix))
  t.true(vooyaDir.startsWith(vooyaPrefix))
  t.true(nodeFsSync.statSync(vooyaDir).isDirectory())
})

test('mkdtemp: promise creates unique directories across repeated calls', async (t) => {
  const root = await withFixture(t)
  const prefix = path.join(root, 'vooya-unique-')

  const first = (await mkdtemp(prefix)) as string
  const second = (await mkdtemp(prefix)) as string

  t.not(first, second)
  t.true(nodeFsSync.statSync(first).isDirectory())
  t.true(nodeFsSync.statSync(second).isDirectory())
})

test('mkdtemp: sync creates directory with prefix like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodePrefix = path.join(root, 'node-sync-')
  const vooyaPrefix = path.join(root, 'vooya-sync-')

  const nodeDir = nodeFsSync.mkdtempSync(nodePrefix)
  const vooyaDir = mkdtempSync(vooyaPrefix)

  t.true(nodeDir.startsWith(nodePrefix))
  t.true(vooyaDir.startsWith(vooyaPrefix))
  t.true(nodeFsSync.statSync(vooyaDir).isDirectory())
})

test('mkdtemp: missing parent rejects or throws in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodePrefix = path.join(root, 'missing-node', 'node-')
  const vooyaPrefix = path.join(root, 'missing-vooya', 'vooya-')

  const nodeResult = await capture(() => nodeFs.mkdtemp(nodePrefix))
  const vooyaResult = await capture(() => mkdtemp(vooyaPrefix) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.mkdtempSync(nodePrefix))
  t.throws(() => mkdtempSync(vooyaPrefix))
})

test('mkdtemp: prefix is literal unless caller includes a trailing separator', async (t) => {
  const root = await withFixture(t)
  const prefix = path.join(root, 'literal-prefix')

  const dir = (await mkdtemp(prefix)) as string

  t.true(path.dirname(dir) === root)
  t.true(path.basename(dir).startsWith('literal-prefix'))
})
