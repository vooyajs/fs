import test from 'ava'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  renderPerformanceSection,
  replacePerformanceSection,
  syncPerformanceDoc,
} from '../../scripts/sync-performance-docs.mjs'

const report = {
  generatedAt: '2026-07-09T00:00:00.000Z',
  options: { warmup: 2, iterations: 10 },
  runtime: {
    node: 'v24.0.0',
    platform: 'darwin',
    arch: 'arm64',
    cpu: 'Apple M4',
    pid: 123,
  },
  comparisons: [
    {
      api: 'readdir',
      scale: 'tiny',
      fixture: {
        files: 4,
        dirs: 2,
        profile: { name: 'tiny', breadth: 1, depth: 1, filesPerDir: 4, fileSize: 32 },
      },
      node: {
        duration: { trimmedMean: 1 },
        delta: { rss: 1024 },
      },
      vooya: {
        duration: { trimmedMean: 2 },
        delta: { rss: 2048 },
      },
      ratioLabel: '2.00x slower',
    },
  ],
}

const readFileReport = {
  ...report,
  comparisons: [
    {
      ...report.comparisons[0],
      api: 'readFile',
      scale: 'small-utf8',
      fixture: undefined,
    },
  ],
}

test('renderPerformanceSection creates a markdown table for an API', (t) => {
  const markdown = renderPerformanceSection(report, 'readdir')

  t.true(markdown.includes('{/* vooya-fs-perf:start readdir */}'))
  t.true(markdown.includes('| tiny | 4 files / 2 dirs | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.true(markdown.includes('2 warmup runs, 10 measured runs'))
})

test('replacePerformanceSection updates only the marker block', (t) => {
  const content = [
    'before',
    '{/* vooya-fs-perf:start readdir */}',
    'old generated content',
    '{/* vooya-fs-perf:end readdir */}',
    'after',
  ].join('\n')

  const next = replacePerformanceSection(content, 'readdir', renderPerformanceSection(report, 'readdir'))

  t.true(next.startsWith('before\n{/* vooya-fs-perf:start readdir */}'))
  t.true(next.endsWith('{/* vooya-fs-perf:end readdir */}\nafter'))
  t.false(next.includes('old generated content'))
})

test('syncPerformanceDoc maps readFile reports to read-file docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })
  const reportPath = path.join(root, 'readFile.json')
  const docPath = path.join(docsRoot, 'read-file.mdx')
  fs.writeFileSync(reportPath, JSON.stringify(readFileReport))
  fs.writeFileSync(
    docPath,
    [
      'before',
      '{/* vooya-fs-perf:start readFile */}',
      'old generated content',
      '{/* vooya-fs-perf:end readFile */}',
      'after',
    ].join('\n'),
  )

  t.is(syncPerformanceDoc({ api: 'readFile', reportPath, docsRoot }), docPath)
  const content = fs.readFileSync(docPath, 'utf8')
  t.true(content.includes('| small-utf8 | - | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.false(content.includes('old generated content'))
})

test('syncPerformanceDoc maps writeFile reports to write-file docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })
  const reportPath = path.join(root, 'writeFile.json')
  const docPath = path.join(docsRoot, 'write-file.mdx')
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      ...report,
      comparisons: [
        {
          ...report.comparisons[0],
          api: 'writeFile',
          scale: 'small-string',
          fixture: undefined,
        },
      ],
    }),
  )
  fs.writeFileSync(
    docPath,
    [
      'before',
      '{/* vooya-fs-perf:start writeFile */}',
      'old generated content',
      '{/* vooya-fs-perf:end writeFile */}',
      'after',
    ].join('\n'),
  )

  t.is(syncPerformanceDoc({ api: 'writeFile', reportPath, docsRoot }), docPath)
  const content = fs.readFileSync(docPath, 'utf8')
  t.true(content.includes('| small-string | - | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.false(content.includes('old generated content'))
})

test('syncPerformanceDoc maps stat reports to stat docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })
  const reportPath = path.join(root, 'stat.json')
  const docPath = path.join(docsRoot, 'stat.mdx')
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      ...report,
      comparisons: [
        {
          ...report.comparisons[0],
          api: 'stat',
          scale: 'single-file',
          fixture: undefined,
        },
      ],
    }),
  )
  fs.writeFileSync(
    docPath,
    [
      'before',
      '{/* vooya-fs-perf:start stat */}',
      'old generated content',
      '{/* vooya-fs-perf:end stat */}',
      'after',
    ].join('\n'),
  )

  t.is(syncPerformanceDoc({ api: 'stat', reportPath, docsRoot }), docPath)
  const content = fs.readFileSync(docPath, 'utf8')
  t.true(content.includes('| single-file | - | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.false(content.includes('old generated content'))
})

test('syncPerformanceDoc maps lstat reports to lstat docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })
  const reportPath = path.join(root, 'lstat.json')
  const docPath = path.join(docsRoot, 'lstat.mdx')
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      ...report,
      comparisons: [
        {
          ...report.comparisons[0],
          api: 'lstat',
          scale: 'symlink',
          fixture: undefined,
        },
      ],
    }),
  )
  fs.writeFileSync(
    docPath,
    [
      'before',
      '{/* vooya-fs-perf:start lstat */}',
      'old generated content',
      '{/* vooya-fs-perf:end lstat */}',
      'after',
    ].join('\n'),
  )

  t.is(syncPerformanceDoc({ api: 'lstat', reportPath, docsRoot }), docPath)
  const content = fs.readFileSync(docPath, 'utf8')
  t.true(content.includes('| symlink | - | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.false(content.includes('old generated content'))
})

test('syncPerformanceDoc maps copyFile reports to copy-file docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })
  const reportPath = path.join(root, 'copyFile.json')
  const docPath = path.join(docsRoot, 'copy-file.mdx')
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      ...report,
      comparisons: [
        {
          ...report.comparisons[0],
          api: 'copyFile',
          scale: 'small-4kb',
          fixture: undefined,
        },
      ],
    }),
  )
  fs.writeFileSync(
    docPath,
    [
      'before',
      '{/* vooya-fs-perf:start copyFile */}',
      'old generated content',
      '{/* vooya-fs-perf:end copyFile */}',
      'after',
    ].join('\n'),
  )

  t.is(syncPerformanceDoc({ api: 'copyFile', reportPath, docsRoot }), docPath)
  const content = fs.readFileSync(docPath, 'utf8')
  t.true(content.includes('| small-4kb | - | 1.00 ms | 2.00 ms | 2.00x slower | 1.0 KB | 2.0 KB |'))
  t.false(content.includes('old generated content'))
})

test('syncPerformanceDoc maps batch API reports to their docs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-sync-batch-perf-docs-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const docsRoot = path.join(root, 'api')
  fs.mkdirSync(docsRoot, { recursive: true })

  for (const api of ['scan', 'glob', 'cp', 'rm']) {
    const reportPath = path.join(root, `${api}.json`)
    const docPath = path.join(docsRoot, `${api}.mdx`)
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        ...report,
        comparisons: [{ ...report.comparisons[0], api }],
      }),
    )
    fs.writeFileSync(
      docPath,
      [
        'before',
        `{/* vooya-fs-perf:start ${api} */}`,
        'old generated content',
        `{/* vooya-fs-perf:end ${api} */}`,
        'after',
      ].join('\n'),
    )

    t.is(syncPerformanceDoc({ api, reportPath, docsRoot }), docPath)
    const content = fs.readFileSync(docPath, 'utf8')
    t.true(content.includes(`vooya-fs-perf:start ${api}`))
    t.false(content.includes('old generated content'))
  }
})
