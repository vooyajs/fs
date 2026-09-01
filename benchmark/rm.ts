import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { rmSync as hyperRmSync } from '../index.js'

const tmpDir = os.tmpdir()
const baseDir = path.join(tmpDir, 'vooya-fs-bench-rm')

if (fs.existsSync(baseDir)) {
  fs.rmSync(baseDir, { recursive: true, force: true })
}
fs.mkdirSync(baseDir)

function createFlatStructure(dir: string, count: number) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `file-${i}.txt`), 'content')
  }
}

function createDeepStructure(dir: string, depth: number) {
  let current = dir
  if (!fs.existsSync(current)) fs.mkdirSync(current, { recursive: true })
  for (let i = 0; i < depth; i++) {
    current = path.join(current, `depth-${i}`)
    fs.mkdirSync(current)
    fs.writeFileSync(path.join(current, 'file.txt'), 'content')
  }
}

function createTreeStructure(dir: string, breadth: number, depth: number) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  function build(current: string, level: number) {
    if (level >= depth) return
    for (let i = 0; i < breadth; i++) {
      const sub = path.join(current, `d${level}-${i}`)
      fs.mkdirSync(sub)
      fs.writeFileSync(path.join(sub, 'file.txt'), 'content')
      build(sub, level + 1)
    }
  }
  build(dir, 0)
}

const implementations = [
  { name: 'Node.js', fn: (p: string) => fs.rmSync(p, { recursive: true, force: true }) },
  { name: 'Vooya FS', fn: (p: string) => hyperRmSync(p, { recursive: true, force: true }) },
  {
    name: 'Vooya FS (4 threads)',
    fn: (p: string) => hyperRmSync(p, { recursive: true, force: true, concurrency: 4 }),
  },
]

function runGroup(groupName: string, setupFn: (dir: string) => void) {
  console.log(`\n${groupName}`)
  const iterations = 10
  const results: { name: string; time: number }[] = []

  for (const impl of implementations) {
    const times: number[] = []

    const warmupDir = path.join(baseDir, `warmup-${impl.name.replace(/[^a-zA-Z0-9]/g, '')}`)
    setupFn(warmupDir)
    impl.fn(warmupDir)

    for (let i = 0; i < iterations; i++) {
      const testDir = path.join(baseDir, `${impl.name.replace(/[^a-zA-Z0-9]/g, '-')}-${i}`)
      setupFn(testDir)

      const start = process.hrtime.bigint()
      impl.fn(testDir)
      const end = process.hrtime.bigint()

      times.push(Number(end - start) / 1_000_000)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    results.push({ name: impl.name, time: avg })
  }

  const baseline = results[0]
  for (const res of results) {
    const isBaseline = res === baseline
    const ratio = res.time / baseline.time
    const diffStr = isBaseline ? '(baseline)' : `${ratio.toFixed(2)}x ${ratio > 1 ? '(slower)' : '(faster)'}`
    console.log(`  ${res.name.padEnd(25)} ${res.time.toFixed(3)} ms  ${diffStr}`)
  }
}

console.log('Benchmarking rm (destructive — manual iterations)')

runGroup('Flat directory (2000 files)', (dir) => createFlatStructure(dir, 2000))
runGroup('Deep nested directory (depth 100)', (dir) => createDeepStructure(dir, 100))
runGroup('Tree structure (breadth=3, depth=4, ~120 nodes)', (dir) => createTreeStructure(dir, 3, 4))

if (fs.existsSync(baseDir)) {
  fs.rmSync(baseDir, { recursive: true, force: true })
}
