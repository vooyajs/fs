import test from 'ava'
import * as fs from 'node:fs'
import { render } from '../../../scripts/render-competitor-evidence.mjs'

const read = (prefix: string) =>
  ['22', '24'].map((version) =>
    JSON.parse(fs.readFileSync(`docs/public/evidence/${prefix}-node${version}.json`, 'utf8')),
  )
const document = fs.readFileSync('docs/content/guide/competitor-evidence.mdx', 'utf8')

test('competitor renderer preserves prose and regenerates all main and concurrency cells', (t) => {
  const reports = read('competitors')
  const sweeps = read('competitors-readdir-concurrency')
  const result = render(reports, sweeps, document)
  t.is(result.split('\n## Full results\n')[0], document.split('\n## Full results\n')[0])
  t.is(result.split('\n## What to investigate next\n')[1], document.split('\n## What to investigate next\n')[1])
  t.is((result.match(/^### v(?:22|24)\./gm) ?? []).length, 6)
  t.is((result.match(/^\| (?:all|configs|javascript|multi|readdir) \|/gm) ?? []).length, 60)
  t.is((result.match(/^\| v(?:22|24)\./gm) ?? []).length, 14)
  t.true(result.includes(reports[0].cases[0].implementations.vooya.medianMs.toFixed(3)))
  t.is(render(reports, sweeps, result), result)
})

test('competitor renderer rejects partial, inconsistent, and tampered measurements', (t) => {
  const invalid = (change: (reports: any[], sweeps: any[]) => void, message: RegExp) => {
    const reports = read('competitors')
    const sweeps = read('competitors-readdir-concurrency')
    change(reports, sweeps)
    t.throws(() => render(reports, sweeps, document), { message })
  }
  invalid((reports) => {
    reports[0].cases.pop()
  }, /30 competitor cases/)
  invalid((reports) => {
    reports[0].smoke = true
  }, /complete full reports/)
  invalid((reports) => {
    reports[0].cases[0].implementations.vooya.ms.pop()
  }, /raw samples/)
  invalid((reports) => {
    reports[0].cases[0].implementations.vooya.medianMs = 999
  }, /medians/)
  invalid((reports) => {
    reports[1].sourceHashes['api.js'] = '0'.repeat(64)
  }, /sourceHashes/)
  invalid((_, sweeps) => {
    delete sweeps[0].implementations['8']
  }, /seven concurrency/)
  invalid((_, sweeps) => {
    sweeps[0].manifestSha256 = '0'.repeat(64)
  }, /sweep fixture manifest/)
  invalid((reports) => {
    reports[0].cases[0].vooyaRoute = 'unknown'
  }, /execution route/)
})
