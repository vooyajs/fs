import test from 'ava'
import { copyFileSync, copyFile } from '../index.js'
import * as nodeFs from 'node:fs'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

test('copyFileSync: should copy a file', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'original')

  copyFileSync(src, dest)

  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'original')
})

test('copyFileSync: should throw on non-existent source', (t) => {
  const dir = tmpDir()
  t.throws(() => copyFileSync(join(dir, 'nope'), join(dir, 'dest')), { message: /ENOENT/ })
})

test('copyFileSync: COPYFILE_EXCL should throw if dest exists', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'data')
  writeFileSync(dest, 'existing')

  t.throws(() => copyFileSync(src, dest, 1), { message: /EEXIST/ })
})

test('copyFile: async should copy a file', async (t) => {
  const dir = tmpDir()
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'hello')

  await copyFile(src, dest)

  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'hello')
})

// ===== dual-run comparison =====

test('dual-run: copyFileSync should produce identical file as node:fs', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'src-dual.txt')
  const nodeDest = join(dir, 'node-dest.txt')
  const hyperDest = join(dir, 'hyper-dest.txt')
  writeFileSync(src, 'dual-run copy test 你好')

  nodeFs.copyFileSync(src, nodeDest)
  copyFileSync(src, hyperDest)

  const nodeContent = readFileSync(nodeDest, 'utf8')
  const hyperContent = readFileSync(hyperDest, 'utf8')
  t.is(hyperContent, nodeContent)

  const nodeStat = nodeFs.statSync(nodeDest)
  const hyperStat = nodeFs.statSync(hyperDest)
  t.is(hyperStat.size, nodeStat.size)
})
