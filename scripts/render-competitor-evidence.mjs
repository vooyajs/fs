import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const fixtures = ['tiny', 'typescript-eslint', 'wide-20000']
const scenarios = ['all', 'configs', 'javascript', 'multi', 'readdir']
const engines = ['node', 'fdir', 'fast-glob', 'tinyglobby', 'glob', 'vooya']
const workers = ['node', 'fdir', 'default', '1', '2', '4', '8']
const sha256 = /^[a-f0-9]{64}$/
const stable = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )
const same = (left, right, label) => {
  if (stable(left) !== stable(right)) throw new Error(`Mismatched ${label}`)
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
}
function validateSamples(entry, count) {
  for (const key of ['ms', 'cpuMs', 'rssDeltaBytes'])
    if (
      !Array.isArray(entry[key]) ||
      entry[key].length !== count ||
      entry[key].some(
        (value) => !Number.isFinite(value) || (key === 'ms' && value <= 0) || (key === 'cpuMs' && value < 0),
      )
    )
      throw new Error(`Invalid raw samples: ${key}`)
  if (entry.medianMs !== median(entry.ms) || entry.medianCpuMs !== median(entry.cpuMs))
    throw new Error('Stored medians do not match raw samples')
}
function validateContext(report) {
  // These runners only write their report after all work succeeds. Older schema
  // 1 reports have no complete flag, so the exact matrix below is also required.
  if (
    report.complete === false ||
    report.smoke ||
    !Number.isInteger(report.samples) ||
    report.samples < 10 ||
    !Number.isInteger(report.warmups) ||
    report.warmups < 2
  )
    throw new Error('Only complete full reports with >=10 samples / >=2 warmups can be published')
  for (const key of ['platform', 'arch', 'cpu'])
    if (typeof report[key] !== 'string' || !report[key]) throw new Error(`Missing context: ${key}`)
  if (!Number.isInteger(report.logicalCpus) || report.logicalCpus < 1) throw new Error('Missing CPU count')
  if (!report.sourceHashes || Object.values(report.sourceHashes).some((value) => !sha256.test(value)))
    throw new Error('Invalid source hashes')
  for (const file of ['api.js', 'src/readdir.rs', 'pnpm-lock.yaml', 'test/performance/competitors/suite.mjs'])
    if (!sha256.test(report.sourceHashes[file])) throw new Error(`Missing source identity: ${file}`)
  if (!sha256.test(report.nativeBinary?.sha256 ?? report.nativeBinarySha256))
    throw new Error('Missing native binary identity')
}
function validatePair(reports, sweep = false) {
  if (reports.length !== 2 || !reports[0].node?.startsWith('v22.') || !reports[1].node?.startsWith('v24.'))
    throw new Error('Expected one Node 22 report followed by one Node 24 report')
  for (const report of reports) validateContext(report)
  for (const key of ['platform', 'arch', 'cpu', 'logicalCpus', 'sourceHashes', 'samples', 'warmups'])
    same(reports[0][key], reports[1][key], key)
  same(
    reports[0].nativeBinary?.sha256 ?? reports[0].nativeBinarySha256,
    reports[1].nativeBinary?.sha256 ?? reports[1].nativeBinarySha256,
    'native binary',
  )
  same(
    sweep ? reports[0].env : reports[0].method?.env,
    sweep ? reports[1].env : reports[1].method?.env,
    'thread environment',
  )
  if (!sweep) {
    same(reports[0].packages, reports[1].packages, 'package versions')
    same(reports[0].fixtures, reports[1].fixtures, 'fixtures')
    same(reports[0].upstreamFixture, reports[1].upstreamFixture, 'fixture provenance')
  }
}
export function validateReports(reports, sweeps) {
  validatePair(reports)
  validatePair(sweeps, true)
  for (let index = 0; index < reports.length; index++) {
    const report = reports[index]
    const sweep = sweeps[index]
    if (!Array.isArray(report.cases) || report.cases.length !== 30) throw new Error('Expected all 30 competitor cases')
    same(report.fixtures?.map((fixture) => fixture.name).sort(), [...fixtures].sort(), 'fixture names')
    if (!/^[a-f0-9]{40}$/.test(report.upstreamFixture?.revision)) throw new Error('Missing fixture revision')
    for (const fixture of report.fixtures)
      if (!sha256.test(fixture.manifestSha256)) throw new Error('Missing fixture manifest')
    for (const engine of ['fdir', 'picomatch', 'fast-glob', 'tinyglobby', 'glob'])
      if (typeof report.packages?.[engine] !== 'string') throw new Error(`Missing package version: ${engine}`)
    const expected = fixtures.flatMap((fixture) =>
      scenarios.flatMap((scenario) => ['async', 'sync'].map((mode) => `${fixture}/${scenario}/${mode}`)),
    )
    const signature = (row) => `${row.fixture}/${row.scenario}/${row.mode}`
    same(report.cases.map(signature).sort(), expected.sort(), 'complete workload matrix')
    for (const row of report.cases) {
      same(
        Object.keys(row.implementations).sort(),
        (row.scenario === 'readdir' ? ['node', 'fdir', 'vooya'] : engines).slice().sort(),
        'implementation matrix',
      )
      if (!['native', 'node-fallback'].includes(row.vooyaRoute)) throw new Error('Invalid execution route')
      if (!Number.isInteger(row.resultCount) || row.resultCount < 0 || !sha256.test(row.resultSha256))
        throw new Error('Missing result identity')
      for (const entry of Object.values(row.implementations)) validateSamples(entry, report.samples)
      const peerRow = reports[1 - index].cases.find((candidate) => signature(candidate) === signature(row))
      for (const key of ['resultCount', 'resultSha256', 'patterns']) same(row[key], peerRow?.[key], key)
    }
    same(Object.keys(sweep.implementations).sort(), [...workers].sort(), 'seven concurrency implementations')
    for (const entry of Object.values(sweep.implementations)) validateSamples(entry, sweep.samples)
    for (const key of ['node', 'platform', 'arch', 'cpu', 'logicalCpus', 'samples', 'warmups'])
      same(report[key], sweep[key], `main/sweep ${key}`)
    same(report.method?.env, sweep.env, 'main/sweep thread environment')
    same(report.nativeBinary.sha256, sweep.nativeBinary?.sha256 ?? sweep.nativeBinarySha256, 'main/sweep native binary')
    for (const [file, hash] of Object.entries(report.sourceHashes))
      if (file in sweep.sourceHashes) same(hash, sweep.sourceHashes[file], `main/sweep source ${file}`)
    same(report.upstreamFixture.revision, sweep.fixtureRevision, 'sweep fixture revision')
    same(
      report.fixtures.find((fixture) => fixture.name === 'typescript-eslint').manifestSha256,
      sweep.manifestSha256,
      'sweep fixture manifest',
    )
    const realTree = report.cases.find(
      (row) => row.fixture === 'typescript-eslint' && row.scenario === 'readdir' && row.mode === 'async',
    )
    for (const key of ['resultCount', 'resultSha256']) same(realTree[key], sweep[key], `sweep ${key}`)
  }
}
const table = (header, rows) =>
  [header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')
export function render(reports, sweeps, document) {
  validateReports(reports, sweeps)
  const full = document.indexOf('\n## Full results\n')
  const focused = document.indexOf('\n## Focused readdir concurrency diagnostic\n', full)
  const next = document.indexOf('\n## What to investigate next\n', focused)
  const firstTableHeading = document.indexOf('\n### ', full)
  if (full < 0 || focused < 0 || next < 0 || firstTableHeading < full || firstTableHeading > focused)
    throw new Error('Missing or reordered evidence section boundaries')
  const mainTables = reports
    .flatMap((report) =>
      fixtures.map((fixture) =>
        [
          `### ${report.node} — ${fixture}`,
          '',
          table(
            ['Task', 'Mode', 'Node', 'fdir', 'fast-glob', 'tinyglobby', 'glob', 'Vooya', 'Vooya route'],
            scenarios.flatMap((scenario) =>
              ['async', 'sync'].map((mode) => {
                const row = report.cases.find(
                  (entry) => entry.fixture === fixture && entry.scenario === scenario && entry.mode === mode,
                )
                return [
                  scenario,
                  mode,
                  ...engines.map((engine) => row.implementations[engine]?.medianMs.toFixed(3) ?? '—'),
                  row.vooyaRoute,
                ]
              }),
            ),
          ),
        ].join('\n'),
      ),
    )
    .join('\n\n')
  const focusedSection = document.slice(focused, next)
  const existingTable = /\n\| Node\s*\|[^\n]*\n(?:\|[^\n]*\n)+/
  if (!existingTable.test(focusedSection)) throw new Error('Missing focused readdir table')
  const sweepTable = table(
    ['Node', 'Implementation / workers', 'Median ms', 'Process CPU ms'],
    sweeps.flatMap((report) =>
      workers.map((worker) => {
        const entry = report.implementations[worker]
        return [
          report.node,
          ['node', 'fdir'].includes(worker) ? worker : `Vooya ${worker}`,
          entry.medianMs.toFixed(3),
          entry.medianCpuMs.toFixed(3),
        ]
      }),
    ),
  )
  return (
    document.slice(0, firstTableHeading) +
    '\n' +
    mainTables +
    '\n' +
    focusedSection.replace(existingTable, `\n${sweepTable}\n`) +
    document.slice(next)
  )
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'docs/public/evidence' },
      output: { type: 'string', default: 'docs/content/guide/competitor-evidence.mdx' },
      template: { type: 'string', default: 'docs/content/guide/competitor-evidence.mdx' },
    },
  })
  const read = (prefix) =>
    ['22', '24'].map((version) =>
      JSON.parse(fs.readFileSync(path.join(values.input, `${prefix}-node${version}.json`), 'utf8')),
    )
  const output = render(
    read('competitors'),
    read('competitors-readdir-concurrency'),
    fs.readFileSync(values.template, 'utf8'),
  )
  fs.mkdirSync(path.dirname(values.output), { recursive: true })
  fs.writeFileSync(values.output, output)
  console.log(
    'Regenerated competitor tables. Review preserved findings and environment prose against the new reports before publishing.',
  )
}
