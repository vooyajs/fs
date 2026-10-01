import test from 'ava'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { plan, verifyFixture } from '../../../scripts/run-benchmark-matrix.mjs'

test('matrix covers both runtimes sequentially and cannot overwrite published evidence', (t) => {
  const jobs = plan({ node22: '/node22', node24: '/node24', output: '.perf/retest' })
  t.deepEqual(
    jobs.map(({ major, suite }) => `${major}/${suite}`),
    ['22/all-apis', '22/competitors', '22/readdir', '24/all-apis', '24/competitors', '24/readdir'],
  )
  t.is(new Set(jobs.map((job) => job.report)).size, 6)
  t.throws(() => plan({ node22: '/node22' }))
  t.throws(() => plan({ node22: '/node22', node24: '/node24', suites: 'typo' }))
  t.throws(() => plan({ node22: '/node22', node24: '/node24', suites: 'all-apis,all-apis' }))
  t.throws(() => plan({ node22: '/node22', node24: '/node24', output: 'docs/public/evidence' }))
})

test('dry run performs no output writes; dirty fixture is rejected', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-matrix-contract-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const output = path.join(root, 'reports')
  const result = spawnSync(
    process.execPath,
    [
      'scripts/run-benchmark-matrix.mjs',
      '--node22',
      'absent22',
      '--node24',
      'absent24',
      '--output',
      output,
      '--dry-run',
    ],
    { encoding: 'utf8' },
  )
  t.is(result.status, 0, result.stderr)
  t.is(JSON.parse(result.stdout).length, 6)
  t.false(fs.existsSync(output))
  t.throws(() => verifyFixture(root), { message: /Fixture mismatch/ })
})
