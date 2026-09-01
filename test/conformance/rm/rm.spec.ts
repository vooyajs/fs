import test from 'ava'
import * as nodeFs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { rm } from '../../../index.js'
import { copyFixture, createScaleFixture, removeFixture } from '../../fixtures/fs-scale.ts'

test('rm: promise recursive removal matches node:fs/promises side effects', async (t) => {
  const fixture = await createScaleFixture('rm', 'tiny')
  const nodeRoot = await copyFixture(fixture.root, 'node-rm')
  const vooyaRoot = await copyFixture(fixture.root, 'vooya-rm')

  try {
    await nodeFs.rm(nodeRoot, { recursive: true })
    await rm(vooyaRoot, { recursive: true })
    await t.throwsAsync(() => nodeFs.stat(nodeRoot), { code: 'ENOENT' })
    await t.throwsAsync(() => nodeFs.stat(vooyaRoot), { code: 'ENOENT' })
  } finally {
    await removeFixture(fixture.root)
    await removeFixture(nodeRoot)
    await removeFixture(vooyaRoot)
  }
})

test('rm: force missing path resolves in both implementations', async (t) => {
  const missing = path.join(os.tmpdir(), `vooya-fs-rm-missing-${Date.now()}`)
  await t.notThrowsAsync(() => nodeFs.rm(missing, { force: true }))
  await t.notThrowsAsync(() => rm(missing, { force: true }) as Promise<unknown>)
})

test('rm: removes a broken symlink entry like node:fs/promises', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Windows symlink creation depends on host privileges')
    return
  }

  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-rm-broken-link-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  const nodeLink = path.join(root, 'node-link')
  const vooyaLink = path.join(root, 'vooya-link')
  await nodeFs.symlink('missing-target', nodeLink)
  await nodeFs.symlink('missing-target', vooyaLink)

  await nodeFs.rm(nodeLink)
  await rm(vooyaLink)

  await t.throwsAsync(() => nodeFs.lstat(nodeLink), { code: 'ENOENT' })
  await t.throwsAsync(() => nodeFs.lstat(vooyaLink), { code: 'ENOENT' })
})
