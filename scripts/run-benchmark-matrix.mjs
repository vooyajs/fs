// Reproduce all checked-in competitor workload families, sequentially.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inventory, FIXTURE_MANIFEST, FIXTURE_REVISION } from '../test/performance/competitors/suite.mjs'
const project = path.resolve(import.meta.dirname, '..')
export function plan(options) {
  if (!options.node22 || !options.node24)
    throw new Error('--node22 and --node24 must identify installed Node executables')
  const output = path.resolve(options.output ?? '.perf/reproduction')
  const fixture = path.resolve(options.fixture ?? '.perf/competitors/typescript-eslint')
  if (output === path.join(project, 'docs/public/evidence'))
    throw new Error('Write reruns to a separate directory; publish reviewed evidence explicitly')
  const suites = (options.suites ?? 'all-apis,competitors,readdir').split(',')
  if (new Set(suites).size !== suites.length) throw new Error('Duplicate benchmark suite')
  if (suites.some((s) => !['all-apis', 'competitors', 'readdir'].includes(s)))
    throw new Error('Unknown benchmark suite')
  return ['22', '24'].flatMap((major) =>
    suites.map((suite) => {
      const files = {
        'all-apis': `all-apis-node${major}.json`,
        competitors: `competitors-node${major}.json`,
        readdir: `competitors-readdir-concurrency-node${major}.json`,
      }
      const scripts = {
        'all-apis': 'benchmark-all-apis.mjs',
        competitors: 'benchmark-competitors.mjs',
        readdir: 'benchmark-readdir-concurrency.mjs',
      }
      const report = path.join(output, files[suite])
      const args = ['--expose-gc', path.join(project, 'scripts', scripts[suite])]
      args.push(
        ...(suite === 'readdir'
          ? [fixture, report]
          : [...(suite === 'competitors' ? ['--fixture', fixture] : []), '--output', report]),
      )
      return { major, suite, executable: options[`node${major}`], args, report, fixture }
    }),
  )
}
function run(executable, args, extra = {}) {
  const result = spawnSync(executable, args, { cwd: project, stdio: 'inherit', ...extra })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed (${result.status ?? result.signal})`)
  return result
}
export function verifyFixture(fixture) {
  if (inventory(fixture).manifestSha256 !== FIXTURE_MANIFEST)
    throw new Error(
      `Fixture mismatch: ${fixture}. Use a fresh pinned source archive; do not install dependencies inside it.`,
    )
}
function setupFixture(fixture) {
  if (fs.existsSync(fixture)) {
    verifyFixture(fixture)
    return
  }
  const parent = path.dirname(fixture)
  fs.mkdirSync(parent, { recursive: true })
  const staging = fs.mkdtempSync(path.join(parent, '.fixture-'))
  const archive = path.join(staging, 'source.tar.gz'),
    source = path.join(staging, 'source')
  fs.mkdirSync(source)
  try {
    run('curl', [
      '--fail',
      '--location',
      '--retry',
      '2',
      '--output',
      archive,
      `https://codeload.github.com/typescript-eslint/typescript-eslint/tar.gz/${FIXTURE_REVISION}`,
    ])
    run('tar', ['-xzf', archive, '-C', source, '--strip-components=1'])
    verifyFixture(source)
    fs.renameSync(source, fixture)
    fs.copyFileSync(archive, path.join(parent, 'typescript-eslint.tar.gz'))
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      node22: { type: 'string' },
      node24: { type: 'string' },
      output: { type: 'string' },
      fixture: { type: 'string' },
      suites: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const jobs = plan(values)
  if (values['dry-run']) {
    console.log(JSON.stringify(jobs, null, 2))
    return
  }
  for (const major of ['22', '24']) {
    const runtime = values[`node${major}`]
    const checked = run(runtime, ['-p', 'process.version'], { stdio: 'pipe', encoding: 'utf8' }).stdout.trim()
    if (!checked.startsWith(`v${major}.`)) throw new Error(`Expected Node ${major}, got ${checked}`)
    console.log(`Node ${major}: ${checked} (${runtime})`)
  }
  for (const job of jobs)
    if (fs.existsSync(job.report))
      throw new Error(`Refusing to overwrite evidence: ${job.report}. Choose a new --output directory.`)
  if (jobs.some((job) => job.suite !== 'all-apis')) setupFixture(jobs[0].fixture)
  fs.mkdirSync(path.dirname(jobs[0].report), { recursive: true })
  // Build and correctness tests are explicit prerequisites, not competing processes.
  for (const job of jobs) {
    console.log(`Running Node ${job.major}: ${job.suite}`)
    run(job.executable, job.args)
  }
  console.log(`Finished ${jobs.length} sequential runs. Review raw reports before publishing tables.`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
