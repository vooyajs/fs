import test from 'ava'
import * as nodeFs from 'node:fs/promises'
import * as nodeFsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { writeFile, writeFileSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-writeFile-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

test('writeFile: promise string side effects match node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.txt')
  const vooyaFile = path.join(root, 'vooya.txt')

  await nodeFs.writeFile(nodeFile, 'hello writeFile', { encoding: 'utf8' })
  await writeFile(vooyaFile, 'hello writeFile', { encoding: 'utf8' })

  t.is(await nodeFs.readFile(vooyaFile, 'utf8'), await nodeFs.readFile(nodeFile, 'utf8'))
})

test('writeFile: promise Buffer side effects match node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node.bin')
  const vooyaFile = path.join(root, 'vooya.bin')
  const data = Buffer.from([0, 1, 2, 255])

  await nodeFs.writeFile(nodeFile, data)
  await writeFile(vooyaFile, data)

  t.deepEqual(await nodeFs.readFile(vooyaFile), await nodeFs.readFile(nodeFile))
})

test('writeFile: representative encodings match node:fs/promises', async (t) => {
  const root = await withFixture(t)

  for (const [encoding, value] of [
    ['hex', 'cafebabe'],
    ['hex', 'abc'],
    ['hex', '1ag123'],
    ['base64', Buffer.from('hello').toString('base64')],
    ['latin1', 'abc'],
  ] as const) {
    const nodeFile = path.join(root, `node-${encoding}.bin`)
    const vooyaFile = path.join(root, `vooya-${encoding}.bin`)
    await nodeFs.writeFile(nodeFile, value, { encoding })
    await writeFile(vooyaFile, value, { encoding })
    t.deepEqual(await nodeFs.readFile(vooyaFile), await nodeFs.readFile(nodeFile), encoding)
  }
})

test('writeFile: sync string and Buffer side effects match node:fs', async (t) => {
  const root = await withFixture(t)
  const nodeString = path.join(root, 'node-string.txt')
  const vooyaString = path.join(root, 'vooya-string.txt')
  const nodeBuffer = path.join(root, 'node-buffer.bin')
  const vooyaBuffer = path.join(root, 'vooya-buffer.bin')

  nodeFsSync.writeFileSync(nodeString, 'sync text')
  writeFileSync(vooyaString, 'sync text')
  nodeFsSync.writeFileSync(nodeBuffer, Buffer.from([1, 2, 3]))
  writeFileSync(vooyaBuffer, Buffer.from([1, 2, 3]))

  t.is(nodeFsSync.readFileSync(vooyaString, 'utf8'), nodeFsSync.readFileSync(nodeString, 'utf8'))
  t.deepEqual(nodeFsSync.readFileSync(vooyaBuffer), nodeFsSync.readFileSync(nodeBuffer))
})

test('writeFile: flag wx rejects existing files in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-exists.txt')
  const vooyaFile = path.join(root, 'vooya-exists.txt')
  await nodeFs.writeFile(nodeFile, 'base')
  await nodeFs.writeFile(vooyaFile, 'base')

  const nodeResult = await capture(() => nodeFs.writeFile(nodeFile, 'next', { flag: 'wx' }))
  const vooyaResult = await capture(() => writeFile(vooyaFile, 'next', { flag: 'wx' }) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
})

test('writeFile: missing parent rejects in both implementations', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-missing', 'file.txt')
  const vooyaFile = path.join(root, 'vooya-missing', 'file.txt')

  const nodeResult = await capture(() => nodeFs.writeFile(nodeFile, 'data'))
  const vooyaResult = await capture(() => writeFile(vooyaFile, 'data') as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
})

test('writeFile: invalid flags reject without modifying the file', async (t) => {
  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-invalid-flag.txt')
  const vooyaFile = path.join(root, 'vooya-invalid-flag.txt')
  await nodeFs.writeFile(nodeFile, 'before')
  await nodeFs.writeFile(vooyaFile, 'before')

  await t.throwsAsync(() => nodeFs.writeFile(nodeFile, 'after', { flag: 'invalid' as never }))
  await t.throwsAsync(() => writeFile(vooyaFile, 'after', { flag: 'invalid' }) as Promise<unknown>)
  t.is(await nodeFs.readFile(vooyaFile, 'utf8'), 'before')
})

test('writeFile: mode is applied on unix platforms', async (t) => {
  if (process.platform === 'win32') {
    t.pass('mode semantics differ on Windows')
    return
  }

  const root = await withFixture(t)
  const file = path.join(root, 'mode.txt')
  await writeFile(file, 'mode', { mode: 0o600 })

  t.is(nodeFsSync.statSync(file).mode & 0o777, 0o600)
})

test('writeFile: creation mode respects umask like node:fs', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows mode bits are platform dependent')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-umask.txt')
  const vooyaFile = path.join(root, 'vooya-umask.txt')
  await nodeFs.writeFile(nodeFile, 'node', { mode: 0o666 })
  await writeFile(vooyaFile, 'vooya', { mode: 0o666 })

  t.is(nodeFsSync.statSync(vooyaFile).mode & 0o777, nodeFsSync.statSync(nodeFile).mode & 0o777)
})

test('writeFile: mode does not change permissions of an existing file', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows mode bits are platform dependent')
    return
  }

  const root = await withFixture(t)
  const nodeFile = path.join(root, 'node-existing-mode.txt')
  const vooyaFile = path.join(root, 'vooya-existing-mode.txt')
  await nodeFs.writeFile(nodeFile, 'before', { mode: 0o600 })
  await nodeFs.writeFile(vooyaFile, 'before', { mode: 0o600 })
  await nodeFs.writeFile(nodeFile, 'after', { mode: 0o777 })
  await writeFile(vooyaFile, 'after', { mode: 0o777 })

  t.is(nodeFsSync.statSync(vooyaFile).mode & 0o777, nodeFsSync.statSync(nodeFile).mode & 0o777)
})
