import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WASI } from 'node:wasi'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { scanSync } = require('../../index.js')
const iterations = Number.parseInt(process.env.VOOYA_FS_WASI_ITERATIONS ?? '10', 10)
const warmups = Number.parseInt(process.env.VOOYA_FS_WASI_WARMUP ?? '2', 10)
const wasmPath = new URL('../../target/wasm32-wasip1/release/vooya_fs_wasi_probe.wasm', import.meta.url)

function createMediumFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-wasi-'))
  let files = 0
  let dirs = 1
  const content = 'x'.repeat(1024)

  function build(dir, level) {
    for (let index = 0; index < 8; index++) {
      fs.writeFileSync(path.join(dir, `file-${level}-${index}.txt`), content)
      files += 1
    }
    if (level >= 4) return
    for (let index = 0; index < 4; index++) {
      const child = path.join(dir, `dir-${level}-${index}`)
      fs.mkdirSync(child)
      dirs += 1
      build(child, level + 1)
    }
  }

  build(root, 0)
  return { root, files, dirs }
}

function nodeScanCount(root) {
  let count = 0
  for (const relative of fs.readdirSync(root, { recursive: true })) {
    if (!fs.lstatSync(path.join(root, relative)).isDirectory()) count += 1
  }
  return count
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  }
}

function measure(fn) {
  for (let index = 0; index < warmups; index++) fn()
  const samples = []
  for (let index = 0; index < iterations; index++) {
    const start = process.hrtime.bigint()
    fn()
    samples.push(Number(process.hrtime.bigint() - start) / 1e6)
  }
  return summarize(samples)
}

const fixture = createMediumFixture()
try {
  const wasi = new WASI({
    version: 'preview1',
    preopens: { '/data': fixture.root },
  })
  const module = await WebAssembly.compile(fs.readFileSync(wasmPath))
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject())
  wasi.initialize(instance)
  const wasiScanCount = instance.exports.scan_count

  const expected = fixture.files
  if (nodeScanCount(fixture.root) !== expected) throw new Error('Node count mismatch')
  if (scanSync(fixture.root).length !== expected) throw new Error('native count mismatch')
  if (Number(wasiScanCount()) !== expected) throw new Error('WASI count mismatch')

  const report = {
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model,
    fixture: { files: fixture.files, dirs: fixture.dirs },
    method: {
      moduleInstantiation: 'once, outside samples',
      warmups,
      iterations,
      caveat:
        'WASI returns only a count; native scanSync also creates and sorts metadata records, so this comparison favors WASI.',
    },
    results: {
      nodeReaddirPlusLstat: measure(() => nodeScanCount(fixture.root)),
      nativeScanSync: measure(() => scanSync(fixture.root)),
      wasiPreview1Count: measure(() => wasiScanCount()),
    },
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  fs.rmSync(fixture.root, { recursive: true, force: true })
}
