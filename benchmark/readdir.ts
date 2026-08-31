import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { readdirSync } from '../index.js'

const targetDir = path.resolve(process.cwd(), 'node_modules')
// Fallback to current directory if node_modules doesn't exist
const dir = fs.existsSync(targetDir) ? targetDir : process.cwd()

console.log(`Benchmarking readdir on: ${dir}`)
try {
  const count = fs.readdirSync(dir).length
  console.log(`File count in target dir: ${count}`)
} catch {}

// 1. Basic readdir
group('Readdir (names only)', () => {
  bench('Node.js', () => fs.readdirSync(dir)).baseline()
  bench('Vooya FS', () => readdirSync(dir))
})

// 2. With File Types
group('Readdir (withFileTypes)', () => {
  bench('Node.js', () => fs.readdirSync(dir, { withFileTypes: true })).baseline()
  bench('Vooya FS', () => readdirSync(dir, { withFileTypes: true }))
})

// 3. Recursive + withFileTypes
group('Readdir (recursive + withFileTypes)', () => {
  bench('Node.js', () => fs.readdirSync(dir, { recursive: true, withFileTypes: true })).baseline()
  bench('Vooya FS', () => readdirSync(dir, { recursive: true, withFileTypes: true }))
})

// 4. Concurrency (Vooya FS only comparison)
group('Vooya FS Concurrency', () => {
  bench('Default (Auto)', () => readdirSync(dir, { recursive: true })).baseline()
  bench('4 Threads', () => readdirSync(dir, { recursive: true, concurrency: 4 }))
})

await run({
  colors: true,
})
