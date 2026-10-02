import test from 'ava'
import * as fs from 'node:fs'
import * as promises from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import * as vooya from '@vooya/fs'

function fixture(t: { teardown(fn: () => void): void }) {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-public-'))
  t.teardown(() => fs.rmSync(root, { force: true, recursive: true }))
  fs.mkdirSync(join(root, 'src/sub'), { recursive: true })
  fs.writeFileSync(join(root, 'src/a.txt'), 'one\n\nthree\n')
  fs.writeFileSync(join(root, 'src/sub/b.txt'), 'nested')
  return root
}

for (const input of ['string', 'buffer', 'url'] as const) {
  test(`public batches preserve ${input} path behavior by route`, async (t) => {
    const root = fixture(t)
    const asPath = (path: string) =>
      input === 'string' ? path : input === 'buffer' ? Buffer.from(path) : pathToFileURL(path)
    const src = asPath(join(root, 'src'))
    t.deepEqual(
      (await vooya.readdir(src, { recursive: true })).sort(),
      (await promises.readdir(join(root, 'src'), { recursive: true })).sort(),
    )
    t.deepEqual(vooya.readdirSync(src).sort(), fs.readdirSync(join(root, 'src')).sort())
    t.is(await vooya.readFile(asPath(join(root, 'src/a.txt')), 'utf8'), 'one\n\nthree\n')
    t.is(vooya.readFileSync(asPath(join(root, 'src/a.txt')), { encoding: 'utf8', lines: { from: 1, to: 2 } }), 'one\n')
    t.is((await vooya.scan(src)).length, 2)
    if (process.platform === 'win32' && input === 'buffer') {
      // Windows uses Node's Promise copy. Node rejects Buffer paths here,
      // although other fs APIs and Vooya's Unix native copy accept them.
      const expected = (await t.throwsAsync(() =>
        promises.cp(src as never, asPath(join(root, 'node-copy')) as never, { recursive: true }),
      )) as NodeJS.ErrnoException
      await t.throwsAsync(() => vooya.cp(src, asPath(join(root, 'copy')), { recursive: true, concurrency: 4 }), {
        code: expected.code,
      })
      t.false(fs.existsSync(join(root, 'copy')))
      await promises.cp(join(root, 'src'), join(root, 'copy'), { recursive: true })
    } else {
      await vooya.cp(src, asPath(join(root, 'copy')), { recursive: true, concurrency: 4 })
    }
    t.is(fs.readFileSync(join(root, 'copy/sub/b.txt'), 'utf8'), 'nested')
    await vooya.rm(asPath(join(root, 'copy')), { recursive: true, concurrency: 4 })
    t.false(fs.existsSync(join(root, 'copy')))
  })
}

test('public cp executes sync and async filters with Node semantics', async (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  const filter = (source: string) => !source.endsWith('sub')
  vooya.cpSync(src, join(root, 'sync'), { recursive: true, filter })
  await vooya.cp(src, join(root, 'async'), { recursive: true, filter: async (source) => filter(source) })
  for (const name of ['sync', 'async']) t.deepEqual(fs.readdirSync(join(root, name)), ['a.txt'])
})

test('public readFile supports abort and UTF-16 through Node', async (t) => {
  const root = fixture(t)
  const file = join(root, 'utf16')
  fs.writeFileSync(file, 'hello 世界', 'utf16le')
  t.is(await vooya.readFile(file, 'utf16le'), 'hello 世界')
  t.is(vooya.readFileSync(file, 'utf16le'), 'hello 世界')
  await t.throwsAsync(() => vooya.readFile(file, { signal: AbortSignal.abort() }), {
    name: 'AbortError',
    code: 'ABORT_ERR',
  })
})

test('public glob is awaitable and supports next/for-await with URL cwd', async (t) => {
  const root = fixture(t)
  const options = { cwd: pathToFileURL(join(root, 'src')) }
  const batch = vooya.glob(['*.txt', '**/*.txt'], options)
  t.true(batch instanceof Promise)
  const expected = fs.globSync(['*.txt', '**/*.txt'], options).sort()
  const iterated: string[] = []
  for await (const value of batch) iterated.push(value)
  t.deepEqual(iterated.sort(), expected)
  t.deepEqual((await batch).sort(), expected)
  t.true((await batch.next()).done)
  t.is((await vooya.glob('a.txt', options).next()).value, 'a.txt')
})

test('public glob delegates extglobs and JS excludes without changing results', async (t) => {
  const root = fixture(t)
  const cwd = join(root, 'src')
  const opts = { cwd, exclude: (name: string) => name.endsWith('b.txt') }
  t.deepEqual((await vooya.glob('**/*.txt', opts)).sort(), fs.globSync('**/*.txt', opts).sort())
  t.deepEqual(vooya.globSync('**/@(a|b).txt', { cwd }).sort(), fs.globSync('**/@(a|b).txt', { cwd }).sort())
})

test('ignore rules win over include patterns for scan and glob, outside a git repo too', async (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  fs.writeFileSync(join(src, '.gitignore'), 'sub/\na.txt\n!a.txt\n')
  const scan = await vooya.scan(src, { include: ['**/*.txt'], gitIgnore: true })
  t.deepEqual(
    scan.map((entry) => entry.path),
    ['a.txt'],
  )
  t.deepEqual(await vooya.glob('**/*.txt', { cwd: src, gitIgnore: true }), ['a.txt'])
  t.is((await vooya.scan(src, { include: ['**/*.txt'], gitIgnore: false })).length, 2)
})

test('recursive readdir follows directory symlinks and preserves broken symlink entries', async (t) => {
  if (process.platform === 'win32') {
    t.pass('requires symlink privileges')
    return
  }
  const root = fixture(t)
  const src = join(root, 'src')
  fs.symlinkSync('sub', join(src, 'link'))
  fs.symlinkSync('missing', join(src, 'broken'))
  t.deepEqual(
    (await vooya.readdir(src, { recursive: true })).sort(),
    (await promises.readdir(src, { recursive: true })).sort(),
  )
  const summarize = (entries: Array<{ name: string; parentPath: string; isSymbolicLink(): boolean }>) =>
    entries
      .map((entry) => [entry.name, entry.parentPath, entry.isSymbolicLink()])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  t.deepEqual(
    summarize(await vooya.readdir(src, { recursive: true, withFileTypes: true })),
    summarize(await promises.readdir(src, { recursive: true, withFileTypes: true })),
  )
})

test('public missing-path errors preserve Node code, syscall, path and errno', async (t) => {
  const root = fixture(t)
  const missing = join(root, 'missing')
  const pairs = [
    [() => vooya.readdir(missing), () => promises.readdir(missing)],
    [() => vooya.readFile(missing), () => promises.readFile(missing)],
    [() => vooya.rm(missing, { recursive: true }), () => promises.rm(missing, { recursive: true })],
    [() => vooya.cp(missing, join(root, 'out')), () => promises.cp(missing, join(root, 'out'))],
  ]
  for (const [actual, oracle] of pairs) {
    const expected = (await t.throwsAsync(oracle)) as NodeJS.ErrnoException
    const error = (await t.throwsAsync(actual)) as NodeJS.ErrnoException
    for (const field of ['code', 'syscall', 'path', 'errno'] as const) t.is(error[field], expected[field], field)
  }
})

test('non-UTF-8 Buffer paths use Node without lossy conversion', async (t) => {
  if (process.platform === 'win32') {
    t.pass('Unix byte paths')
    return
  }
  const root = fixture(t)
  const file = Buffer.concat([Buffer.from(root + '/'), Buffer.from([0xff])])
  try {
    fs.writeFileSync(file, 'bytes')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EILSEQ') throw error
    const expected = (await t.throwsAsync(() => promises.readFile(file))) as NodeJS.ErrnoException
    await t.throwsAsync(() => vooya.readFile(file), { code: expected.code })
    return
  }
  t.is(await vooya.readFile(file, 'utf8'), 'bytes')
  await vooya.rm(file)
  t.false(fs.existsSync(file))
})

test('bad concurrency rejects before copying or removing anything', async (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  for (const concurrency of [-1, 1.5, NaN, 1025]) {
    await t.throwsAsync(() => vooya.cp(src, join(root, 'copy'), { recursive: true, concurrency }), {
      code: 'ERR_OUT_OF_RANGE',
    })
    await t.throwsAsync(() => vooya.rm(src, { recursive: true, concurrency }), { code: 'ERR_OUT_OF_RANGE' })
    t.true(fs.existsSync(src))
    t.false(fs.existsSync(join(root, 'copy')))
  }
})

test('public exports preserve the existing API and native ESM named imports', async (t) => {
  const { createRequire } = await import('node:module')
  const require = createRequire(join(process.cwd(), 'test/conformance/public/batch.spec.ts'))
  const native = require('../../../index.js') as Record<string, unknown>
  const actual = require('@vooya/fs') as Record<string, unknown>
  for (const name of Object.keys(native)) t.is(typeof actual[name], typeof native[name], name)
  t.is(actual.constants, fs.constants)
  const { execFileSync } = await import('node:child_process')
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { readdir, scan, cp, constants, writeFile } from '@vooya/fs'; console.log([readdir, scan, cp, writeFile].every(fn => typeof fn === 'function') && typeof constants.F_OK === 'number')",
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  t.is(output.trim(), 'true')
})

test('glob excludes remain rooted at cwd across literal prefixes and Unicode patterns', async (t) => {
  const root = fixture(t)
  const cwd = join(root, 'src')
  fs.writeFileSync(join(cwd, 'sub/é.txt'), '')
  for (const pattern of ['**/*.txt', 'sub/?.txt', 'sub/*', 'sub/**', '*/b.txt', '**', '**/*', '{a,sub/b}.txt', '[']) {
    for (const exclude of [['sub'], ['**/sub/**'], ['*.txt']]) {
      const options = { cwd, exclude }
      const expected = fs.globSync(pattern, options).sort()
      t.deepEqual(vooya.globSync(pattern, options).sort(), expected, JSON.stringify([pattern, exclude]))
      t.deepEqual((await vooya.glob(pattern, options)).sort(), expected, JSON.stringify([pattern, exclude]))
    }
  }
})

test('cp Promise overwrite options and symlink outcomes match Node', async (t) => {
  const root = fixture(t)
  for (const force of [true, false])
    for (const errorOnExist of [true, false]) {
      const dirs = ['node', 'vooya'].map((name) => join(root, `${name}-${force}-${errorOnExist}`))
      for (const dir of dirs) {
        fs.mkdirSync(dir)
        fs.writeFileSync(join(dir, 'source'), 'new')
        fs.writeFileSync(join(dir, 'target'), 'old')
      }
      let expectedCode: string | undefined
      try {
        await promises.cp(join(dirs[0], 'source'), join(dirs[0], 'target'), { force, errorOnExist })
      } catch (error) {
        expectedCode = (error as NodeJS.ErrnoException).code
      }
      if (expectedCode)
        await t.throwsAsync(() => vooya.cp(join(dirs[1], 'source'), join(dirs[1], 'target'), { force, errorOnExist }), {
          code: expectedCode,
        })
      else await vooya.cp(join(dirs[1], 'source'), join(dirs[1], 'target'), { force, errorOnExist })
      t.is(fs.readFileSync(join(dirs[1], 'target'), 'utf8'), fs.readFileSync(join(dirs[0], 'target'), 'utf8'))
    }
  if (process.platform === 'win32') return
  for (const destinationKind of ['file', 'symlink', 'missing'])
    for (const force of [true, false]) {
      const dirs = ['node', 'vooya'].map((name) => join(root, `${name}-${destinationKind}-${force}`))
      for (const dir of dirs) {
        fs.mkdirSync(dir)
        fs.writeFileSync(join(dir, 'file'), 'data')
        fs.symlinkSync('file', join(dir, 'source'))
        if (destinationKind === 'file') fs.writeFileSync(join(dir, 'target'), 'old')
        if (destinationKind === 'symlink') fs.symlinkSync('other', join(dir, 'target'))
      }
      let expectedCode: string | undefined
      try {
        await promises.cp(join(dirs[0], 'source'), join(dirs[0], 'target'), { force })
      } catch (error) {
        expectedCode = (error as NodeJS.ErrnoException).code
      }
      if (expectedCode)
        await t.throwsAsync(() => vooya.cp(join(dirs[1], 'source'), join(dirs[1], 'target'), { force }), {
          code: expectedCode,
        })
      else {
        await vooya.cp(join(dirs[1], 'source'), join(dirs[1], 'target'), { force })
        t.is(
          fs.readlinkSync(join(dirs[1], 'target')).replace(dirs[1], 'ROOT'),
          fs.readlinkSync(join(dirs[0], 'target')).replace(dirs[0], 'ROOT'),
        )
      }
    }
})

test('cp preserves directory modes and file timestamps', async (t) => {
  const root = fixture(t)
  const src = join(root, 'src')
  fs.chmodSync(join(src, 'sub'), 0o750)
  const past = new Date('2020-01-01T00:00:00Z')
  fs.utimesSync(join(src, 'a.txt'), past, past)
  await promises.cp(src, join(root, 'oracle'), { recursive: true, preserveTimestamps: true })
  await vooya.cp(src, join(root, 'actual'), { recursive: true, preserveTimestamps: true, concurrency: 4 })
  t.is(fs.statSync(join(root, 'actual/sub')).mode, fs.statSync(join(root, 'oracle/sub')).mode)
  t.is(fs.statSync(join(root, 'actual/a.txt')).mtimeMs, fs.statSync(join(root, 'oracle/a.txt')).mtimeMs)
})

test('cp/rm/glob null options and invalid path types keep Node validation errors', async (t) => {
  const root = fixture(t)
  for (const [actual, oracle] of [
    [
      () => vooya.cpSync(join(root, 'src'), join(root, 'out'), null as never),
      () => fs.cpSync(join(root, 'src'), join(root, 'out'), null as never),
    ],
    [() => vooya.rmSync(join(root, 'src'), null as never), () => fs.rmSync(join(root, 'src'), null as never)],
    [() => vooya.globSync('*', null as never), () => fs.globSync('*', null as never)],
    [() => vooya.readdirSync(42 as never), () => fs.readdirSync(42 as never)],
  ]) {
    const expected = t.throws(oracle) as NodeJS.ErrnoException
    t.throws(actual, { code: expected.code, name: expected.name })
  }
})

test('glob respects platform case rules and literal spelling', async (t) => {
  const root = fixture(t)
  const cwd = join(root, 'src')
  for (const pattern of ['*.TXT', 'A.TXT', '**/*.TXT']) {
    const options = { cwd, exclude: ['**/B.TXT'] }
    t.deepEqual((await vooya.glob(pattern, options)).sort(), fs.globSync(pattern, options).sort())
  }
})

test('unreadable descendants follow Node readdir and glob error policies', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.pass('requires Unix permission enforcement')
    return
  }
  const root = fixture(t)
  const src = join(root, 'src')
  const sub = join(src, 'sub')
  fs.chmodSync(sub, 0)
  try {
    const expected = (await t.throwsAsync(() => promises.readdir(src, { recursive: true }))) as NodeJS.ErrnoException
    const actual = (await t.throwsAsync(() => vooya.readdir(src, { recursive: true }))) as NodeJS.ErrnoException
    for (const field of ['code', 'syscall', 'path'] as const) t.is(actual[field], expected[field])
    t.deepEqual((await vooya.glob('**/*.txt', { cwd: src })).sort(), fs.globSync('**/*.txt', { cwd: src }).sort())
    await t.throwsAsync(() => vooya.scan(src), { code: 'EACCES' })
  } finally {
    fs.chmodSync(sub, 0o700)
  }
})

test('recursive rm errors identify the failing descendant and syscall', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.pass('requires Unix permission enforcement')
    return
  }
  const root = fixture(t)
  for (const sync of [false, true]) {
    for (const concurrency of [1, 4]) {
      const src = join(root, 'src')
      const sub = join(src, 'sub')
      fs.chmodSync(sub, 0)
      try {
        const expected = (
          sync
            ? t.throws(() => fs.rmSync(src, { recursive: true }))
            : await t.throwsAsync(() => promises.rm(src, { recursive: true }))
        ) as NodeJS.ErrnoException
        const actual = (
          sync
            ? t.throws(() => vooya.rmSync(src, { recursive: true, concurrency }))
            : await t.throwsAsync(() => vooya.rm(src, { recursive: true, concurrency }))
        ) as NodeJS.ErrnoException
        for (const field of ['code', 'syscall', 'path', 'errno'] as const) t.is(actual[field], expected[field])
      } finally {
        fs.chmodSync(sub, 0o700)
      }
    }
  }
})

test('copyfile failures retain both source and destination paths', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.pass('requires Unix permission enforcement')
    return
  }
  const root = fixture(t)
  const src = join(root, 'src/a.txt')
  const dest = join(root, 'copy.txt')
  fs.chmodSync(src, 0)
  try {
    const expected = (await t.throwsAsync(() => promises.cp(src, dest))) as NodeJS.ErrnoException & { dest?: string }
    const actual = (await t.throwsAsync(() => vooya.cp(src, dest))) as NodeJS.ErrnoException & { dest?: string }
    for (const field of ['code', 'syscall', 'path', 'dest', 'errno'] as const) t.is(actual[field], expected[field])
  } finally {
    fs.chmodSync(src, 0o600)
  }
})

test('glob delegates brace excludes and non-enumerable Node read options', async (t) => {
  const root = fixture(t)
  const cwd = join(root, 'src')
  for (const exclude of [['**/{a,b}.txt'], ['**/{a,b.txt']]) {
    const options = { cwd, exclude }
    t.deepEqual((await vooya.glob('**/*.txt', options)).sort(), fs.globSync('**/*.txt', options).sort())
  }
  const options = Object.defineProperty({}, 'signal', { value: AbortSignal.abort() })
  await t.throwsAsync(() => vooya.readFile(join(cwd, 'a.txt'), options), { name: 'AbortError' })
})

test('copy replaces a destination symlink to the source without rejecting an inode alias', async (t) => {
  if (process.platform === 'win32') {
    t.pass('requires symlink privileges')
    return
  }
  const root = fixture(t)
  const src = join(root, 'src/a.txt')
  for (const [name, cp] of [
    ['node', promises.cp],
    ['vooya', vooya.cp],
  ] as const) {
    const dest = join(root, name)
    fs.symlinkSync(src, dest)
    await cp(src, dest)
    t.false(fs.lstatSync(dest).isSymbolicLink())
    t.is(fs.readFileSync(dest, 'utf8'), fs.readFileSync(src, 'utf8'))
  }
})

test('copy conflicts expose Node destination and errno fields', async (t) => {
  const root = fixture(t)
  const file = join(root, 'src/a.txt')
  const dir = join(root, 'src/sub')
  for (const [src, dest] of [
    [file, file],
    [file, dir],
    [dir, file],
    [dir, join(dir, 'child')],
  ]) {
    const expected = (await t.throwsAsync(() => promises.cp(src, dest, { recursive: true }))) as NodeJS.ErrnoException
    const actual = (await t.throwsAsync(() => vooya.cp(src, dest, { recursive: true }))) as NodeJS.ErrnoException
    for (const field of ['code', 'syscall', 'path', 'errno'] as const) t.is(actual[field], expected[field])
  }
})

test('copying a symlink onto a regular file reports link target and destination', async (t) => {
  if (process.platform === 'win32') {
    t.pass('requires symlink privileges')
    return
  }
  const root = fixture(t)
  const src = join(root, 'source-link')
  const dest = join(root, 'src/a.txt')
  fs.symlinkSync('src/sub/b.txt', src)
  const expected = (await t.throwsAsync(() => promises.cp(src, dest))) as NodeJS.ErrnoException & { dest?: string }
  const actual = (await t.throwsAsync(() => vooya.cp(src, dest))) as NodeJS.ErrnoException & { dest?: string }
  for (const field of ['code', 'syscall', 'path', 'dest', 'errno'] as const) t.is(actual[field], expected[field])
})

test('public cp preserves Node Buffer-path rejection on callback routes', async (t) => {
  const root = fixture(t)
  const src = Buffer.from(join(root, 'src'))
  const options = { recursive: true, filter: () => true }
  const expected = (await t.throwsAsync(() =>
    promises.cp(src as never, join(root, 'node-copy'), options),
  )) as NodeJS.ErrnoException
  await t.throwsAsync(() => vooya.cp(src, join(root, 'copy'), options), { code: expected.code })
  t.false(fs.existsSync(join(root, 'copy')))
})

test('public read and directory batches accept null encoding without mutating options', async (t) => {
  const root = fixture(t)
  const file = join(root, 'src/a.txt')
  const options = Object.freeze({ encoding: null })
  const bytes: Buffer = vooya.readFileSync(file, options)
  const asyncBytes: Buffer = await vooya.readFile(file, options)
  t.deepEqual(bytes, fs.readFileSync(file, options))
  t.deepEqual(asyncBytes, await promises.readFile(file, options))
  for (const recursive of [false, true]) {
    const directoryOptions = Object.freeze({ encoding: null, recursive })
    const names: string[] = vooya.readdirSync(root, directoryOptions)
    const asyncNames: string[] = await vooya.readdir(root, directoryOptions)
    t.deepEqual(names.sort(), fs.readdirSync(root, directoryOptions).sort())
    t.deepEqual(asyncNames.sort(), (await promises.readdir(root, directoryOptions)).sort())
    const typedOptions = Object.freeze({ ...directoryOptions, withFileTypes: true as const })
    const entries = vooya.readdirSync(root, typedOptions)
    const asyncEntries = await vooya.readdir(root, typedOptions)
    t.deepEqual(
      entries.map((entry) => entry.name).sort(),
      fs
        .readdirSync(root, typedOptions)
        .map((entry) => entry.name)
        .sort(),
    )
    t.deepEqual(
      asyncEntries.map((entry) => entry.name).sort(),
      (await promises.readdir(root, typedOptions)).map((entry) => entry.name).sort(),
    )
  }
  t.is(options.encoding, null)
})
