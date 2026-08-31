import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeFileSync, appendFileSync } from '../index.js'

const tmpDir = path.join(os.tmpdir(), `vooya-fs-bench-writefile-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

const smallData = 'hello world'
const mediumData = 'x'.repeat(64 * 1024) // 64KB
const largeData = 'x'.repeat(4 * 1024 * 1024) // 4MB
const bufferData = Buffer.alloc(64 * 1024, 0x61) // 64KB Buffer

const iterations = 50

function benchmark(_name: string, fn: () => void): number {
  // Warmup
  fn()

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint()
    fn()
    const end = process.hrtime.bigint()
    times.push(Number(end - start) / 1_000_000)
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  return avg
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

console.log('Benchmarking writeFile with various data sizes')

let counter = 0
const getPath = () => path.join(tmpDir, `file-${counter++}.txt`)

// 1. Small string write
runGroup('writeFile (small 11B, string)', [
  { name: 'Node.js', fn: () => fs.writeFileSync(getPath(), smallData) },
  { name: 'Vooya FS', fn: () => writeFileSync(getPath(), smallData) },
])

// 2. Medium string write
runGroup('writeFile (64KB, string)', [
  { name: 'Node.js', fn: () => fs.writeFileSync(getPath(), mediumData) },
  { name: 'Vooya FS', fn: () => writeFileSync(getPath(), mediumData) },
])

// 3. Large string write
runGroup('writeFile (4MB, string)', [
  { name: 'Node.js', fn: () => fs.writeFileSync(getPath(), largeData) },
  { name: 'Vooya FS', fn: () => writeFileSync(getPath(), largeData) },
])

// 4. Buffer write
runGroup('writeFile (64KB, Buffer)', [
  { name: 'Node.js', fn: () => fs.writeFileSync(getPath(), bufferData) },
  { name: 'Vooya FS', fn: () => writeFileSync(getPath(), bufferData) },
])

// 5. appendFile
const appendTarget1 = path.join(tmpDir, 'append-node.txt')
const appendTarget2 = path.join(tmpDir, 'append-hyper.txt')
fs.writeFileSync(appendTarget1, '')
fs.writeFileSync(appendTarget2, '')

runGroup('appendFile (small string)', [
  { name: 'Node.js', fn: () => fs.appendFileSync(appendTarget1, 'line\n') },
  { name: 'Vooya FS', fn: () => appendFileSync(appendTarget2, 'line\n') },
])

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })
