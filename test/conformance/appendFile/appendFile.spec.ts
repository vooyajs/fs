import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { appendFile, appendFileSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-appendfile-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('appendFile: promise appends string data like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.txt')
  const vooyaFile = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(nodeFile, 'hello')
  await nodeFs.writeFile(vooyaFile, 'hello')

  await nodeFs.appendFile(nodeFile, ' world')
  await appendFile(vooyaFile, ' world')

  t.is(await nodeFs.readFile(vooyaFile, 'utf8'), await nodeFs.readFile(nodeFile, 'utf8'))
})

test('appendFile: promise creates missing files like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-created.txt')
  const vooyaFile = path.join(root, 'vooya-created.txt')

  await nodeFs.appendFile(nodeFile, 'created')
  await appendFile(vooyaFile, 'created')

  t.is(await nodeFs.readFile(vooyaFile, 'utf8'), await nodeFs.readFile(nodeFile, 'utf8'))
})

test('appendFile: promise representative encoding matches node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-hex.bin')
  const vooyaFile = path.join(root, 'vooya-hex.bin')

  await nodeFs.appendFile(nodeFile, '6869', { encoding: 'hex' })
  await appendFile(vooyaFile, '6869', { encoding: 'hex' })

  t.deepEqual(await nodeFs.readFile(vooyaFile), await nodeFs.readFile(nodeFile))
})

test('appendFile: sync appends Buffer data like node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-sync.bin')
  const vooyaFile = path.join(root, 'vooya-sync.bin')
  nodeFsSync.writeFileSync(nodeFile, Buffer.from([1, 2]))
  nodeFsSync.writeFileSync(vooyaFile, Buffer.from([1, 2]))

  nodeFsSync.appendFileSync(nodeFile, Buffer.from([3, 4]))
  appendFileSync(vooyaFile, Buffer.from([3, 4]))

  t.deepEqual(nodeFsSync.readFileSync(vooyaFile), nodeFsSync.readFileSync(nodeFile))
})

test('appendFile: exclusive append flag rejects existing files in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-existing.txt')
  const vooyaFile = path.join(root, 'vooya-existing.txt')
  await nodeFs.writeFile(nodeFile, 'existing')
  await nodeFs.writeFile(vooyaFile, 'existing')

  const nodeResult = await capture(() => nodeFs.appendFile(nodeFile, 'x', { flag: 'ax' }))
  const vooyaResult = await capture(() => appendFile(vooyaFile, 'x', { flag: 'ax' }) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
})

test('appendFile: missing parent rejects or throws in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'missing-node', 'file.txt')
  const vooyaFile = path.join(root, 'missing-vooya', 'file.txt')

  const nodeResult = await capture(() => nodeFs.appendFile(nodeFile, 'data'))
  const vooyaResult = await capture(() => appendFile(vooyaFile, 'data') as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.appendFileSync(nodeFile, 'data'))
  t.throws(() => appendFileSync(vooyaFile, 'data'))
})
