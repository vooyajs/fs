import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { nativeBinaryIdentity } from './benchmark-native-identity.mjs'
import {
  scenarios,
  engines,
  unavailable,
  prepare,
  execute,
  validate,
  route,
} from '../test/performance/api-comparisons/suite.mjs'
const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
function option(key, fallback) {
  const i = args.indexOf(key)
  return i < 0 ? fallback : args[i + 1]
}
const output = path.resolve(option('--output', '.perf/all-apis.json'))
const samples = Number(option('--samples', 10)),
  warmups = Number(option('--warmups', 2))
if (!global.gc) throw new Error('Run with --expose-gc')
if (!Number.isInteger(samples) || samples < 2 || !Number.isInteger(warmups) || warmups < 1)
  throw new Error('Require >=2 samples and >=1 warmup')
const selected = option('--apis', '').split(',').filter(Boolean)
const smoke = args.includes('--smoke')
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const sourceFiles = [
  'api.js',
  'index.js',
  'scripts/benchmark-all-apis.mjs',
  'scripts/benchmark-native-identity.mjs',
  'test/performance/api-comparisons/suite.mjs',
  'test/performance/competitors/suite.mjs',
  'pnpm-lock.yaml',
  ...fs
    .readdirSync('src')
    .filter((x) => x.endsWith('.rs'))
    .map((x) => `src/${x}`),
]
function version(name) {
  let dir = path.dirname(require.resolve(name))
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, 'package.json')
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (pkg.name === name) return pkg.version
    }
    dir = path.dirname(dir)
  }
  throw new Error(`Cannot resolve version: ${name}`)
}
const report = {
  schema: 1,
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  memoryBytes: os.totalmem(),
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, hash(file)])),
  nativeBinary: nativeBinaryIdentity(),
  packages: Object.fromEntries(
    ['fs-extra', 'graceful-fs', 'rimraf', 'mkdirp', 'copy-file', 'fdir', 'tinyglobby', 'fast-glob', 'glob'].map(
      (name) => [name, version(name)],
    ),
  ),
  samples,
  warmups,
  smoke,
  env: {
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? null,
    RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS ?? null,
  },
  method: {
    time: 'Complete public call(s), including Promise wrapper, result arrays and bounded batch scheduler. Each async batch has at most 8 operations in flight; sync batches are sequential. Scan compositions also bound lstat to 8.',
    setup:
      'Fresh equivalent fixture for each library/sample; setup, GC, full result/content/metadata validation and cleanup excluded. Writes target distinct fresh paths; append starts from the same content.',
    cache:
      'Warm filesystem/cache, repeated process; no fsync/flush durability, cold-cache, startup or peak-memory claim. File copy can use filesystem cloning/caching.',
    statistics:
      'Two warmups and ten samples by default; cyclic engine order rotates with case and iteration. Median and p90; raw CPU and RSS/heap/external deltas. Deltas are not peaks.',
    semantics:
      'Success-path common workload subset, not complete conformance. Basic operations use fs-extra/graceful-fs Node wrappers. Preserve-copy is explicitly a composite workload. Symlinks/permissions are separate APIs; tree fixtures contain regular files, nested and empty directories.',
  },
  cases: [],
  skipped: [],
  complete: false,
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-all-apis-'))
function save() {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
}
const median = (xs) => {
  const a = [...xs].sort((a, b) => a - b),
    m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
const p90 = (xs) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.9) - 1]
let caseIndex = 0
try {
  for (const s of scenarios(smoke).filter((s) => !selected.length || selected.includes(s.api))) {
    if (unavailable(s)) {
      report.skipped.push({ ...s, reason: unavailable(s) })
      continue
    }
    for (const mode of ['sync', 'async']) {
      const routeFixture = prepare(path.join(root, 'fixture'), s)
      const executionRoute = await route(mode, s, routeFixture)
      const row = {
        ...s,
        mode,
        route: executionRoute,
        operations: s.count,
        logicalBytes: s.files ? s.files * s.bytes : s.count * s.bytes,
        implementations: {},
      }
      const competitors = engines(s)
      for (const engine of competitors) row.implementations[engine] = { samples: [] }
      for (let iteration = -warmups; iteration < samples; iteration++) {
        const offset = (iteration + warmups + caseIndex) % competitors.length
        const order = [...competitors.slice(offset), ...competitors.slice(0, offset)]
        for (const engine of order) {
          const c = prepare(path.join(root, 'fixture'), s)
          global.gc()
          const memory = process.memoryUsage(),
            cpu = process.cpuUsage(),
            start = performance.now()
          const result = mode === 'sync' ? execute(engine, mode, s, c) : await execute(engine, mode, s, c)
          const durationMs = performance.now() - start,
            usage = process.cpuUsage(cpu),
            after = process.memoryUsage()
          try {
            validate(s, c, result)
          } catch (error) {
            throw new Error(`${s.api}/${s.scale}/${s.variant}/${mode}/${engine}: ${error.message}`, { cause: error })
          }
          if (iteration >= 0)
            row.implementations[engine].samples.push({
              durationMs,
              cpuMs: (usage.user + usage.system) / 1000,
              rssDelta: after.rss - memory.rss,
              heapDelta: after.heapUsed - memory.heapUsed,
              externalDelta: after.external - memory.external,
            })
        }
      }
      for (const value of Object.values(row.implementations)) {
        value.medianMs = median(value.samples.map((x) => x.durationMs))
        value.p90Ms = p90(value.samples.map((x) => x.durationMs))
        value.cpuMedianMs = median(value.samples.map((x) => x.cpuMs))
        value.rssMedianDelta = median(value.samples.map((x) => x.rssDelta))
        value.operationsPerSecond = (s.count * 1000) / value.medianMs
        if (['readFile', 'writeFile', 'appendFile', 'copyFile', 'cp'].includes(s.api))
          value.logicalMiBPerSecond = ((row.logicalBytes / 1048576) * 1000) / value.medianMs
      }
      report.cases.push(row)
      save()
      caseIndex++
      console.log(
        `${report.node} ${s.api}/${s.scale}/${s.variant}/${mode}: node=${row.implementations.node.medianMs.toFixed(3)}ms vooya=${row.implementations.vooya.medianMs.toFixed(3)}ms (${executionRoute})`,
      )
    }
  }
  report.complete = true
  save()
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
console.log(`Saved ${report.cases.length} cases to ${output}`)
