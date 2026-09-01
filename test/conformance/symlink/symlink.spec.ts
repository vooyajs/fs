import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { readlinkSync, symlink, symlinkSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-symlink-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

function skipIfWindows(t: { pass(message?: string): void }): boolean {
  if (process.platform === 'win32') {
    t.pass('symlink privileges vary on Windows')
    return true
  }
  return false
}

test('symlink: promise creates file symlinks like node:fs/promises', async (t) => {
  if (skipIfWindows(t)) return

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const nodeLink = path.join(root, 'node-link.txt')
  const vooyaLink = path.join(root, 'vooya-link.txt')
  await nodeFs.writeFile(target, 'target')

  await nodeFs.symlink(target, nodeLink)
  await symlink(target, vooyaLink)

  t.is(readlinkSync(vooyaLink), nodeFsSync.readlinkSync(nodeLink, 'utf8'))
  t.true(nodeFsSync.lstatSync(vooyaLink).isSymbolicLink())
})

test('symlink: promise stores relative targets like node:fs/promises', async (t) => {
  if (skipIfWindows(t)) return

  const root = await withFixture(t)
  const targetName = 'target.txt'
  const target = path.join(root, targetName)
  const nodeLink = path.join(root, 'node-relative.txt')
  const vooyaLink = path.join(root, 'vooya-relative.txt')
  await nodeFs.writeFile(target, 'target')

  await nodeFs.symlink(targetName, nodeLink)
  await symlink(targetName, vooyaLink)

  t.is(readlinkSync(vooyaLink), nodeFsSync.readlinkSync(nodeLink, 'utf8'))
  t.is(readlinkSync(vooyaLink), targetName)
})

test('symlink: sync creates directory symlinks like node:fs', async (t) => {
  if (skipIfWindows(t)) return

  const root = await withFixture(t)
  const target = path.join(root, 'target-dir')
  const nodeLink = path.join(root, 'node-dir-link')
  const vooyaLink = path.join(root, 'vooya-dir-link')
  await nodeFs.mkdir(target)

  nodeFsSync.symlinkSync(target, nodeLink, 'dir')
  symlinkSync(target, vooyaLink, 'dir')

  t.is(readlinkSync(vooyaLink), nodeFsSync.readlinkSync(nodeLink, 'utf8'))
  t.true(nodeFsSync.lstatSync(vooyaLink).isSymbolicLink())
})

test('symlink: existing link paths reject or throw in both implementations', async (t) => {
  if (skipIfWindows(t)) return

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const nodeLink = path.join(root, 'node-existing.txt')
  const vooyaLink = path.join(root, 'vooya-existing.txt')
  await nodeFs.writeFile(target, 'target')
  await nodeFs.writeFile(nodeLink, 'existing')
  await nodeFs.writeFile(vooyaLink, 'existing')

  const nodeResult = await capture(() => nodeFs.symlink(target, nodeLink))
  const vooyaResult = await capture(() => symlink(target, vooyaLink) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.symlinkSync(target, nodeLink))
  t.throws(() => symlinkSync(target, vooyaLink))
})

test('symlink: missing parent paths reject or throw in both implementations', async (t) => {
  if (skipIfWindows(t)) return

  const root = await withFixture(t)
  const target = path.join(root, 'target.txt')
  const nodeLink = path.join(root, 'missing-node', 'link.txt')
  const vooyaLink = path.join(root, 'missing-vooya', 'link.txt')
  await nodeFs.writeFile(target, 'target')

  const nodeResult = await capture(() => nodeFs.symlink(target, nodeLink))
  const vooyaResult = await capture(() => symlink(target, vooyaLink) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
  t.throws(() => nodeFsSync.symlinkSync(target, nodeLink))
  t.throws(() => symlinkSync(target, vooyaLink))
})
