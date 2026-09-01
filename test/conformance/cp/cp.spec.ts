import test from 'ava'
import * as nodeFs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { cp } from '../../../index.js'
import { createScaleFixture, listTree, removeFixture } from '../../fixtures/fs-scale.ts'
import { capture } from '../_helpers/normalize.ts'

test('cp: promise recursive copy matches node:fs/promises side effects', async (t) => {
  const fixture = await createScaleFixture('cp', 'tiny')
  const destRoot = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-cp-dest-'))
  const nodeDest = path.join(destRoot, 'node')
  const vooyaDest = path.join(destRoot, 'vooya')

  try {
    await nodeFs.cp(fixture.root, nodeDest, { recursive: true })
    await cp(fixture.root, vooyaDest, { recursive: true })
    t.deepEqual(await listTree(vooyaDest), await listTree(nodeDest))
  } finally {
    await removeFixture(fixture.root)
    await removeFixture(destRoot)
  }
})

test('cp: missing source rejects in both implementations', async (t) => {
  const dest = path.join(os.tmpdir(), `vooya-fs-cp-missing-${Date.now()}`)
  const missing = path.join(os.tmpdir(), `vooya-fs-cp-source-${Date.now()}`)
  const nodeResult = await capture(() => nodeFs.cp(missing, dest, { recursive: true }))
  const vooyaResult = await capture(() => cp(missing, dest, { recursive: true }) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
})
