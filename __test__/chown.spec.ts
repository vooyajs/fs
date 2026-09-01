import test from 'ava'
import { chownSync, chown, statSync } from '../index.js'
import { writeFileSync, mkdirSync, statSync as nodeStatSync, chownSync as nodeChownSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpFile(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-chown-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, 'test')
  return file
}

test('chownSync: should not throw on valid file with current uid/gid', (t) => {
  if (process.platform === 'win32') {
    t.pass('Skipping chown test on Windows')
    return
  }
  const file = tmpFile('chown.txt')
  const s = nodeStatSync(file)
  t.notThrows(() => chownSync(file, s.uid, s.gid))
})

test('chownSync: should match node:fs behavior', (t) => {
  if (process.platform === 'win32') {
    t.pass('Skipping chown test on Windows')
    return
  }
  const file = tmpFile('compare.txt')
  const s = nodeStatSync(file)

  nodeChownSync(file, s.uid, s.gid)
  const nodeStat = nodeStatSync(file)

  chownSync(file, s.uid, s.gid)
  const hyperStat = statSync(file)

  t.is(hyperStat.uid, nodeStat.uid)
  t.is(hyperStat.gid, nodeStat.gid)
})

test('chownSync: should throw on non-existent file', (t) => {
  t.throws(() => chownSync('/tmp/no-such-file-' + Date.now(), 0, 0), { message: /ENOENT/ })
})

test('chown: async should not throw on valid file', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Skipping chown test on Windows')
    return
  }
  const file = tmpFile('async-chown.txt')
  const s = nodeStatSync(file)
  await t.notThrowsAsync(async () => await chown(file, s.uid, s.gid))
})

test('chown: async should throw on non-existent file', async (t) => {
  await t.throwsAsync(async () => await chown('/tmp/no-such-file-' + Date.now(), 0, 0), { message: /ENOENT/ })
})
