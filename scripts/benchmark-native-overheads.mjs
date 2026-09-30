// Release-only public-entry comparison. Run without other builds or benchmarks.
// node --expose-gc scripts/benchmark-native-overheads.mjs BASELINE_DIR OUTPUT.json
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
const require = createRequire(import.meta.url)
const [baseline, output] = process.argv.slice(2)
if (!baseline || !output || !global.gc)
  throw new Error('Usage: node --expose-gc scripts/benchmark-native-overheads.mjs BASELINE_DIR OUTPUT.json')
const root = path.resolve(import.meta.dirname, '..')
const entries = { node: { ...fs, ...fs.promises }, before: require(path.resolve(baseline)), after: require(root) }
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-overheads-bench-'))
const samples = 10
const warmups = 2
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const binary = fs.readdirSync(root).find((file) => file.startsWith('vooya-fs.') && file.endsWith('.node'))
const report = {
  schema: 1,
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  totalMemory: os.totalmem(),
  baselineCommit: 'db835afca93871cb91cc3696a884eab9648bca95',
  sourceHashes: Object.fromEntries(
    ['src/glob.rs', 'src/write_file.rs', 'api.js'].map((file) => [file, sha(path.join(root, file))]),
  ),
  binaries: { before: sha(path.join(path.resolve(baseline), binary)), after: sha(path.join(root, binary)) },
  rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
  build: 'pnpm build (release)',
  warmups,
  samples,
  method:
    'Rotating implementation order per iteration. Warm filesystem cache, no fsync. Setup, correctness checks and cleanup excluded. Median latency; RSS after operation minus before operation (not peak); GC before each measurement. Node glob async iterator fully collected. Native glob concurrency 4. Writes concurrency 1, reused input; append target reset before timing.',
  cases: [],
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[4] + sorted[5]) / 2
}
async function measure(name, details, setup, run, verify) {
  const result = { name, ...details, implementations: {} }
  for (const name of Object.keys(entries)) result.implementations[name] = { ms: [], rssDeltaBytes: [] }
  const names = Object.keys(entries)
  for (let iteration = -warmups; iteration < samples; iteration++) {
    for (let offset = 0; offset < names.length; offset++) {
      const name = names[(iteration + warmups + offset) % names.length]
      const context = setup(name)
      global.gc()
      const rss = process.memoryUsage().rss
      const start = performance.now()
      const value = await run(entries[name], context, name)
      const ms = performance.now() - start
      const rssDelta = process.memoryUsage().rss - rss
      verify(value, context)
      if (iteration >= 0) {
        result.implementations[name].ms.push(ms)
        result.implementations[name].rssDeltaBytes.push(rssDelta)
      }
    }
  }
  for (const item of Object.values(result.implementations)) item.medianMs = median(item.ms)
  report.cases.push(result)
  console.log(
    name,
    Object.fromEntries(
      Object.entries(result.implementations).map(([name, value]) => [name, value.medianMs.toFixed(3)]),
    ),
  )
}
function normalized(values, typed) {
  return values
    .map((value) =>
      typed
        ? [path.join(value.parentPath, value.name), value.isFile(), value.isDirectory(), value.isSymbolicLink()].join(
            '|',
          )
        : value,
    )
    .sort()
}
try {
  for (const count of [8, 2000, 20000]) {
    const cwd = path.join(fixture, String(count))
    fs.mkdirSync(cwd)
    const extensions = ['ts', 'js', 'md', 'txt']
    for (let i = 0; i < count; i++) {
      const directory = path.join(cwd, `dir${Math.floor(i / 50)}`)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, `${i}.${extensions[i % 4]}`), 'fixture')
    }
    for (const [label, patterns, withFileTypes] of [
      ['single', '**/*', false],
      ['four', extensions.map((extension) => `**/*.${extension}`), false],
      ['four-dirents', extensions.map((extension) => `**/*.${extension}`), true],
    ]) {
      const options = { cwd, withFileTypes }
      const expected = normalized(fs.globSync(patterns, options), withFileTypes)
      await measure(
        `glob-${count}-${label}`,
        { files: count, directories: Math.ceil(count / 50) + 1, patterns, withFileTypes, concurrency: 4 },
        () => undefined,
        async (api, _, name) => {
          if (name !== 'node') return api.glob(patterns, { ...options, concurrency: 4 })
          const result = []
          for await (const value of fs.promises.glob(patterns, options)) result.push(value)
          return result
        },
        (values) => assert.deepEqual(normalized(values, withFileTypes), expected),
      )
    }
  }
  for (const size of [64, 65536, 8388608]) {
    const backing = Buffer.alloc(size + 32, 0x63)
    const data = backing.subarray(16, -16)
    for (const operation of ['writeFile', 'appendFile', 'writeFileSync', 'appendFileSync']) {
      await measure(
        `${operation}-${size}`,
        { bytes: size, input: 'Buffer subarray, byteOffset 16', concurrency: 1, flush: false },
        (name) => {
          const file = path.join(fixture, `${name}.bin`)
          fs.writeFileSync(file, '')
          return file
        },
        (api, file) => api[operation](file, data),
        (_, file) => assert.deepEqual(fs.readFileSync(file), data),
      )
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
