import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import { existsSync, accessSync } from '../index.js'

const existingFile = 'package.json'
const existingDir = 'node_modules'
const nonExistent = '/tmp/vooya-fs-bench-nonexistent-path-12345'

console.log('Benchmarking exists / access')

// 1. existsSync — existing file
group('exists (existing file)', () => {
  bench('Node.js', () => fs.existsSync(existingFile)).baseline()
  bench('Vooya FS', () => existsSync(existingFile))
})

// 2. existsSync — non-existent path
group('exists (non-existent)', () => {
  bench('Node.js', () => fs.existsSync(nonExistent)).baseline()
  bench('Vooya FS', () => existsSync(nonExistent))
})

// 3. accessSync — existing file (F_OK)
group('access (existing file, F_OK)', () => {
  bench('Node.js', () => fs.accessSync(existingFile, fs.constants.F_OK)).baseline()
  bench('Vooya FS', () => accessSync(existingFile))
})

// 4. accessSync — existing dir (R_OK)
group('access (existing dir, R_OK)', () => {
  bench('Node.js', () => fs.accessSync(existingDir, fs.constants.R_OK)).baseline()
  bench('Vooya FS', () => accessSync(existingDir, fs.constants.R_OK))
})

// 5. Batch exists — check many files rapidly
const files = fs.readdirSync('src').map((f) => `src/${f}`)
console.log(`Batch exists target: ${files.length} files in src/`)

group(`exists batch (${files.length} files)`, () => {
  bench('Node.js', () => {
    for (const f of files) fs.existsSync(f)
  }).baseline()
  bench('Vooya FS', () => {
    for (const f of files) existsSync(f)
  })
})

await run({ colors: true })
