import test from 'ava'
import { cpSync, cp } from '../index.js'
import * as nodeFs from 'node:fs'
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-cp-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ===== cpSync: file =====

test('cpSync: should copy a single file', (t) => {
  const dir = tmpDir('file')
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'hello cp')

  cpSync(src, dest)

  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'hello cp')
})

test('cpSync: should overwrite existing file by default (force=true)', (t) => {
  const dir = tmpDir('overwrite')
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'new')
  writeFileSync(dest, 'old')

  cpSync(src, dest)

  t.is(readFileSync(dest, 'utf8'), 'new')
})

test('cpSync: errorOnExist should throw when dest exists', (t) => {
  const dir = tmpDir('err-exist')
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'data')
  writeFileSync(dest, 'existing')

  t.throws(() => cpSync(src, dest, { errorOnExist: true, force: false }), { message: /EEXIST/ })
})

test('cpSync: force=false should not overwrite', (t) => {
  const dir = tmpDir('no-force')
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'new')
  writeFileSync(dest, 'old')

  cpSync(src, dest, { force: false })

  t.is(readFileSync(dest, 'utf8'), 'old')
})

test('cpSync: should throw ENOENT on non-existent source', (t) => {
  const dir = tmpDir('noent')
  t.throws(() => cpSync(join(dir, 'nope'), join(dir, 'dest')), { message: /ENOENT/ })
})

// ===== cpSync: directory =====

test('cpSync: should throw on directory without recursive', (t) => {
  const dir = tmpDir('dir-no-rec')
  const src = join(dir, 'srcdir')
  mkdirSync(src)
  writeFileSync(join(src, 'f.txt'), 'data')

  t.throws(() => cpSync(src, join(dir, 'destdir')), { message: /recursive/ })
})

test('cpSync: recursive should copy directory tree', (t) => {
  const dir = tmpDir('recursive')
  const src = join(dir, 'src')
  mkdirSync(join(src, 'sub'), { recursive: true })
  writeFileSync(join(src, 'a.txt'), 'aaa')
  writeFileSync(join(src, 'sub', 'b.txt'), 'bbb')

  const dest = join(dir, 'dest')
  cpSync(src, dest, { recursive: true })

  t.true(existsSync(join(dest, 'a.txt')))
  t.true(existsSync(join(dest, 'sub', 'b.txt')))
  t.is(readFileSync(join(dest, 'a.txt'), 'utf8'), 'aaa')
  t.is(readFileSync(join(dest, 'sub', 'b.txt'), 'utf8'), 'bbb')
})

test('cpSync: recursive should handle deeply nested dirs', (t) => {
  const dir = tmpDir('deep')
  const src = join(dir, 'src')
  mkdirSync(join(src, 'a', 'b', 'c'), { recursive: true })
  writeFileSync(join(src, 'a', 'b', 'c', 'deep.txt'), 'deep')

  const dest = join(dir, 'dest')
  cpSync(src, dest, { recursive: true })

  t.is(readFileSync(join(dest, 'a', 'b', 'c', 'deep.txt'), 'utf8'), 'deep')
})

// ===== cpSync: preserveTimestamps =====

test('cpSync: preserveTimestamps should keep mtime', (t) => {
  if (process.platform === 'win32') {
    t.pass('Skipping timestamp test on Windows')
    return
  }
  const dir = tmpDir('timestamps')
  const src = join(dir, 'src.txt')
  writeFileSync(src, 'ts test')
  const pastTime = new Date('2020-01-01T00:00:00Z')
  nodeFs.utimesSync(src, pastTime, pastTime)

  const dest = join(dir, 'dest.txt')
  cpSync(src, dest, { preserveTimestamps: true })

  const srcStat = nodeFs.statSync(src)
  const destStat = nodeFs.statSync(dest)
  t.true(Math.abs(srcStat.mtimeMs - destStat.mtimeMs) < 1000)
})

// ===== async cp =====

test('cp: async should copy a file', async (t) => {
  const dir = tmpDir('async')
  const src = join(dir, 'src.txt')
  const dest = join(dir, 'dest.txt')
  writeFileSync(src, 'async cp')

  await cp(src, dest)

  t.is(readFileSync(dest, 'utf8'), 'async cp')
})

test('cp: async recursive should copy directory', async (t) => {
  const dir = tmpDir('async-rec')
  const src = join(dir, 'src')
  mkdirSync(join(src, 'sub'), { recursive: true })
  writeFileSync(join(src, 'f.txt'), 'file')
  writeFileSync(join(src, 'sub', 'g.txt'), 'sub-file')

  const dest = join(dir, 'dest')
  await cp(src, dest, { recursive: true })

  t.is(readFileSync(join(dest, 'f.txt'), 'utf8'), 'file')
  t.is(readFileSync(join(dest, 'sub', 'g.txt'), 'utf8'), 'sub-file')
})

// ===== dual-run comparison =====

test('dual-run: cpSync file should produce same result as node:fs', (t) => {
  const dir = tmpDir('dual-file')
  const src = join(dir, 'src.txt')
  writeFileSync(src, 'dual cp test 你好')

  const nodeDest = join(dir, 'node-dest.txt')
  const hyperDest = join(dir, 'hyper-dest.txt')

  nodeFs.cpSync(src, nodeDest)
  cpSync(src, hyperDest)

  t.is(readFileSync(hyperDest, 'utf8'), readFileSync(nodeDest, 'utf8'))
})

test('dual-run: cpSync recursive should produce same tree as node:fs', (t) => {
  const dir = tmpDir('dual-tree')
  const src = join(dir, 'src')
  mkdirSync(join(src, 'sub'), { recursive: true })
  writeFileSync(join(src, 'root.txt'), 'root')
  writeFileSync(join(src, 'sub', 'child.txt'), 'child')

  const nodeDest = join(dir, 'node-dest')
  const hyperDest = join(dir, 'hyper-dest')

  nodeFs.cpSync(src, nodeDest, { recursive: true })
  cpSync(src, hyperDest, { recursive: true })

  const nodeFiles = readdirSync(nodeDest, { recursive: true }) as string[]
  const hyperFiles = readdirSync(hyperDest, { recursive: true }) as string[]
  t.deepEqual(hyperFiles.sort(), nodeFiles.sort())

  t.is(readFileSync(join(hyperDest, 'root.txt'), 'utf8'), readFileSync(join(nodeDest, 'root.txt'), 'utf8'))
  t.is(
    readFileSync(join(hyperDest, 'sub', 'child.txt'), 'utf8'),
    readFileSync(join(nodeDest, 'sub', 'child.txt'), 'utf8'),
  )
})
