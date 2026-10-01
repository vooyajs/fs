// pnpm perf:competitors --fixture DIR --output FILE [--samples 10] [--warmups 2]
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { nativeBinaryIdentity } from './benchmark-native-identity.mjs'
import {
  cases,
  execute,
  eligibleEngines,
  expectedPaths,
  validate,
  inventory,
  executionRoute,
  createSynthetic,
  FIXTURE_REVISION,
  FIXTURE_MANIFEST,
} from '../test/performance/competitors/suite.mjs'
const require = createRequire(import.meta.url)
const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    output: { type: 'string' },
    samples: { type: 'string', default: '10' },
    warmups: { type: 'string', default: '2' },
  },
})
if (!values.fixture || !values.output || !global.gc)
  throw new Error('Use --expose-gc; --fixture and --output are required')
const samples = Number(values.samples)
const warmups = Number(values.warmups)
if (!Number.isInteger(samples) || samples < 2 || !Number.isInteger(warmups) || warmups < 1)
  throw new Error('samples >= 2 and warmups >= 1 required')
const project = path.resolve(import.meta.dirname, '..')
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const version = (name) => {
  let directory = path.dirname(require.resolve(name))
  while (directory !== path.dirname(directory)) {
    const file = path.join(directory, 'package.json')
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file))
      if (pkg.name === name) return pkg.version
    }
    directory = path.dirname(directory)
  }
  throw new Error(`Cannot find version: ${name}`)
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
  totalMemoryBytes: os.totalmem(),
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(
    [
      'api.js',
      'src/glob.rs',
      'src/readdir.rs',
      'scripts/benchmark-competitors.mjs',
      'scripts/benchmark-native-identity.mjs',
      'test/performance/competitors/suite.mjs',
      'pnpm-lock.yaml',
      'test/performance/competitors/SOURCES.md',
    ].map((file) => [file, sha(path.join(project, file))]),
  ),
  nativeBinary: { ...nativeBinaryIdentity(), build: 'pnpm build -- release' },
  packages: Object.fromEntries(
    ['fdir', 'picomatch', 'fast-glob', 'tinyglobby', 'glob'].map((name) => [name, version(name)]),
  ),
  upstreamFixture: {
    repository: 'typescript-eslint/typescript-eslint',
    revision: FIXTURE_REVISION,
    archiveSha256: fs.existsSync(path.join(path.dirname(path.resolve(values.fixture)), 'typescript-eslint.tar.gz'))
      ? sha(path.join(path.dirname(path.resolve(values.fixture)), 'typescript-eslint.tar.gz'))
      : null,
  },
  warmups,
  samples,
  method: {
    cache:
      'Warm OS cache after inventory and warmups; repeat calls, no reusable caller-created glob objects. Not cold-start or cold-disk.',
    order: 'Rotate engines every sample and rotate initial engine every case.',
    validation:
      'Independent manifest oracle; every warmup and sample checked for exact set and duplicates. Sorting/normalizing for validation excluded.',
    timing:
      'Includes public entry, matcher/crawler construction and full materialization. Sync calls timed synchronously; Promise results fully awaited.',
    memory:
      'RSS immediately after minus before operation; GC before each operation, not timed. Not peak memory. All libraries loaded in one process.',
    cpu: 'process.cpuUsage user+system delta, includes native workers.',
    contracts:
      'Unsorted relative paths, files AND directories; glob hides dot entries and ignores no gitignore rules; readdir includes dot entries. Fixtures reject symlinks/special files. Output slash/trailing directory slash normalized only for validation.',
    concurrency:
      'Library defaults; Vooya glob 4, recursive readdir default Rayon pool. No threadpool environment override unless recorded.',
    env: {
      UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? null,
      RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS ?? null,
    },
  },
  fixtures: [],
  cases: [],
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-competitors-'))
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
}
try {
  createSynthetic(path.join(temporary, 'tiny'), 8)
  createSynthetic(path.join(temporary, 'wide'), 20000, true)
  const fixtures = [
    ['tiny', path.join(temporary, 'tiny')],
    ['typescript-eslint', path.resolve(values.fixture)],
    ['wide-20000', path.join(temporary, 'wide')],
  ]
  let caseIndex = 0
  for (const [fixtureName, root] of fixtures) {
    const manifest = inventory(root)
    if (fixtureName === 'typescript-eslint' && manifest.manifestSha256 !== FIXTURE_MANIFEST)
      throw new Error('Fixture does not match the pinned typescript-eslint source manifest')
    report.fixtures.push({
      name: fixtureName,
      files: manifest.files,
      directories: manifest.directories,
      manifestSha256: manifest.manifestSha256,
    })
    for (const scenario of cases) {
      const expected = expectedPaths(manifest, scenario)
      for (const mode of ['async', 'sync']) {
        const route = await executionRoute(mode, root, scenario)
        const result = {
          fixture: fixtureName,
          scenario: scenario.id,
          source: scenario.source,
          patterns: scenario.patterns ?? null,
          mode,
          resultCount: expected.length,
          resultSha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
          vooyaRoute: route,
          implementations: {},
        }
        const names = eligibleEngines(scenario)
        for (const name of names) result.implementations[name] = { ms: [], cpuMs: [], rssDeltaBytes: [] }
        for (let iteration = -warmups; iteration < samples; iteration++) {
          for (let offset = 0; offset < names.length; offset++) {
            const engine = names[(caseIndex + iteration + warmups + offset) % names.length]
            global.gc()
            const rss = process.memoryUsage().rss
            const cpu = process.cpuUsage()
            const start = performance.now()
            let output
            if (mode === 'sync') output = execute(engine, mode, root, scenario)
            else output = await execute(engine, mode, root, scenario)
            const ms = performance.now() - start
            const used = process.cpuUsage(cpu)
            const rssDelta = process.memoryUsage().rss - rss
            validate(output, expected, `${fixtureName}/${scenario.id}/${mode}/${engine}`)
            if (iteration >= 0) {
              const entry = result.implementations[engine]
              entry.ms.push(ms)
              entry.cpuMs.push((used.user + used.system) / 1000)
              entry.rssDeltaBytes.push(rssDelta)
            }
          }
        }
        for (const entry of Object.values(result.implementations)) {
          entry.medianMs = median(entry.ms)
          entry.p90Ms = percentile(entry.ms, 0.9)
          entry.medianCpuMs = median(entry.cpuMs)
          entry.medianRssDeltaBytes = median(entry.rssDeltaBytes)
        }
        report.cases.push(result)
        console.log(
          `${fixtureName}/${scenario.id}/${mode} [${route}] ${expected.length} results`,
          Object.fromEntries(
            Object.entries(result.implementations).map(([name, item]) => [name, +item.medianMs.toFixed(3)]),
          ),
        )
        caseIndex++
      }
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(values.output)), { recursive: true })
  fs.writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n')
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
