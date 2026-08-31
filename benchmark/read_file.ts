import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { readFileSync } from '../index.js'

const tmpDir = path.join(os.tmpdir(), `vooya-fs-bench-readfile-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

// Prepare test files of various sizes
const smallFile = path.join(tmpDir, 'small.txt')
const mediumFile = path.join(tmpDir, 'medium.txt')
const largeFile = path.join(tmpDir, 'large.txt')

fs.writeFileSync(smallFile, 'hello world')
fs.writeFileSync(mediumFile, 'x'.repeat(64 * 1024)) // 64KB
fs.writeFileSync(largeFile, 'x'.repeat(4 * 1024 * 1024)) // 4MB

// Also use a real file for realistic benchmark
const realFile = 'package.json'

console.log('Benchmarking readFile with various file sizes')

// 1. Small file — Buffer
group('readFile (small 11B, Buffer)', () => {
  bench('Node.js', () => fs.readFileSync(smallFile)).baseline()
  bench('Vooya FS', () => readFileSync(smallFile))
})

// 2. Small file — UTF-8 string
group('readFile (small 11B, utf8)', () => {
  bench('Node.js', () => fs.readFileSync(smallFile, 'utf8')).baseline()
  bench('Vooya FS', () => readFileSync(smallFile, { encoding: 'utf8' }))
})

// 3. Medium file — Buffer
group('readFile (64KB, Buffer)', () => {
  bench('Node.js', () => fs.readFileSync(mediumFile)).baseline()
  bench('Vooya FS', () => readFileSync(mediumFile))
})

// 4. Medium file — UTF-8 string
group('readFile (64KB, utf8)', () => {
  bench('Node.js', () => fs.readFileSync(mediumFile, 'utf8')).baseline()
  bench('Vooya FS', () => readFileSync(mediumFile, { encoding: 'utf8' }))
})

// 5. Large file — Buffer
group('readFile (4MB, Buffer)', () => {
  bench('Node.js', () => fs.readFileSync(largeFile)).baseline()
  bench('Vooya FS', () => readFileSync(largeFile))
})

// 6. Large file — UTF-8 string
group('readFile (4MB, utf8)', () => {
  bench('Node.js', () => fs.readFileSync(largeFile, 'utf8')).baseline()
  bench('Vooya FS', () => readFileSync(largeFile, { encoding: 'utf8' }))
})

// 7. Real file (package.json) — UTF-8 string
group('readFile (package.json, utf8)', () => {
  bench('Node.js', () => fs.readFileSync(realFile, 'utf8')).baseline()
  bench('Vooya FS', () => readFileSync(realFile, { encoding: 'utf8' }))
})

await run({ colors: true })

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })
