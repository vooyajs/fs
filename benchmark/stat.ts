import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import { statSync, lstatSync } from '../index.js'

const targetFile = 'package.json'
const targetDir = 'node_modules'

console.log(`Benchmarking stat on: ${targetFile} and ${targetDir}`)

// 1. stat on a file
group('stat (file)', () => {
  bench('Node.js', () => fs.statSync(targetFile)).baseline()
  bench('Vooya FS', () => statSync(targetFile))
})

// 2. stat on a directory
group('stat (directory)', () => {
  bench('Node.js', () => fs.statSync(targetDir)).baseline()
  bench('Vooya FS', () => statSync(targetDir))
})

// 3. lstat on a file
group('lstat (file)', () => {
  bench('Node.js', () => fs.lstatSync(targetFile)).baseline()
  bench('Vooya FS', () => lstatSync(targetFile))
})

// 4. Batch stat — stat multiple files in sequence
const files = fs.readdirSync('src').map((f) => `src/${f}`)
console.log(`Batch stat target: ${files.length} files in src/`)

group(`stat batch (${files.length} files)`, () => {
  bench('Node.js', () => {
    for (const f of files) fs.statSync(f)
  }).baseline()
  bench('Vooya FS', () => {
    for (const f of files) statSync(f)
  })
})

await run({ colors: true })
