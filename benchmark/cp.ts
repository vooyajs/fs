import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { cpSync as hyperCpSync } from '../index.js'

const tmpDir = os.tmpdir()
const baseDir = path.join(tmpDir, 'vooya-fs-bench-cp')
const srcBase = path.join(tmpDir, 'vooya-fs-bench-cp-src')

if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true })
if (fs.existsSync(srcBase)) fs.rmSync(srcBase, { recursive: true, force: true })
fs.mkdirSync(baseDir, { recursive: true })
fs.mkdirSync(srcBase, { recursive: true })

// ──────────────────────────────────
// Source tree builders
// ──────────────────────────────────

function createFlatDir(dir: string, count: number) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `file-${i}.txt`), 'content')
  }
}

function createTreeDir(dir: string, breadth: number, depth: number) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  function build(current: string, level: number) {
    if (level >= depth) return
    for (let i = 0; i < breadth; i++) {
      const sub = path.join(current, `d${level}-${i}`)
      fs.mkdirSync(sub)
      fs.writeFileSync(path.join(sub, 'file.txt'), 'hello world')
      build(sub, level + 1)
    }
  }
  build(dir, 0)
}

// Pre-build all source trees once (copy is non-destructive to src, only dest changes)
const flatSrc = path.join(srcBase, 'flat-500')
const treeSrc = path.join(srcBase, 'tree-3x5')
const treeSmallSrc = path.join(srcBase, 'tree-4x3')

createFlatDir(flatSrc, 500) // 500 files flat
createTreeDir(treeSrc, 3, 5) // 3-breadth × 5-depth ≈ 363 nodes
createTreeDir(treeSmallSrc, 4, 3) // 4-breadth × 3-depth ≈ 84 nodes

// ──────────────────────────────────
// Benchmark utilities
// ──────────────────────────────────

const implementations = [
  {
    name: 'Node.js',
    fn: (src: string, dest: string) => fs.cpSync(src, dest, { recursive: true }),
  },
  {
    name: 'Vooya FS (1 thread)',
    fn: (src: string, dest: string) => hyperCpSync(src, dest, { recursive: true, concurrency: 1 }),
  },
  {
    name: 'Vooya FS (4 threads)',
    fn: (src: string, dest: string) => hyperCpSync(src, dest, { recursive: true, concurrency: 4 }),
  },
  {
    name: 'Vooya FS (8 threads)',
    fn: (src: string, dest: string) => hyperCpSync(src, dest, { recursive: true, concurrency: 8 }),
  },
]

let destCounter = 0
function nextDest(prefix: string): string {
  return path.join(baseDir, `${prefix}-${destCounter++}`)
}

function runGroup(groupName: string, src: string) {
  console.log(`\n${groupName}`)
  const iterations = 12
  const results: { name: string; time: number }[] = []

  for (const impl of implementations) {
    // Warmup
    const warmupDest = nextDest('warmup')
    impl.fn(src, warmupDest)
    fs.rmSync(warmupDest, { recursive: true, force: true })

    const times: number[] = []
    for (let i = 0; i < iterations; i++) {
      const dest = nextDest(impl.name.replace(/[^a-zA-Z0-9]/g, '-'))
      const start = process.hrtime.bigint()
      impl.fn(src, dest)
      const end = process.hrtime.bigint()
      times.push(Number(end - start) / 1_000_000)
      fs.rmSync(dest, { recursive: true, force: true })
    }

    const sorted = [...times].sort((a, b) => a - b)
    const trimmed = sorted.slice(1, -1) // drop best and worst
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length
    results.push({ name: impl.name, time: avg })
  }

  const baseline = results[0]
  for (const res of results) {
    const ratio = res.time / baseline.time
    const diffStr = res === baseline ? '(baseline)' : `${ratio.toFixed(2)}x ${ratio > 1 ? '(slower)' : '(faster)'}`
    console.log(`  ${res.name.padEnd(28)} ${res.time.toFixed(2)} ms  ${diffStr}`)
  }
}

console.log('Benchmarking cp recursive (destructive dest — manual iterations)')
console.log('Source: pre-built, Dest: created & removed each iteration')

runGroup('Flat dir (500 files)', flatSrc)
runGroup('Tree dir (breadth=4, depth=3, ~84 nodes)', treeSmallSrc)
runGroup('Tree dir (breadth=3, depth=5, ~363 nodes)', treeSrc)

// Cleanup
if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true })
if (fs.existsSync(srcBase)) fs.rmSync(srcBase, { recursive: true, force: true })
