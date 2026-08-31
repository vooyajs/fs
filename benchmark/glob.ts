import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { globSync as hyperGlobSync } from '../index.js'
import { globSync as nodeGlobSync } from 'glob'
import fastGlob from 'fast-glob'

const cwd = process.cwd()

// Patterns to test
const patternSimple = 'src/*.rs'
const patternRecursive = '**/*.rs'
const patternDeep = 'node_modules/**/*.json'

console.log(`Benchmarking glob in: ${cwd}`)

// 1. Simple Flat Glob
group('Glob (Simple: src/*.rs)', () => {
  bench('node-glob', () => nodeGlobSync(patternSimple, { cwd }))
  bench('fast-glob', () => fastGlob.sync(patternSimple, { cwd }))
  bench('vooya-fs', () => hyperGlobSync(patternSimple, { cwd })).baseline()
})

// 2. Recursive Glob
group('Glob (Recursive: **/*.rs)', () => {
  bench('node-glob', () => nodeGlobSync(patternRecursive, { cwd }))
  bench('fast-glob', () => fastGlob.sync(patternRecursive, { cwd }))
  bench('vooya-fs', () => hyperGlobSync(patternRecursive, { cwd })).baseline()
})

// 3. Large tree (same scale as readdir: node_modules ~30k entries) — validates parallel glob advantage
group('Glob (Large tree: node_modules/**/*.json)', () => {
  const hasNodeModules = fs.existsSync(path.join(cwd, 'node_modules'))
  if (hasNodeModules) {
    bench('node-glob', () => nodeGlobSync(patternDeep, { cwd }))
    bench('fast-glob', () => fastGlob.sync(patternDeep, { cwd }))
    bench('vooya-fs', () => hyperGlobSync(patternDeep, { cwd })).baseline()
    bench('vooya-fs (8 threads)', () => hyperGlobSync(patternDeep, { cwd, concurrency: 8 }))
  }
})

await run({
  colors: true,
})
