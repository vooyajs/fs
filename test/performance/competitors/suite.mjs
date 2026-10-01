// Adapted workload definitions: see SOURCES.md and upstream/*LICENSE.txt.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fdir } from 'fdir'
import fastGlob from 'fast-glob'
import * as tinyglobby from 'tinyglobby'
import * as globPackage from 'glob'
const require = createRequire(import.meta.url)
const vooya = require('../../..')
const native = require('../../../index.js')

export const FIXTURE_REVISION = '338fad98047cf80b88e2090c85dab9def3e2e782'
export const FIXTURE_MANIFEST = '7f6e0fc552b87ab0fbc9b2524d3342feaf228112552341a675f6e51e939372b4'
export const cases = [
  { id: 'all', patterns: ['**/*'], source: 'tinyglobby **/*; adapted to files AND directories' },
  { id: 'configs', patterns: ['packages/*/tsconfig.json'], source: 'tinyglobby packages/*/tsconfig.json' },
  { id: 'javascript', patterns: ['**/*.js'], source: 'fdir glob benchmark; unified sync/async pattern, dot:false' },
  {
    id: 'multi',
    patterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.md'],
    source: 'Vooya supplementary multi-pattern workload',
  },
  {
    id: 'readdir',
    source: 'fdir recursive crawl; adapted to relative strings, files AND directories, including hidden',
  },
]
export const engines = ['node', 'fdir', 'fast-glob', 'tinyglobby', 'glob', 'vooya']
export function eligibleEngines(scenario) {
  return scenario.id === 'readdir' ? ['node', 'fdir', 'vooya'] : engines
}
export function canonical(values) {
  return values
    .map((value) => {
      if (typeof value !== 'string') throw new TypeError('Expected relative path strings')
      return value.replaceAll('\\', '/').replace(/\/$/, '')
    })
    .sort()
}
export function validate(values, expected, label) {
  const normalized = canonical(values)
  if (normalized.length !== new Set(normalized).size) throw new Error(`${label}: duplicate results`)
  if (normalized.length !== expected.length || normalized.some((value, i) => value !== expected[i])) {
    const actual = new Set(normalized)
    const wanted = new Set(expected)
    throw new Error(
      `${label}: result mismatch (${normalized.length} vs ${expected.length}); missing ${expected.filter((value) => !actual.has(value)).slice(0, 5)}; extra ${normalized.filter((value) => !wanted.has(value)).slice(0, 5)}`,
    )
  }
}
export function execute(engine, mode, root, scenario) {
  const sync = mode === 'sync'
  if (scenario.id === 'readdir') {
    if (engine === 'fdir') {
      const crawler = new fdir()
        .withRelativePaths()
        .withDirs()
        .withErrors()
        .filter((value) => value !== '.')
        .crawl(root)
      return sync ? crawler.sync() : crawler.withPromise()
    }
    const api = engine === 'node' ? (sync ? fs : fs.promises) : vooya
    return api[sync ? 'readdirSync' : 'readdir'](root, { recursive: true })
  }
  const patterns = scenario.patterns
  const common = { cwd: root, dot: false, onlyFiles: false, followSymbolicLinks: false, unique: true }
  switch (engine) {
    case 'node':
      return sync ? fs.globSync(patterns, { cwd: root }) : collect(fs.promises.glob(patterns, { cwd: root }))
    case 'vooya':
      return vooya[sync ? 'globSync' : 'glob'](patterns, { cwd: root })
    case 'fast-glob':
      return sync ? fastGlob.sync(patterns, common) : fastGlob(patterns, common)
    case 'tinyglobby':
      return tinyglobby[sync ? 'globSync' : 'glob'](patterns, { ...common, expandDirectories: false })
    case 'glob':
      return globPackage[sync ? 'globSync' : 'glob'](patterns, { cwd: root, dot: false, nodir: false, follow: false })
    case 'fdir': {
      const crawler = new fdir()
        .withRelativePaths()
        .withDirs()
        .withErrors()
        .exclude((name) => name.startsWith('.'))
        .filter((value) => value !== '.')
        .globWithOptions(patterns, { dot: false })
        .crawl(root)
      return sync ? crawler.sync() : crawler.withPromise()
    }
    default:
      throw new Error(`Unknown engine: ${engine}`)
  }
}
async function collect(iterator) {
  const result = []
  for await (const entry of iterator) result.push(entry)
  return result
}
// Untimed instrumentation verifies whether the PUBLIC wrapper actually calls Rust.
export async function executionRoute(mode, root, scenario) {
  const key =
    scenario.id === 'readdir' ? (mode === 'sync' ? 'readdirSync' : 'readdir') : mode === 'sync' ? 'globSync' : 'glob'
  const original = native[key]
  let calls = 0
  native[key] = (...args) => {
    calls++
    return original(...args)
  }
  try {
    await execute('vooya', mode, root, scenario)
  } finally {
    native[key] = original
  }
  return calls ? 'native' : 'node-fallback'
}
// Independent exact-path oracle for the deliberately small shared pattern set.
export function expectedPaths(inventory, scenario) {
  if (scenario.id === 'readdir') return inventory.entries.map((entry) => entry.path).sort()
  const visible = inventory.entries
    .map((entry) => entry.path)
    .filter((value) => !value.split('/').some((part) => part.startsWith('.')))
  if (scenario.id === 'all') return visible.sort()
  if (scenario.id === 'configs')
    return visible.filter((value) => /^packages\/[^/]+\/tsconfig\.json$/.test(value)).sort()
  if (scenario.id === 'javascript') return visible.filter((value) => value.endsWith('.js')).sort()
  if (scenario.id === 'multi') return visible.filter((value) => /\.(ts|tsx|js|md)$/.test(value)).sort()
  throw new Error(`Missing oracle for ${scenario.id}`)
}
export function inventory(root) {
  const entries = []
  function walk(directory, parent = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = parent ? `${parent}/${entry.name}` : entry.name
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
        throw new Error(`Fixture must contain only ordinary files/directories: ${relative}`)
      entries.push({
        path: relative,
        kind: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? fs.statSync(path.join(directory, entry.name)).size : 0,
      })
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative)
    }
  }
  walk(root)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    entries,
    files: entries.filter((value) => value.kind === 'file').length,
    directories: entries.filter((value) => value.kind === 'directory').length + 1,
    manifestSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
  }
}
export function createSynthetic(root, count, flat = false) {
  const extensions = ['ts', 'tsx', 'js', 'md']
  for (let i = 0; i < count; i++) {
    const directory = flat ? root : path.join(root, 'packages', `pkg${Math.floor(i / 50)}`, 'src')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, `${i}.${extensions[i % 4]}`), 'fixture\n')
  }
  for (const name of [
    'packages/pkg0/tsconfig.json',
    'packages/pkg1/tsconfig.json',
    '.hidden/secret.js',
    'packages/pkg0/src/.secret.ts',
    'folder.js/nested.js',
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), 'fixture\n')
  }
}
