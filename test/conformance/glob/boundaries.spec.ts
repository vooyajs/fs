import test from 'ava'
import * as fs from 'node:fs'
import * as promises from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { glob, globSync } from '../../../api.js'

const require = createRequire(join(process.cwd(), 'package.json'))
const native = require('./index.js')
const normalize = (values: Array<string | fs.Dirent>) =>
  values
    .map((value) =>
      typeof value === 'string'
        ? value.replace(/\\/g, '/')
        : [
            join(value.parentPath, value.name).replace(/\\/g, '/'),
            value.isFile(),
            value.isDirectory(),
            value.isSymbolicLink(),
          ],
    )
    .sort()

function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-glob-boundaries-'))
  fs.mkdirSync(join(root, 'foo/bar'), { recursive: true })
  fs.writeFileSync(join(root, 'foo/a.js'), '')
  fs.writeFileSync(join(root, 'foo/bar/b.js'), '')
  return root
}

test('public glob preserves repeated globstars and wildcard exclusion boundaries', async (t) => {
  const root = fixture()
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const pattern of ['**', '**/**', '**/**/**', 'foo/**/**', ['**/**', 'foo/**/*.js']]) {
    for (const exclude of [undefined, ['foo/*'], ['foo/**'], ['**'], ['**/*.js'], ['./foo'], ['.'], ['../foo'], ['']]) {
      for (const withFileTypes of [false, true]) {
        const options = { cwd: root, exclude, withFileTypes }
        t.deepEqual(normalize(globSync(pattern, options)), normalize(fs.globSync(pattern, options)))
        const expected = []
        for await (const entry of promises.glob(pattern, options)) expected.push(entry)
        t.deepEqual(normalize(await glob(pattern, options)), normalize(expected))
      }
    }
  }
})

test('public glob uses Node directory symlink expansion for strings and Dirents', async (t) => {
  if (process.platform === 'win32') {
    t.pass('symbolic links require separate Windows privileges')
    return
  }
  const root = fixture()
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.symlinkSync('foo', join(root, 'link'))
  fs.symlinkSync('foo', join(root, 'link.js'))
  fs.symlinkSync('missing', join(root, 'broken'))
  fs.symlinkSync('foo/a.js', join(root, 'file-link'))
  for (const pattern of ['**/*', '**/*.js', ['**/*', '**/*.js'], 'link/**/*']) {
    for (const withFileTypes of [false, true]) {
      const options = { cwd: root, withFileTypes }
      t.deepEqual(normalize(globSync(pattern, options)), normalize(fs.globSync(pattern, options)))
      const expected = []
      for await (const entry of promises.glob(pattern, options)) expected.push(entry)
      t.deepEqual(normalize(await glob(pattern, options)), normalize(expected))
    }
  }
  fs.writeFileSync(join(root, '.gitignore'), 'a.js\n')
  const options = { cwd: root, gitIgnore: true }
  for (const entries of [globSync('**/*', options), await glob('**/*', options)]) {
    const names = normalize(entries)
    t.false(names.includes('foo/a.js'))
    t.false(names.includes('link/a.js'))
    t.false(names.includes('link/bar'))
    t.true(names.includes('foo/bar/b.js'))
  }
  for (const entries of [
    globSync('**/*', { ...options, exclude: ['foo/bar/**'] }),
    await glob('**/*', { ...options, exclude: ['foo/bar/**'] }),
  ]) {
    const names = normalize(entries)
    t.false(names.includes('foo/a.js'), 'wildcard excludes must not bypass .gitignore')
    t.false(names.includes('foo/bar/b.js'), 'native wildcard excludes still prune children')
    t.true(names.includes('foo'))
  }
})

test.serial('public glob keeps ordinary and repeated globstar walks native', async (t) => {
  const root = fixture()
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const originalSync = native.globSync
  const originalAsync = native.glob
  let syncCalls = 0
  let asyncCalls = 0
  native.globSync = (...args: unknown[]) => {
    syncCalls++
    return originalSync(...args)
  }
  native.glob = (...args: unknown[]) => {
    asyncCalls++
    return originalAsync(...args)
  }
  try {
    for (const pattern of ['**/*', '**/**', ['**/*.js', '**/*.ts']]) {
      globSync(pattern, { cwd: root })
      await glob(pattern, { cwd: root })
    }
    t.is(syncCalls, 3)
    t.is(asyncCalls, 3)
    globSync('**', { cwd: root, exclude: ['foo/*'] })
    await glob('**', { cwd: root, exclude: ['**'] })
    t.is(syncCalls, 3)
    t.is(asyncCalls, 3)
    t.throws(() => globSync('**', { cwd: root, gitIgnore: true, exclude: ['foo/{a,b}'] }), {
      code: 'ERR_INVALID_ARG_VALUE',
    })
    await t.throwsAsync(glob('**', { cwd: root, gitIgnore: true, exclude: ['foo/{a,b}'] }), {
      code: 'ERR_INVALID_ARG_VALUE',
    })
  } finally {
    native.globSync = originalSync
    native.glob = originalAsync
  }
})
