import test from 'ava'
import { readlinkSync, readlink } from '../index.js'
import { writeFileSync, mkdirSync, symlinkSync, readlinkSync as nodeReadlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-readlink-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

test('readlinkSync: should read symbolic link target', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target.txt')
  const link = join(dir, 'link.txt')
  writeFileSync(target, 'hello')
  symlinkSync(target, link)

  const result = readlinkSync(link)
  t.is(result, target)
})

test('readlinkSync: should match node:fs readlinkSync', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target2.txt')
  const link = join(dir, 'link2.txt')
  writeFileSync(target, 'hello')
  symlinkSync(target, link)

  const nodeResult = nodeReadlinkSync(link, 'utf8')
  const hyperResult = readlinkSync(link)
  t.is(hyperResult, nodeResult)
})

test('readlinkSync: should throw ENOENT on non-existent path', (t) => {
  t.throws(() => readlinkSync('/tmp/no-such-link-' + Date.now()), { message: /ENOENT/ })
})

test('readlinkSync: should throw EINVAL on non-symlink', (t) => {
  const dir = tmpDir()
  const file = join(dir, 'regular.txt')
  writeFileSync(file, 'not a symlink')
  t.throws(() => readlinkSync(file), { message: /EINVAL/ })
})

test('readlink: async should read symbolic link', async (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target3.txt')
  const link = join(dir, 'link3.txt')
  writeFileSync(target, 'hello')
  symlinkSync(target, link)

  const result = await readlink(link)
  t.is(result, target)
})

test('readlink: async should throw on non-existent path', async (t) => {
  await t.throwsAsync(async () => await readlink('/tmp/no-such-link-' + Date.now()), { message: /ENOENT/ })
})
