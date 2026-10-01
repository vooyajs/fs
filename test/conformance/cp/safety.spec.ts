import test from 'ava'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cp, cpSync, rm, rmSync } from '../../../index.js'

function fixture(t: { teardown(fn: () => void): void }) {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-batch-safety-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('rm: non-recursive empty directories reject and remain intact', async (t) => {
  const root = fixture(t)
  const empty = join(root, 'empty')
  fs.mkdirSync(empty)
  const expected = t.throws(() => fs.rmSync(empty)) as NodeJS.ErrnoException
  t.throws(() => rmSync(empty), { code: expected.code })
  await t.throwsAsync(() => rm(empty, { force: true }), { code: expected.code })
  t.true(fs.statSync(empty).isDirectory())
})

test('rm/cp: missing paths carry structured Node filesystem errors', async (t) => {
  const root = fixture(t)
  const missing = join(root, 'missing')
  for (const run of [() => rmSync(missing), () => cpSync(missing, join(root, 'out'))]) {
    const error = t.throws(run) as NodeJS.ErrnoException
    t.is(error.code, 'ENOENT')
    t.is(error.syscall, 'lstat')
    t.is(error.path, missing)
  }
  for (const run of [() => rm(missing), () => cp(missing, join(root, 'out'))]) {
    const error = (await t.throwsAsync(run)) as NodeJS.ErrnoException
    t.is(error.code, 'ENOENT')
    t.is(error.syscall, 'lstat')
    t.is(error.path, missing)
  }
})

test('cp: self, hardlink alias and descendant copies reject before mutation', async (t) => {
  const root = fixture(t)
  const file = join(root, 'file')
  fs.writeFileSync(file, 'preserve me')
  const alias = join(root, 'alias')
  fs.linkSync(file, alias)
  for (const dest of [file, alias]) {
    t.throws(() => cpSync(file, dest), { code: 'ERR_FS_CP_EINVAL' })
    await t.throwsAsync(() => cp(file, dest), { code: 'ERR_FS_CP_EINVAL' })
    t.is(fs.readFileSync(file, 'utf8'), 'preserve me')
  }
  for (const concurrency of [1, 4]) {
    await t.throwsAsync(() => cp(root, join(root, 'child'), { recursive: true, concurrency }), {
      code: 'ERR_FS_CP_EINVAL',
    })
    t.false(fs.existsSync(join(root, 'child')))
  }
})

test('cp: force takes precedence over errorOnExist like Node', async (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  const dest = join(root, 'dest')
  fs.writeFileSync(src, 'new')
  fs.writeFileSync(dest, 'old')
  cpSync(src, dest, { errorOnExist: true })
  t.is(fs.readFileSync(dest, 'utf8'), 'new')
  fs.writeFileSync(dest, 'old')
  await cp(src, dest, { force: true, errorOnExist: true })
  t.is(fs.readFileSync(dest, 'utf8'), 'new')
})

test('cp: overwriting a destination hardlink does not mutate its other links', (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  const dest = join(root, 'dest')
  const unrelated = join(root, 'unrelated')
  fs.writeFileSync(src, 'new')
  fs.writeFileSync(unrelated, 'old')
  fs.linkSync(unrelated, dest)
  cpSync(src, dest)
  t.is(fs.readFileSync(dest, 'utf8'), 'new')
  t.is(fs.readFileSync(unrelated, 'utf8'), 'old')
})

test('cp: file/directory mismatches reject', (t) => {
  const root = fixture(t)
  const file = join(root, 'file')
  const dir = join(root, 'dir')
  fs.writeFileSync(file, 'data')
  fs.mkdirSync(dir)
  t.throws(() => cpSync(file, dir), { code: 'ERR_FS_CP_NON_DIR_TO_DIR' })
  t.throws(() => cpSync(dir, file, { recursive: true }), { code: 'ERR_FS_CP_DIR_TO_NON_DIR' })
})
