import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { copyFile, copyFileSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-copyfile-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('copyFile: promise copies bytes like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const src = path.join(root, 'src.txt')
  const nodeDest = path.join(root, 'node.txt')
  const vooyaDest = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(src, 'copy file\nhello')

  await nodeFs.copyFile(src, nodeDest)
  await copyFile(src, vooyaDest)

  t.deepEqual(await nodeFs.readFile(vooyaDest), await nodeFs.readFile(nodeDest))
})

test('copyFile: promise overwrites existing destination like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const src = path.join(root, 'src.txt')
  const nodeDest = path.join(root, 'node.txt')
  const vooyaDest = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(src, 'replacement')
  await nodeFs.writeFile(nodeDest, 'old')
  await nodeFs.writeFile(vooyaDest, 'old')

  await nodeFs.copyFile(src, nodeDest)
  await copyFile(src, vooyaDest)

  t.is(await nodeFs.readFile(vooyaDest, 'utf8'), await nodeFs.readFile(nodeDest, 'utf8'))
})

test('copyFile: COPYFILE_EXCL rejects when destination exists like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const src = path.join(root, 'src.txt')
  const nodeDest = path.join(root, 'node.txt')
  const vooyaDest = path.join(root, 'vooya.txt')
  await nodeFs.writeFile(src, 'data')
  await nodeFs.writeFile(nodeDest, 'existing')
  await nodeFs.writeFile(vooyaDest, 'existing')

  const nodeResult = await capture(() => nodeFs.copyFile(src, nodeDest, nodeFsSync.constants.COPYFILE_EXCL))
  const vooyaResult = await capture(
    () => copyFile(src, vooyaDest, nodeFsSync.constants.COPYFILE_EXCL) as Promise<unknown>,
  )

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.is(await nodeFs.readFile(vooyaDest, 'utf8'), 'existing')
})

test('copyFile: sync copies bytes like node:fs', async (t) => {
  const root = await withFixture(t)
  const src = path.join(root, 'src.bin')
  const nodeDest = path.join(root, 'node.bin')
  const vooyaDest = path.join(root, 'vooya.bin')
  const data = Buffer.from([0, 1, 2, 3, 255])
  await nodeFs.writeFile(src, data)

  nodeFsSync.copyFileSync(src, nodeDest)
  copyFileSync(src, vooyaDest)

  t.deepEqual(nodeFsSync.readFileSync(vooyaDest), nodeFsSync.readFileSync(nodeDest))
})

test('copyFile: missing source rejects or throws in both implementations', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')
  const nodeDest = path.join(root, 'node.txt')
  const vooyaDest = path.join(root, 'vooya.txt')

  const nodeResult = await capture(() => nodeFs.copyFile(missing, nodeDest))
  const vooyaResult = await capture(() => copyFile(missing, vooyaDest) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.copyFileSync(missing, nodeDest))
  t.throws(() => copyFileSync(missing, vooyaDest))
})
