#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDocNames = new Map([
  ['copyFile', 'copy-file.mdx'],
  ['cp', 'cp.mdx'],
  ['glob', 'glob.mdx'],
  ['readFile', 'read-file.mdx'],
  ['lstat', 'lstat.mdx'],
  ['readdir', 'readdir.mdx'],
  ['rm', 'rm.mdx'],
  ['scan', 'scan.mdx'],
  ['stat', 'stat.mdx'],
  ['writeFile', 'write-file.mdx'],
])

function formatMs(value) {
  return `${value.toFixed(2)} ms`
}

function formatBytes(value) {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs < 1024) return `${value.toFixed(0)} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`
  return `${sign}${(abs / 1024 / 1024).toFixed(1)} MB`
}

function marker(api, side) {
  return `{/* vooya-fs-perf:${side} ${api} */}`
}

function selectComparisons(report, api) {
  return report.comparisons.filter((comparison) => comparison.api === api)
}

export function renderPerformanceSection(report, api) {
  const comparisons = selectComparisons(report, api)
  if (comparisons.length === 0) {
    throw new Error(`No performance comparisons found for ${api}`)
  }

  const runtime = report.runtime
  const options = report.options
  const rows = comparisons
    .map((comparison) => {
      const fixture = comparison.fixture ? `${comparison.fixture.files} files / ${comparison.fixture.dirs} dirs` : '-'
      return `| ${comparison.scale} | ${fixture} | ${formatMs(comparison.node.duration.trimmedMean)} | ${formatMs(comparison.vooya.duration.trimmedMean)} | ${comparison.ratioLabel} | ${formatBytes(comparison.node.delta.rss)} | ${formatBytes(comparison.vooya.delta.rss)} |`
    })
    .join('\n')

  return [
    marker(api, 'start'),
    '',
    '_Generated from local performance reports. Do not edit this block by hand._',
    '',
    `- Runtime: ${runtime.node} on ${runtime.platform}/${runtime.arch}`,
    `- Samples: ${options.warmup} warmup runs, ${options.iterations} measured runs`,
    '- Aggregation: trimmed mean for wall-clock time; average per-run memory delta for RSS',
    '',
    '| Scale | Fixture | Node.js | Vooya FS | Ratio | Node RSS | Vooya FS RSS |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    rows,
    '',
    marker(api, 'end'),
  ].join('\n')
}

export function replacePerformanceSection(content, api, replacement) {
  const start = marker(api, 'start')
  const end = marker(api, 'end')
  const startIndex = content.indexOf(start)
  const endIndex = content.indexOf(end)

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing performance marker block for ${api}`)
  }

  return `${content.slice(0, startIndex)}${replacement}${content.slice(endIndex + end.length)}`
}

export function syncPerformanceDoc({ api, reportPath, docsRoot = path.resolve('docs/content/api') }) {
  const docName = apiDocNames.get(api)
  if (!docName) {
    throw new Error(`No API doc mapping configured for ${api}`)
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const docPath = path.join(docsRoot, docName)
  const content = fs.readFileSync(docPath, 'utf8')
  const nextContent = replacePerformanceSection(content, api, renderPerformanceSection(report, api))
  fs.writeFileSync(docPath, nextContent)
  return docPath
}

function parseArgs(argv) {
  const options = {
    api: argv[0],
    reportPath: process.env.VOOYA_FS_PERF_JSON,
  }

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--report') {
      options.reportPath = argv[++i]
    } else if (arg.startsWith('--report=')) {
      options.reportPath = arg.slice('--report='.length)
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.api || !options.reportPath) {
    throw new Error('Usage: sync-performance-docs.mjs <api> --report <report.json>')
  }

  const docPath = syncPerformanceDoc(options)
  console.log(`Updated performance docs: ${docPath}`)
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
