import test from 'ava'
import { renameSync, rename } from '../index.js'
import * as nodeFs from 'node:fs'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-rename-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

test('renameSync: should rename a file', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'old.txt')
  const dest = join(dir, 'new.txt')
  writeFileSync(src, 'content')

  renameSync(src, dest)

  t.false(existsSync(src))
  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'content')
})

test('renameSync: should throw on non-existent source', (t) => {
  const dir = tmpDir()
  t.throws(() => renameSync(join(dir, 'nope'), join(dir, 'other')), { message: /ENOENT/ })
})

test('rename: async should rename a file', async (t) => {
  const dir = tmpDir()
  const src = join(dir, 'a.txt')
  const dest = join(dir, 'b.txt')
  writeFileSync(src, 'data')

  await rename(src, dest)

  t.false(existsSync(src))
  t.true(existsSync(dest))
})

// ===== dual-run comparison =====

test('dual-run: renameSync should produce same result as node:fs', (t) => {
  const dir = tmpDir()
  const nodeSrc = join(dir, 'node-src.txt')
  const nodeDest = join(dir, 'node-dest.txt')
  const hyperSrc = join(dir, 'hyper-src.txt')
  const hyperDest = join(dir, 'hyper-dest.txt')
  writeFileSync(nodeSrc, 'rename-test')
  writeFileSync(hyperSrc, 'rename-test')

  nodeFs.renameSync(nodeSrc, nodeDest)
  renameSync(hyperSrc, hyperDest)

  t.is(existsSync(hyperSrc), existsSync(nodeSrc))
  t.is(existsSync(hyperDest), existsSync(nodeDest))
  t.is(readFileSync(hyperDest, 'utf8'), readFileSync(nodeDest, 'utf8'))
})
