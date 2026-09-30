// Follow-up to high CPU in the default recursive readdir competitor run.
// node --expose-gc scripts/benchmark-readdir-concurrency.mjs FIXTURE OUTPUT.json
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  inventory,
  expectedPaths,
  execute,
  validate,
  FIXTURE_MANIFEST,
  FIXTURE_REVISION,
} from '../test/performance/competitors/suite.mjs'
const require = createRequire(import.meta.url)
const vooya = require('..')
const [root, output] = process.argv.slice(2)
if (!root || !output || !global.gc) throw new Error('Use --expose-gc and pass FIXTURE OUTPUT.json')
const manifest = inventory(root)
if (manifest.manifestSha256 !== FIXTURE_MANIFEST) throw new Error('Fixture mismatch')
const expected = expectedPaths(manifest, { id: 'readdir' })
const variants = ['node', 'fdir', 'default', '1', '2', '4', '8']
const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  timestamp: new Date().toISOString(),
  fixtureRevision: FIXTURE_REVISION,
  manifestSha256: manifest.manifestSha256,
  resultCount: expected.length,
  resultSha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
  warmups: 2,
  samples: 10,
  method:
    'Async public readdir recursive, all relative file/directory paths including hidden. Rotating order, GC before timing, warm OS cache. Exact set/duplicate validation outside timing. CPU includes native workers; RSS deltas are not peaks. Env thread limits unchanged.',
  env: {
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? null,
    RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS ?? null,
  },
  sourceHashes: {},
  implementations: {},
}
for (const file of [
  'scripts/benchmark-readdir-concurrency.mjs',
  'test/performance/competitors/suite.mjs',
  'pnpm-lock.yaml',
  'src/readdir.rs',
  'api.js',
])
  report.sourceHashes[file] = createHash('sha256')
    .update(fs.readFileSync(path.resolve(import.meta.dirname, '..', file)))
    .digest('hex')
const binary = fs
  .readdirSync(path.resolve(import.meta.dirname, '..'))
  .find((file) => file.startsWith('vooya-fs.') && file.endsWith('.node'))
report.nativeBinarySha256 = createHash('sha256')
  .update(fs.readFileSync(path.resolve(import.meta.dirname, '..', binary)))
  .digest('hex')
for (const name of variants) report.implementations[name] = { ms: [], cpuMs: [], rssDeltaBytes: [] }
for (let iteration = -2; iteration < 10; iteration++) {
  for (let offset = 0; offset < variants.length; offset++) {
    const name = variants[(iteration + 2 + offset) % variants.length]
    global.gc()
    const cpu = process.cpuUsage()
    const rss = process.memoryUsage().rss
    const start = performance.now()
    const result = ['node', 'fdir'].includes(name)
      ? await execute(name, 'async', root, { id: 'readdir' })
      : await vooya.readdir(root, { recursive: true, ...(name === 'default' ? {} : { concurrency: Number(name) }) })
    const ms = performance.now() - start
    const used = process.cpuUsage(cpu)
    const rssDelta = process.memoryUsage().rss - rss
    validate(result, expected, name)
    if (iteration >= 0) {
      const item = report.implementations[name]
      item.ms.push(ms)
      item.cpuMs.push((used.user + used.system) / 1000)
      item.rssDeltaBytes.push(rssDelta)
    }
  }
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[4] + sorted[5]) / 2
}
for (const value of Object.values(report.implementations)) {
  value.medianMs = median(value.ms)
  value.medianCpuMs = median(value.cpuMs)
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.table(
  Object.fromEntries(
    Object.entries(report.implementations).map(([name, value]) => [
      name,
      { ms: value.medianMs, cpuMs: value.medianCpuMs },
    ]),
  ),
)
