import test from 'ava'
import * as nodeFs from 'node:fs/promises'
import * as path from 'node:path'
import { readdir } from '../../../index.js'
import { createScaleFixture, removeFixture } from '../../fixtures/fs-scale.ts'
import { capture, normalizeDirents, normalizePaths } from '../_helpers/normalize.ts'

test('readdir: promise names match node:fs/promises on tiny fixture', async (t) => {
  const fixture = await createScaleFixture('readdir', 'tiny')
  try {
    const nodeResult = await nodeFs.readdir(fixture.root)
    const vooyaResult = (await readdir(fixture.root)) as string[]
    t.deepEqual(normalizePaths(vooyaResult), normalizePaths(nodeResult))
  } finally {
    await removeFixture(fixture.root)
  }
})

test('readdir: promise withFileTypes matches Node dirent predicates', async (t) => {
  const fixture = await createScaleFixture('readdir', 'tiny')
  try {
    const nodeResult = await nodeFs.readdir(fixture.root, { withFileTypes: true })
    const vooyaResult = (await readdir(fixture.root, { withFileTypes: true })) as unknown[]
    t.deepEqual(normalizeDirents(vooyaResult), normalizeDirents(nodeResult))
  } finally {
    await removeFixture(fixture.root)
  }
})

test('readdir: promise recursive paths match Node output', async (t) => {
  const fixture = await createScaleFixture('readdir', 'small')
  try {
    const nodeResult = (await nodeFs.readdir(fixture.root, { recursive: true })) as string[]
    const vooyaResult = (await readdir(fixture.root, { recursive: true })) as string[]
    t.deepEqual(normalizePaths(vooyaResult), normalizePaths(nodeResult))
  } finally {
    await removeFixture(fixture.root)
  }
})

test('readdir: missing directory rejects in both implementations', async (t) => {
  const missing = path.join(process.cwd(), '.vooya-fs-no-such-readdir')
  const nodeResult = await capture(() => nodeFs.readdir(missing))
  const vooyaResult = await capture(() => readdir(missing) as Promise<unknown>)

  t.false(nodeResult.ok)
  t.false(vooyaResult.ok)
})
