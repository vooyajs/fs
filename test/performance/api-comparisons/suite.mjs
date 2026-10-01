import * as fs from 'node:fs'
import * as path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import extra from 'fs-extra'
import graceful from 'graceful-fs'
import * as rimraf from 'rimraf'
import * as mkdirp from 'mkdirp'
import * as copyFilePackage from 'copy-file'
import { execute as crawl, validate as validatePaths } from '../competitors/suite.mjs'
const require = createRequire(import.meta.url)
export const vooya = require('../../..')
const native = require('../../../index.js')
export const apis = Object.keys(vooya)
  .filter((key) => typeof vooya[key] === 'function' && !key.endsWith('Sync') && !['Dirent', 'Stats'].includes(key))
  .sort()
const treeApis = new Set(['cp', 'rm', 'scan', 'glob', 'readdir'])
const fileApis = new Set(['readFile', 'writeFile', 'appendFile', 'copyFile'])
const gPromises = Object.fromEntries(
  apis
    .filter((key) => key !== 'exists' && typeof graceful[key] === 'function')
    .map((key) => [key, promisify(graceful[key])]),
)
const slash = (value) => value.replaceAll('\\', '/')
export function scenarios(smoke = false) {
  return apis.flatMap((api) => {
    const scales = treeApis.has(api)
      ? [
          { scale: 'tiny-tree', count: 1, files: 4 },
          { scale: 'tree-1000', count: 1, files: smoke ? 12 : 1000 },
        ]
      : [
          { scale: 'single', count: 1 },
          { scale: 'batch-256', count: smoke ? 3 : 256 },
        ]
    const variants = ['readFile', 'writeFile', 'appendFile'].includes(api)
      ? ['buffer', 'utf8']
      : ['stat', 'lstat'].includes(api)
        ? ['default', 'symlink']
        : ['default']
    const result = variants.flatMap((variant) => scales.map((scale) => ({ api, variant, bytes: 4096, ...scale })))
    if (fileApis.has(api))
      result.push({ api, variant: 'buffer', scale: '8MiB', count: 1, bytes: smoke ? 8192 : 8 * 1024 * 1024 })
    if (api === 'copyFile')
      result.push({ api, variant: 'preserve', scale: 'preserve-8MiB', count: 1, bytes: smoke ? 8192 : 8 * 1024 * 1024 })
    if (api === 'exists')
      result.push({ api, variant: 'missing', scale: 'missing-256', count: smoke ? 3 : 256, bytes: 4096 })
    return result
  })
}
export function engines(s) {
  if (s.api === 'glob') return ['node', 'fs-extra', 'graceful-fs', 'fdir', 'fast-glob', 'tinyglobby', 'glob', 'vooya']
  if (s.api === 'scan') return ['node', 'fs-extra', 'graceful-fs', 'fdir', 'tinyglobby', 'vooya', 'vooya-c4']
  const list = ['node', 'fs-extra', 'graceful-fs', 'vooya']
  if (s.api === 'readdir') list.push('fdir', 'vooya-c4')
  if (s.api === 'cp' || s.api === 'rm') list.push('vooya-c4')
  if (s.api === 'rm') list.push('rimraf', 'rimraf-manual')
  if (s.api === 'mkdir') list.push('mkdirp', 'mkdirp-manual')
  if (s.variant === 'preserve') list.push('copy-file')
  return list
}
export function unavailable(s) {
  if (
    process.platform === 'win32' &&
    (['chown', 'chmod', 'symlink', 'readlink'].includes(s.api) || s.variant === 'symlink')
  )
    return 'POSIX permissions/ownership or symlink privilege workload; explicitly not measured on Windows'
  return null
}
export function manifest(root) {
  const result = []
  function visit(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      const stat = fs.lstatSync(path.join(root, rel))
      result.push({
        path: rel,
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        mode: stat.mode,
        mtimeMs: stat.mtimeMs,
        depth: rel.split('/').length,
      })
      if (entry.isDirectory()) visit(path.join(root, rel), rel)
    }
  }
  visit(root)
  return result.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
export function prepare(root, s) {
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  // Windows temp roots may use 8.3 aliases. Give every realpath adapter the
  // same long-form input; retain strict output comparison. Setup is untimed.
  if (process.platform === 'win32' && s.api === 'realpath') root = fs.realpathSync.native(root)
  const unit = '文件内容🙂'
  const repeats = Math.floor(s.bytes / Buffer.byteLength(unit))
  const data =
    s.variant === 'utf8'
      ? Buffer.from(unit.repeat(repeats) + 'a'.repeat(s.bytes % Buffer.byteLength(unit)))
      : Buffer.alloc(s.bytes, 97)
  const text = data.toString('utf8')
  const items = []
  if (treeApis.has(s.api)) {
    const source = path.join(root, 'source')
    fs.mkdirSync(source)
    for (let i = 0; i < s.files; i++) {
      const dir = path.join(source, `d${Math.floor(i / 25)}`, 'nested')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `f${i}.js`), data)
    }
    fs.mkdirSync(path.join(source, 'empty'))
    const expected = manifest(source)
    return {
      root,
      source,
      dest: path.join(root, 'dest'),
      data,
      text,
      expected,
      items: [{ source, dest: path.join(root, 'dest') }],
    }
  }
  for (let i = 0; i < s.count; i++) {
    const source = path.join(root, `src-${i}`)
    const dest = path.join(root, `dest-${i}`)
    if (s.api === 'rmdir') fs.mkdirSync(source)
    else if (!['mkdir', 'mkdtemp'].includes(s.api) && s.variant !== 'missing') fs.writeFileSync(source, data)
    if (s.api === 'readlink' || s.variant === 'symlink') fs.symlinkSync(`src-${i}`, dest)
    const stat =
      s.variant === 'symlink' && s.api === 'lstat'
        ? fs.lstatSync(dest)
        : fs.existsSync(source)
          ? fs.statSync(source)
          : null
    items.push({ source, dest, stat, mkdir: path.join(root, `new-${i}`, 'a', 'b') })
  }
  return { root, data, text, items }
}
function apiFor(engine, mode) {
  if (engine.startsWith('vooya')) return vooya
  if (engine === 'fs-extra') return extra
  if (engine === 'graceful-fs') return mode === 'sync' ? graceful : gPromises
  return mode === 'sync' ? fs : fs.promises
}
function method(api, name, mode) {
  return api[name + (mode === 'sync' ? 'Sync' : '')]
}
export async function mapLimit(values, concurrency, fn) {
  const result = Array.from({ length: values.length })
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= values.length) return
        result[i] = await fn(values[i], i)
      }
    }),
  )
  return result
}
function scan(engine, mode, c) {
  if (engine.startsWith('vooya'))
    return method(
      vooya,
      'scan',
      mode,
    )(c.source, { withDirectories: true, ...(engine === 'vooya-c4' ? { concurrency: 4 } : {}) })
  const api = apiFor(engine, mode)
  const list = ['fdir', 'tinyglobby'].includes(engine)
    ? crawl(engine, mode, c.source, { id: engine === 'fdir' ? 'readdir' : 'all', patterns: ['**/*'] })
    : method(api, 'readdir', mode)(c.source, { recursive: true })
  const entry = (relative, stats) => {
    const p = slash(relative).replace(/\/$/, '')
    return {
      path: p,
      name: path.posix.basename(p),
      kind: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      mode: stats.mode,
      mtimeMs: stats.mtimeMs,
      depth: p.split('/').length,
    }
  }
  const order = (values) => values.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (mode === 'sync') return order(list.map((p) => entry(p, method(api, 'lstat', mode)(path.join(c.source, p)))))
  return Promise.resolve(list)
    .then((paths) =>
      mapLimit(paths, 8, async (p) => entry(p, await method(api, 'lstat', mode)(path.join(c.source, p)))),
    )
    .then(order)
}
function invoke(engine, mode, s, c, item) {
  const api = apiFor(engine, mode)
  const call = (name, ...args) => method(api, name, mode)(...args)
  const { source, dest } = item
  const concurrent = engine === 'vooya-c4' ? { concurrency: 4 } : {}
  if (s.api === 'glob') {
    if (engine === 'fs-extra' || engine === 'graceful-fs') return call('glob', '**/*', { cwd: source })
    return crawl(engine, mode, source, { id: 'all', patterns: ['**/*'] })
  }
  if (s.api === 'scan') return scan(engine, mode, c)
  if (s.api === 'readdir' && engine === 'fdir') return crawl(engine, mode, source, { id: 'readdir' })
  if (s.api === 'cp' && engine === 'fs-extra')
    return method(extra, 'copy', mode)(source, dest, { overwrite: true, preserveTimestamps: false })
  if (s.api === 'rm' && engine === 'fs-extra') return method(extra, 'remove', mode)(source)
  if (s.api === 'rm' && engine.startsWith('rimraf'))
    return method(rimraf, engine === 'rimraf' ? 'rimraf' : 'manual', mode)(source, { glob: false })
  if (s.api === 'mkdir' && engine.startsWith('mkdirp'))
    return method(mkdirp, engine === 'mkdirp' ? 'mkdirp' : 'mkdirpManual', mode)(item.mkdir)
  if (s.api === 'exists') {
    if (engine.startsWith('vooya')) return call('exists', source)
    if (engine === 'fs-extra') return method(extra, 'pathExists', mode)(source)
    if (mode === 'sync') return api.existsSync(source)
    return call('access', source).then(
      () => true,
      (e) => {
        if (e.code === 'ENOENT') return false
        throw e
      },
    )
  }
  if (s.api === 'copyFile' && s.variant === 'preserve') {
    if (engine === 'copy-file') return method(copyFilePackage, 'copyFile', mode)(source, dest)
    // Separate composed workload: match copy-file's timestamp/mode preservation.
    if (mode === 'sync') {
      const stats = call('stat', source)
      call('copyFile', source, dest, fs.constants.COPYFILE_FICLONE)
      call('utimes', dest, stats.atimeMs / 1000, stats.mtimeMs / 1000)
      call('chmod', dest, stats.mode)
      return
    }
    return (async () => {
      const stats = await call('stat', source)
      await call('copyFile', source, dest, fs.constants.COPYFILE_FICLONE)
      await Promise.all([
        call('utimes', dest, stats.atimeMs / 1000, stats.mtimeMs / 1000),
        call('chmod', dest, stats.mode),
      ])
    })()
  }
  switch (s.api) {
    case 'stat':
    case 'lstat':
      return call(s.api, s.variant === 'symlink' ? dest : source)
    case 'cp':
      return call('cp', source, dest, { recursive: true, ...concurrent })
    case 'rm':
      return call('rm', source, { recursive: true, force: true, ...concurrent })
    case 'readdir':
      return call('readdir', source, { recursive: true, ...concurrent })
    case 'readFile':
      return call('readFile', source, s.variant === 'utf8' ? 'utf8' : undefined)
    case 'writeFile':
      return call('writeFile', dest, s.variant === 'utf8' ? c.text : c.data)
    case 'appendFile':
      return call('appendFile', source, s.variant === 'utf8' ? c.text : c.data)
    case 'copyFile':
      return call('copyFile', source, dest)
    case 'mkdir':
      return call('mkdir', item.mkdir, { recursive: true })
    case 'mkdtemp':
      return call('mkdtemp', dest)
    case 'readlink':
      return call('readlink', dest)
    case 'rename':
    case 'link':
      return call(s.api, source, dest)
    case 'symlink':
      return call('symlink', path.basename(source), dest)
    case 'truncate':
      return call('truncate', source, 1024)
    case 'chmod':
      return call('chmod', source, 0o640)
    case 'chown':
      return call('chown', source, process.getuid(), process.getgid())
    case 'utimes':
      return call('utimes', source, 1600000000, 1600000001)
    default:
      return call(s.api, source)
  }
}
export function execute(engine, mode, s, c) {
  if (mode === 'sync') return c.items.map((item) => invoke(engine, mode, s, c, item))
  return mapLimit(c.items, 8, (item) => invoke(engine, mode, s, c, item))
}
export async function route(mode, s, c) {
  const key = s.api + (mode === 'sync' ? 'Sync' : '')
  if (vooya[key] === native[key]) return 'native-direct'
  const original = native[key]
  let calls = 0
  native[key] = (...args) => {
    calls++
    return original(...args)
  }
  try {
    await execute('vooya', mode, s, c)
  } finally {
    native[key] = original
  }
  return calls ? 'native-wrapper' : 'node-fallback'
}
export function validate(s, c, outputs) {
  assert.equal(outputs.length, c.items.length)
  if (treeApis.has(s.api)) {
    if (s.api === 'rm') {
      assert.equal(fs.existsSync(c.source), false)
      return
    }
    if (s.api === 'cp') {
      const actual = manifest(c.dest)
      assert.deepEqual(
        actual.map(({ path, kind }) => ({ path, kind })),
        c.expected.map(({ path, kind }) => ({ path, kind })),
      )
      for (const e of c.expected)
        if (e.kind === 'file') {
          assert.deepEqual(fs.readFileSync(path.join(c.dest, e.path)), c.data)
          if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(c.dest, e.path)).mode, e.mode)
        }
      return
    }
    if (s.api !== 'scan') {
      validatePaths(outputs[0], c.expected.map((e) => e.path).sort(), s.api)
      return
    }
    assert.equal(outputs[0].length, c.expected.length)
    for (let i = 0; i < c.expected.length; i++) {
      const actual = outputs[0][i],
        expected = c.expected[i]
      for (const key of ['path', 'name', 'kind', 'size', 'depth']) assert.equal(actual[key], expected[key], key)
      if (process.platform !== 'win32') assert.equal(actual.mode, expected.mode)
      assert.ok(Math.abs(actual.mtimeMs - expected.mtimeMs) < 1, 'metadata timestamp')
    }
    return
  }
  for (let i = 0; i < c.items.length; i++) {
    const { source, dest, stat, mkdir } = c.items[i],
      value = outputs[i]
    switch (s.api) {
      case 'readFile':
        assert.deepEqual(value, s.variant === 'utf8' ? c.text : c.data)
        break
      case 'writeFile':
      case 'copyFile': {
        if (s.variant === 'preserve') {
          const actual = fs.statSync(dest)
          assert.ok(Math.abs(actual.mtimeMs - stat.mtimeMs) < 1)
          assert.ok(Math.abs(actual.atimeMs - stat.atimeMs) < 1)
          if (process.platform !== 'win32') assert.equal(actual.mode, stat.mode)
        }
        assert.deepEqual(fs.readFileSync(dest), c.data)
        break
      }
      case 'appendFile':
        assert.deepEqual(fs.readFileSync(source), Buffer.concat([c.data, c.data]))
        break
      case 'stat':
      case 'lstat':
        assert.equal(value.size, stat.size)
        assert.equal(value.isFile(), stat.isFile())
        assert.equal(value.isSymbolicLink(), stat.isSymbolicLink())
        assert.ok(Math.abs(value.mtimeMs - stat.mtimeMs) < 1)
        if (process.platform !== 'win32')
          for (const k of ['mode', 'ino', 'uid', 'gid', 'nlink']) assert.equal(value[k], stat[k])
        break
      case 'exists':
        assert.equal(value, s.variant !== 'missing')
        break
      case 'access':
        assert.equal(value, undefined)
        break
      case 'mkdir':
        assert.equal(fs.statSync(mkdir).isDirectory(), true)
        break
      case 'mkdtemp':
        assert.ok(value.startsWith(dest))
        assert.equal(fs.statSync(value).isDirectory(), true)
        break
      case 'rename':
        assert.equal(fs.existsSync(source), false)
        assert.deepEqual(fs.readFileSync(dest), c.data)
        break
      case 'unlink':
      case 'rmdir':
        assert.equal(fs.existsSync(source), false)
        break
      case 'link':
        assert.equal(fs.statSync(dest).ino, fs.statSync(source).ino)
        assert.equal(fs.statSync(source).nlink, 2)
        break
      case 'symlink':
        assert.equal(fs.readlinkSync(dest), path.basename(source))
        break
      case 'readlink':
        assert.equal(value, path.basename(source))
        break
      case 'realpath':
        assert.equal(value, fs.realpathSync(source))
        break
      case 'truncate':
        assert.deepEqual(fs.readFileSync(source), c.data.subarray(0, 1024))
        break
      case 'chmod':
        assert.equal(fs.statSync(source).mode & 0o777, 0o640)
        break
      case 'chown':
        assert.equal(fs.statSync(source).uid, process.getuid())
        assert.equal(fs.statSync(source).gid, process.getgid())
        break
      case 'utimes':
        assert.ok(Math.abs(fs.statSync(source).mtimeMs - 1600000001000) < 1)
        assert.ok(Math.abs(fs.statSync(source).atimeMs - 1600000000000) < 1)
        break
      default:
        throw new Error(`No validation: ${s.api}`)
    }
  }
}
