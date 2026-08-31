import test from 'ava'
import * as nodeFsSync from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { access, accessSync } from '../../../index.js'
import { capture } from '../_helpers/normalize.ts'

async function withFixture(t: { teardown(fn: () => void | Promise<void>): void }) {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-conformance-access-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  return root
}

async function assertPromiseAccessMatches(
  t: { is(actual: unknown, expected: unknown): void },
  file: string,
  mode?: number,
) {
  const nodeResult = await capture(() => nodeFs.access(file, mode))
  const vooyaResult = await capture(() => access(file, mode) as Promise<unknown>)

  t.is(vooyaResult.ok, nodeResult.ok)
}

function assertSyncAccessMatches(t: { is(actual: unknown, expected: unknown): void }, file: string, mode?: number) {
  let nodeOk = true
  let vooyaOk = true

  try {
    nodeFsSync.accessSync(file, mode)
  } catch {
    nodeOk = false
  }

  try {
    accessSync(file, mode)
  } catch {
    vooyaOk = false
  }

  t.is(vooyaOk, nodeOk)
}

test('access: promise default mode matches node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'file.txt')
  await nodeFs.writeFile(file, 'access')

  await assertPromiseAccessMatches(t, file)
})

test('access: promise explicit F_OK/R_OK/W_OK modes match node:fs/promises', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'modes.txt')
  await nodeFs.writeFile(file, 'modes')

  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.F_OK)
  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.R_OK)
  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.W_OK)
  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.R_OK | nodeFsSync.constants.W_OK)
})

test('access: sync explicit modes match node:fs', async (t) => {
  const root = await withFixture(t)
  const file = path.join(root, 'sync.txt')
  await nodeFs.writeFile(file, 'sync')

  assertSyncAccessMatches(t, file)
  assertSyncAccessMatches(t, file, nodeFsSync.constants.F_OK)
  assertSyncAccessMatches(t, file, nodeFsSync.constants.R_OK)
  assertSyncAccessMatches(t, file, nodeFsSync.constants.W_OK)
})

test('access: X_OK matches node:fs for executable files on unix', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows execute permission checks do not map to POSIX mode bits')
    return
  }

  const root = await withFixture(t)
  const file = path.join(root, 'script.sh')
  await nodeFs.writeFile(file, '#!/bin/sh\n')
  await nodeFs.chmod(file, 0o755)

  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.X_OK)
  assertSyncAccessMatches(t, file, nodeFsSync.constants.X_OK)
})

test('access: missing paths reject or throw in both implementations', async (t) => {
  const root = await withFixture(t)
  const missing = path.join(root, 'missing.txt')

  await assertPromiseAccessMatches(t, missing)
  assertSyncAccessMatches(t, missing)
})

test('access: permission denied behavior matches node:fs where platform mode bits apply', async (t) => {
  if (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)) {
    t.pass('permission-denied checks are platform or root dependent')
    return
  }

  const root = await withFixture(t)
  const file = path.join(root, 'private.txt')
  await nodeFs.writeFile(file, 'private')
  await nodeFs.chmod(file, 0o000)
  t.teardown(() => nodeFsSync.chmodSync(file, 0o600))

  await assertPromiseAccessMatches(t, file, nodeFsSync.constants.R_OK)
  assertSyncAccessMatches(t, file, nodeFsSync.constants.R_OK)
})
