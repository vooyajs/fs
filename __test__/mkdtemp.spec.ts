import test from 'ava'
import { mkdtempSync, mkdtemp } from '../index.js'
import * as nodeFs from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const prefix = join(tmpdir(), 'vooya-fs-test-mkdtemp-')

// ===== sync =====

test('mkdtempSync: should create a temp directory and return its path', (t) => {
  const dir = mkdtempSync(prefix)
  t.true(typeof dir === 'string')
  t.true(dir.startsWith(prefix))
  t.true(existsSync(dir))
})

test('mkdtempSync: should create unique directories on each call', (t) => {
  const dir1 = mkdtempSync(prefix)
  const dir2 = mkdtempSync(prefix)
  t.not(dir1, dir2)
  t.true(existsSync(dir1))
  t.true(existsSync(dir2))
})

test('mkdtempSync: should throw ENOENT for non-existent parent', (t) => {
  t.throws(() => mkdtempSync('/tmp/no-such-parent-dir-999/prefix-'), { message: /ENOENT/ })
})

// ===== async =====

test('mkdtemp: async should create a temp directory', async (t) => {
  const dir = (await mkdtemp(prefix)) as string
  t.true(typeof dir === 'string')
  t.true(dir.startsWith(prefix))
  t.true(existsSync(dir))
})

test('mkdtemp: async should throw ENOENT for non-existent parent', async (t) => {
  await t.throwsAsync(async () => await mkdtemp('/tmp/no-such-parent-dir-999/prefix-'), {
    message: /ENOENT/,
  })
})

// ===== dual-run comparison =====

test('dual-run: mkdtempSync should behave like node:fs.mkdtempSync', (t) => {
  const nodeDir = nodeFs.mkdtempSync(prefix)
  const hyperDir = mkdtempSync(prefix)

  t.true(typeof nodeDir === 'string')
  t.true(typeof hyperDir === 'string')
  t.true(nodeDir.startsWith(prefix))
  t.true(hyperDir.startsWith(prefix))
  t.not(nodeDir, hyperDir)
  t.true(existsSync(nodeDir))
  t.true(existsSync(hyperDir))

  t.true(nodeFs.statSync(nodeDir).isDirectory())
  t.true(nodeFs.statSync(hyperDir).isDirectory())
})
