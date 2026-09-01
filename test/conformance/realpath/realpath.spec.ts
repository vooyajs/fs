import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { realpath, realpathSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-realpath-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

function assertSameResolvedPath(
  t: { is(actual: unknown, expected: unknown): void; true(value: boolean): void },
  actual: string,
  expected: string,
) {
  if (process.platform === 'win32') {
    const actualStat = nodeFsSync.statSync(actual)
    const expectedStat = nodeFsSync.statSync(expected)
    t.true(actualStat.dev === expectedStat.dev && actualStat.ino === expectedStat.ino)
  } else {
    t.is(actual, expected)
  }
}

test('realpath: promise resolves relative paths like node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const dir = path.join(root, 'a')
  const file = path.join(dir, 'file.txt')
  await nodeFs.mkdir(dir)
  await nodeFs.writeFile(file, 'realpath')
  const input = path.join(root, 'a', '..', 'a', 'file.txt')

  assertSameResolvedPath(t, (await realpath(input)) as string, await nodeFs.realpath(input))
})

test('realpath: promise resolves symlinks like node:fs/promises', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const link = path.join(root, 'link.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.symlink(target, link)

  assertSameResolvedPath(t, (await realpath(link)) as string, await nodeFs.realpath(link))
})

test('realpath: sync resolves paths like node:fs', async (t) => {
  const root = await withFixture(t)
  const dir = path.join(root, 'sync')
  const file = path.join(dir, 'file.txt')
  await nodeFs.mkdir(dir)
  await nodeFs.writeFile(file, 'sync')

  assertSameResolvedPath(t, realpathSync(path.join(dir, '.', 'file.txt')), nodeFsSync.realpathSync(file))
})

test('realpath: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')

  const nodeResult = await capture(() => nodeFs.realpath(missing))
  const vooyaResult = await capture(() => realpath(missing) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.realpathSync(missing))
  t.throws(() => realpathSync(missing))
})

test('realpath: broken symlink paths reject or throw in both implementations', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return
  }

  const root = await withFixture(t)
  const link = path.join(root, 'broken.txt')
  await nodeFs.symlink(path.join(root, 'missing-target.txt'), link)

  const nodeResult = await capture(() => nodeFs.realpath(link))
  const vooyaResult = await capture(() => realpath(link) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.realpathSync(link))
  t.throws(() => realpathSync(link))
})
