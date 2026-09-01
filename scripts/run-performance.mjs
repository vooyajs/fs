#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const performanceRoot = path.resolve('test/performance')
const require = createRequire(import.meta.url)
const { getPerformanceReport, resetPerformanceReport } = require('../test/performance/_helpers/measure.ts')

function parseArgs(argv) {
  const options = {
    filter: undefined,
    json: process.env.VOOYA_FS_PERF_JSON,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') {
      options.json = argv[++i]
      continue
    }
    if (arg.startsWith('--json=')) {
      options.json = arg.slice('--json='.length)
      continue
    }
    if (arg === '--iterations') {
      process.env.VOOYA_FS_PERF_ITERATIONS = argv[++i]
      continue
    }
    if (arg.startsWith('--iterations=')) {
      process.env.VOOYA_FS_PERF_ITERATIONS = arg.slice('--iterations='.length)
      continue
    }
    if (arg === '--warmup') {
      process.env.VOOYA_FS_PERF_WARMUP = argv[++i]
      continue
    }
    if (arg.startsWith('--warmup=')) {
      process.env.VOOYA_FS_PERF_WARMUP = arg.slice('--warmup='.length)
      continue
    }
    if (arg === '--large') {
      process.env.VOOYA_FS_PERF_LARGE = '1'
      continue
    }
    if (arg === '--extreme') {
      process.env.VOOYA_FS_PERF_EXTREME = '1'
      continue
    }
    if (!arg.startsWith('--') && !options.filter) {
      options.filter = arg.toLowerCase()
    }
  }

  return options
}

function writeJsonReport(file, report) {
  const output = path.resolve(file)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nWrote performance report: ${output}`)
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  resetPerformanceReport()

  const apiDirs = fs
    .readdirSync(performanceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .filter((name) => !options.filter || name.toLowerCase().includes(options.filter))

  if (apiDirs.length === 0) {
    console.log(`No performance tests found${options.filter ? ` for "${options.filter}"` : ''}.`)
    return
  }

  for (const api of apiDirs) {
    const benchFile = path.join(performanceRoot, api, `${api}.bench.ts`)
    if (fs.existsSync(benchFile)) {
      const bench = require(benchFile)
      if (typeof bench.main !== 'function') {
        throw new TypeError(`${benchFile} must export main()`)
      }
      await bench.main()
    }
  }

  const report = getPerformanceReport()
  if (options.json) {
    writeJsonReport(options.json, report)
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
