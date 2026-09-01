import test from 'ava'
import { utimesSync, utimes, statSync } from '../index.js'
import { writeFileSync, mkdirSync, statSync as nodeStatSync, utimesSync as nodeUtimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpFile(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-utimes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, 'test')
  return file
}

function tmpDirPath(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-utimes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const target = join(dir, name)
  mkdirSync(target, { recursive: true })
  return target
}

test('utimesSync: should update atime and mtime', (t) => {
  const file = tmpFile('utimes.txt')
  const atime = 1000
  const mtime = 2000

  utimesSync(file, atime, mtime)
  const s = statSync(file)

  t.is(Math.floor(s.atimeMs / 1000), atime)
  t.is(Math.floor(s.mtimeMs / 1000), mtime)
})

test('utimesSync: should update directory timestamps', (t) => {
  const dir = tmpDirPath('utimes-dir')
  const atime = 1234
  const mtime = 2345

  utimesSync(dir, atime, mtime)
  const s = statSync(dir)

  t.is(Math.floor(s.atimeMs / 1000), atime)
  t.is(Math.floor(s.mtimeMs / 1000), mtime)
})

test('utimesSync: should match node:fs behavior', (t) => {
  const file1 = tmpFile('node-utimes.txt')
  const file2 = tmpFile('hyper-utimes.txt')
  const atime = 1500000000
  const mtime = 1600000000

  nodeUtimesSync(file1, atime, mtime)
  utimesSync(file2, atime, mtime)

  const nodeStat = nodeStatSync(file1)
  const hyperStat = statSync(file2)

  t.is(Math.floor(hyperStat.atimeMs / 1000), Math.floor(nodeStat.atimeMs / 1000))
  t.is(Math.floor(hyperStat.mtimeMs / 1000), Math.floor(nodeStat.mtimeMs / 1000))
})

test('utimesSync: should throw on non-existent file', (t) => {
  t.throws(() => utimesSync('/tmp/no-such-file-' + Date.now(), 1000, 2000), { message: /ENOENT/ })
})

test('utimes: async should update times', async (t) => {
  const file = tmpFile('async-utimes.txt')
  const atime = 1000
  const mtime = 2000

  await utimes(file, atime, mtime)
  const s = statSync(file)

  t.is(Math.floor(s.atimeMs / 1000), atime)
  t.is(Math.floor(s.mtimeMs / 1000), mtime)
})

test('utimes: async should throw on non-existent file', async (t) => {
  await t.throwsAsync(async () => await utimes('/tmp/no-such-file-' + Date.now(), 1000, 2000), {
    message: /ENOENT/,
  })
})

test('utimesSync: should accept Date objects as atime/mtime', (t) => {
  const file = tmpFile('utimes-date.txt')
  const atime = new Date('2020-01-01T00:00:00Z')
  const mtime = new Date('2021-06-15T12:00:00Z')

  utimesSync(file, atime.getTime() / 1000, mtime.getTime() / 1000)
  const s = statSync(file)

  t.is(Math.floor(s.atimeMs / 1000), Math.floor(atime.getTime() / 1000))
  t.is(Math.floor(s.mtimeMs / 1000), Math.floor(mtime.getTime() / 1000))
})

test('dual-run: utimesSync Date values should match node:fs', (t) => {
  const file1 = tmpFile('node-utimes-date.txt')
  const file2 = tmpFile('hyper-utimes-date.txt')
  const atimeSecs = 1577836800 // 2020-01-01
  const mtimeSecs = 1623758400 // 2021-06-15

  nodeUtimesSync(file1, atimeSecs, mtimeSecs)
  utimesSync(file2, atimeSecs, mtimeSecs)

  const nodeStat = nodeStatSync(file1)
  const hyperStat = statSync(file2)

  t.is(hyperStat.mtime.getTime(), nodeStat.mtime.getTime())
  t.is(hyperStat.atime.getTime(), nodeStat.atime.getTime())
})
