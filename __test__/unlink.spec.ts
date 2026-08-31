import test from 'ava'
import { unlinkSync, unlink } from '../index.js'
import * as nodeFs from 'node:fs'
import { writeFileSync, existsSync, mkdirSync, rmdirSync as nodeRmdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createTempFile(): string {
  const dir = join(tmpdir(), `vooya-fs-test-unlink-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'test.txt')
  writeFileSync(file, 'hello')
  return file
}

test('unlinkSync: should remove a file', (t) => {
  const file = createTempFile()
  t.true(existsSync(file))
  unlinkSync(file)
  t.false(existsSync(file))
})

test('unlinkSync: should throw on non-existent file', (t) => {
  t.throws(() => unlinkSync('/tmp/vooya-fs-no-such-file-' + Date.now()), { message: /ENOENT/ })
})

test('unlinkSync: should throw on directory', (t) => {
  const dir = join(tmpdir(), `vooya-fs-test-unlink-dir-${Date.now()}`)
  mkdirSync(dir)
  t.throws(() => unlinkSync(dir), { message: /EPERM/ })
  nodeRmdirSync(dir)
})

test('unlink: async should remove a file', async (t) => {
  const file = createTempFile()
  t.true(existsSync(file))
  await unlink(file)
  t.false(existsSync(file))
})

test('unlink: async should throw on non-existent file', async (t) => {
  await t.throwsAsync(async () => await unlink('/tmp/vooya-fs-no-such-' + Date.now()), { message: /ENOENT/ })
})

// ===== dual-run comparison =====

test('dual-run: unlinkSync should produce same result as node:fs', (t) => {
  const dir = join(tmpdir(), `vooya-fs-test-unlink-dual-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const nodeFile = join(dir, 'node.txt')
  const hyperFile = join(dir, 'hyper.txt')
  writeFileSync(nodeFile, 'x')
  writeFileSync(hyperFile, 'x')

  nodeFs.unlinkSync(nodeFile)
  unlinkSync(hyperFile)

  t.is(existsSync(hyperFile), existsSync(nodeFile))
})
