import test from 'ava'
import { linkSync, link, statSync } from '../index.js'
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync as nodeStatSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-link-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ===== sync =====

test('linkSync: should create a hard link', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'source.txt')
  const dest = join(dir, 'hardlink.txt')
  writeFileSync(src, 'hello')

  linkSync(src, dest)
  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'hello')
})

test('linkSync: hard link should share the same inode', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'source2.txt')
  const dest = join(dir, 'hardlink2.txt')
  writeFileSync(src, 'hello')

  linkSync(src, dest)
  const srcStat = statSync(src)
  const destStat = statSync(dest)
  if (process.platform !== 'win32') {
    t.is(srcStat.ino, destStat.ino)
    t.is(srcStat.nlink, 2)
  } else {
    t.true(srcStat.isFile() && destStat.isFile())
  }
})

test('linkSync: should throw ENOENT for non-existent source', (t) => {
  const dir = tmpDir()
  t.throws(() => linkSync(join(dir, 'nope.txt'), join(dir, 'link.txt')), { message: /ENOENT/ })
})

test('linkSync: should throw EEXIST if dest already exists', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'src3.txt')
  const dest = join(dir, 'dest3.txt')
  writeFileSync(src, 'hello')
  writeFileSync(dest, 'existing')

  t.throws(() => linkSync(src, dest), { message: /EEXIST/ })
})

test('linkSync: should match node:fs behavior (same inode)', (t) => {
  const dir = tmpDir()
  const src = join(dir, 'compare.txt')
  const dest = join(dir, 'compare-link.txt')
  writeFileSync(src, 'hello')

  linkSync(src, dest)
  const nodeStat = nodeStatSync(dest)
  const hyperStat = statSync(dest)
  // ino is 0 on Windows in vooya-fs; only compare on platforms where we report it
  if (process.platform !== 'win32') {
    t.is(hyperStat.ino, nodeStat.ino)
  } else {
    t.true(hyperStat.isFile() && nodeStat.isFile())
  }
})

// ===== async =====

test('link: async should create a hard link', async (t) => {
  const dir = tmpDir()
  const src = join(dir, 'async-src.txt')
  const dest = join(dir, 'async-link.txt')
  writeFileSync(src, 'async hello')

  await link(src, dest)
  t.true(existsSync(dest))
  t.is(readFileSync(dest, 'utf8'), 'async hello')
})

test('link: async should throw ENOENT for non-existent source', async (t) => {
  const dir = tmpDir()
  await t.throwsAsync(async () => await link(join(dir, 'nope.txt'), join(dir, 'link.txt')), {
    message: /ENOENT/,
  })
})
