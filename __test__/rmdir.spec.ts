import test from 'ava'
import { rmdirSync, rmdir, mkdirSync } from '../index.js'
import { existsSync, writeFileSync, mkdirSync as nodeMkdirSync, rmdirSync as nodeRmdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-rmdir-${Date.now()}-${name}`)
  nodeMkdirSync(dir, { recursive: true })
  return dir
}

test('rmdirSync: should remove an empty directory', (t) => {
  const dir = tmpDir('empty')
  const target = join(dir, 'sub')
  mkdirSync(target)
  t.true(existsSync(target))
  rmdirSync(target)
  t.false(existsSync(target))
})

test('rmdirSync: should throw on non-empty directory', (t) => {
  const dir = tmpDir('notempty')
  const target = join(dir, 'sub')
  mkdirSync(target)
  writeFileSync(join(target, 'file.txt'), 'data')
  t.throws(() => rmdirSync(target), { message: /ENOTEMPTY/ })
})

test('rmdirSync: should throw on non-existent path', (t) => {
  t.throws(() => rmdirSync('/tmp/vooya-fs-no-such-dir-' + Date.now()), { message: /ENOENT/ })
})

test('rmdir: async should remove empty directory', async (t) => {
  const dir = tmpDir('async')
  const target = join(dir, 'sub')
  mkdirSync(target)
  await rmdir(target)
  t.false(existsSync(target))
})

// ===== dual-run comparison =====

test('dual-run: rmdirSync should leave same state as node:fs.rmdirSync', (t) => {
  const dir1 = tmpDir('node-rmdir')
  const dir2 = tmpDir('hyper-rmdir')
  const nodeTarget = join(dir1, 'sub')
  const hyperTarget = join(dir2, 'sub')

  nodeMkdirSync(nodeTarget)
  mkdirSync(hyperTarget)

  nodeRmdirSync(nodeTarget)
  rmdirSync(hyperTarget)

  t.is(existsSync(hyperTarget), existsSync(nodeTarget))
})
