import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { copyFileSync } from '../index.js'

const tmpDir = path.join(os.tmpdir(), `vooya-fs-bench-copyfile-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

// Prepare source files
const smallSrc = path.join(tmpDir, 'small-src.txt')
const mediumSrc = path.join(tmpDir, 'medium-src.txt')
const largeSrc = path.join(tmpDir, 'large-src.txt')

fs.writeFileSync(smallSrc, 'hello world')
fs.writeFileSync(mediumSrc, 'x'.repeat(64 * 1024)) // 64KB
fs.writeFileSync(largeSrc, 'x'.repeat(4 * 1024 * 1024)) // 4MB

const iterations = 50

function benchmark(_name: string, fn: () => void): number {
  fn()
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint()
    fn()
    const end = process.hrtime.bigint()
    times.push(Number(end - start) / 1_000_000)
  }
  return times.reduce((a, b) => a + b, 0) / times.length
}

function runGroup(groupName: string, impls: { name: string; fn: () => void }[]) {
  console.log(`\n${groupName}`)
  const results: { name: string; time: number }[] = []

  for (const impl of impls) {
    results.push({ name: impl.name, time: benchmark(impl.name, impl.fn) })
  }

  const baseline = results[0]
  for (const res of results) {
    const isBaseline = res === baseline
    const ratio = res.time / baseline.time
    const diffStr = isBaseline ? '(baseline)' : `${ratio.toFixed(2)}x ${ratio > 1 ? '(slower)' : '(faster)'}`
    console.log(`  ${res.name.padEnd(25)} ${res.time.toFixed(3)} ms  ${diffStr}`)
  }
}

console.log('Benchmarking copyFile with various file sizes')

let counter = 0
const getDest = () => path.join(tmpDir, `dest-${counter++}.txt`)

// 1. Small file copy
runGroup('copyFile (small 11B)', [
  { name: 'Node.js', fn: () => fs.copyFileSync(smallSrc, getDest()) },
  { name: 'Vooya FS', fn: () => copyFileSync(smallSrc, getDest()) },
])

// 2. Medium file copy
runGroup('copyFile (64KB)', [
  { name: 'Node.js', fn: () => fs.copyFileSync(mediumSrc, getDest()) },
  { name: 'Vooya FS', fn: () => copyFileSync(mediumSrc, getDest()) },
])

// 3. Large file copy
runGroup('copyFile (4MB)', [
  { name: 'Node.js', fn: () => fs.copyFileSync(largeSrc, getDest()) },
  { name: 'Vooya FS', fn: () => copyFileSync(largeSrc, getDest()) },
])

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })
