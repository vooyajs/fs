import test from 'ava'
import * as nodeFs from 'node:fs/promises'
import * as nodeFsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { glob } from '../../../index.js'
import { createScaleFixture, removeFixture } from '../../fixtures/fs-scale.ts'
import { normalizeDirents, normalizePaths } from '../_helpers/normalize.ts'

async function collectNodeGlob(pattern: string, options: Record<string, unknown>): Promise<unknown[]> {
  const results: unknown[] = []
  for await (const entry of nodeFs.glob(pattern, options)) {
    results.push(entry)
  }
  return results
}

test('glob: promise recursive pattern matches node:fs/promises', async (t) => {
  const fixture = await createScaleFixture('glob', 'small')
  try {
    const nodeResult = (await collectNodeGlob('**/*.txt', { cwd: fixture.root })) as string[]
    const vooyaResult = (await glob('**/*.txt', { cwd: fixture.root })) as string[]
    t.deepEqual(normalizePaths(vooyaResult), normalizePaths(nodeResult))
  } finally {
    await removeFixture(fixture.root)
  }
})

test('glob: promise withFileTypes matches Node dirent predicates', async (t) => {
  const fixture = await createScaleFixture('glob', 'tiny')
  try {
    const nodeResult = await collectNodeGlob('**/*.txt', { cwd: fixture.root, withFileTypes: true })
    const vooyaResult = (await glob('**/*.txt', { cwd: fixture.root, withFileTypes: true })) as unknown[]
    t.deepEqual(normalizeDirents(vooyaResult), normalizeDirents(nodeResult))
  } finally {
    await removeFixture(fixture.root)
  }
})

test('glob: no-match pattern returns an empty array', async (t) => {
  const fixture = await createScaleFixture('glob', 'tiny')
  try {
    const vooyaResult = (await glob('**/*.missing', { cwd: fixture.root })) as string[]
    t.deepEqual(vooyaResult, [])
  } finally {
    await removeFixture(fixture.root)
  }
})

test('glob: missing cwd returns an empty array like node:fs', async (t) => {
  const cwd = path.join(os.tmpdir(), `vooya-fs-missing-glob-cwd-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const nodeResult = await collectNodeGlob('*.txt', { cwd })
  const vooyaResult = (await glob('*.txt', { cwd })) as string[]
  t.deepEqual(vooyaResult, nodeResult)
})

test('glob: root-only patterns do not match nested entries', async (t) => {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-glob-root-only-'))
  t.teardown(() => nodeFs.rm(root, { recursive: true, force: true }))
  await nodeFs.writeFile(path.join(root, 'top.txt'), 'top')
  await nodeFs.mkdir(path.join(root, 'nested'))
  await nodeFs.writeFile(path.join(root, 'nested', 'child.txt'), 'child')

  const nodeResult = nodeFsSync.globSync('*.txt', { cwd: root })
  const vooyaResult = (await glob('*.txt', { cwd: root })) as string[]
  t.deepEqual(normalizePaths(vooyaResult), normalizePaths(nodeResult))
})
