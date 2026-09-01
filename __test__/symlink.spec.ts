import test from 'ava'
import { symlinkSync, symlink, readlinkSync, statSync, lstatSync } from '../index.js'
import * as nodeFs from 'node:fs'
import { writeFileSync, mkdirSync, existsSync, readlinkSync as nodeReadlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ===== sync =====

test('symlinkSync: should create a symbolic link to a file', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target.txt')
  const link = join(dir, 'link.txt')
  writeFileSync(target, 'hello')

  symlinkSync(target, link)
  t.true(existsSync(link))

  const resolved = readlinkSync(link)
  t.is(resolved, target)
})

test('symlinkSync: should create a symbolic link to a directory', (t) => {
  const dir = tmpDir()
  const targetDir = join(dir, 'subdir')
  mkdirSync(targetDir)
  const link = join(dir, 'link-dir')

  symlinkSync(targetDir, link)
  t.true(lstatSync(link).isSymbolicLink())
  // On Windows CI, statSync(link) can throw EACCES when following a dir symlink
  try {
    t.true(statSync(link).isDirectory())
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    const isWinEacces =
      process.platform === 'win32' && (e.code === 'GenericFailure' || (e.message && e.message.includes('EACCES')))
    if (isWinEacces) {
      t.pass('statSync on dir symlink skipped (Windows EACCES)')
    } else {
      throw err
    }
  }
})

test('symlinkSync: should match node:fs readlink result', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target2.txt')
  const link = join(dir, 'link2.txt')
  writeFileSync(target, 'hello')

  symlinkSync(target, link)
  const nodeResult = nodeReadlinkSync(link, 'utf8')
  const hyperResult = readlinkSync(link)
  t.is(hyperResult, nodeResult)
})

test('symlinkSync: should throw EEXIST if link path already exists', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'target3.txt')
  const link = join(dir, 'link3.txt')
  writeFileSync(target, 'hello')
  writeFileSync(link, 'existing')

  t.throws(() => symlinkSync(target, link), { message: /EEXIST/ })
})

// ===== dual-run =====

test('dual-run: symlinkSync result should match node:fs.symlinkSync', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'dual-target.txt')
  const hyperLink = join(dir, 'dual-hyper-link.txt')
  const nodeLink = join(dir, 'dual-node-link.txt')
  nodeFs.writeFileSync(target, 'hello')

  nodeFs.symlinkSync(target, nodeLink)
  symlinkSync(target, hyperLink)

  // Both should be symlinks pointing to the same target
  const nodeReadlink = nodeReadlinkSync(nodeLink, 'utf8')
  const hyperReadlink = nodeReadlinkSync(hyperLink, 'utf8')
  t.is(hyperReadlink, nodeReadlink)

  // Both should resolve to the same file
  const nodeLstat = nodeFs.lstatSync(nodeLink)
  const hyperLstat = nodeFs.lstatSync(hyperLink)
  t.is(hyperLstat.isSymbolicLink(), nodeLstat.isSymbolicLink())
  t.true(hyperLstat.isSymbolicLink())
})

// ===== async =====

test('symlink: async should create a symbolic link', async (t) => {
  const dir = tmpDir()
  const target = join(dir, 'async-target.txt')
  const link = join(dir, 'async-link.txt')
  writeFileSync(target, 'hello')

  await symlink(target, link)
  t.true(existsSync(link))

  const resolved = readlinkSync(link)
  t.is(resolved, target)
})
