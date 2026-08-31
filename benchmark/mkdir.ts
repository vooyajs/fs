import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { mkdirSync } from '../index.js'

const tmpDir = path.join(os.tmpdir(), `vooya-fs-bench-mkdir-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

const iterations = 100

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

console.log('Benchmarking mkdir')

let counter = 0

// 1. Single directory creation
runGroup('mkdir (single dir)', [
  {
    name: 'Node.js',
    fn: () => {
      const dir = path.join(tmpDir, `node-single-${counter++}`)
      fs.mkdirSync(dir)
    },
  },
  {
    name: 'Vooya FS',
    fn: () => {
      const dir = path.join(tmpDir, `hyper-single-${counter++}`)
      mkdirSync(dir)
    },
  },
])

// 2. Recursive mkdir (deep path)
runGroup('mkdir (recursive, depth=5)', [
  {
    name: 'Node.js',
    fn: () => {
      const dir = path.join(tmpDir, `node-deep-${counter++}`, 'a', 'b', 'c', 'd')
      fs.mkdirSync(dir, { recursive: true })
    },
  },
  {
    name: 'Vooya FS',
    fn: () => {
      const dir = path.join(tmpDir, `hyper-deep-${counter++}`, 'a', 'b', 'c', 'd')
      mkdirSync(dir, { recursive: true })
    },
  },
])

// 3. Recursive mkdir on already-existing path (no-op scenario)
const existingDir = path.join(tmpDir, 'already-exists')
fs.mkdirSync(existingDir, { recursive: true })

runGroup('mkdir (recursive, already exists)', [
  {
    name: 'Node.js',
    fn: () => fs.mkdirSync(existingDir, { recursive: true }),
  },
  {
    name: 'Vooya FS',
    fn: () => mkdirSync(existingDir, { recursive: true }),
  },
])

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })
