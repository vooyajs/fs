import { performance } from 'node:perf_hooks'
import * as os from 'node:os'

import type { ScaleFixture } from '../../fixtures/fs-scale.ts'

export interface MemorySnapshot {
  rss: number
  heapUsed: number
  external: number
}

export interface Measurement {
  name: string
  durationMs: number
  iterations: number
  warmup: number
  duration: NumericSummary
  before: MemorySnapshot
  after: MemorySnapshot
  delta: MemorySnapshot
  memoryDelta: MemorySummary
}

export interface NumericSummary {
  samples: number[]
  min: number
  max: number
  median: number
  mean: number
  trimmedMean: number
}

export interface MemorySummary {
  rss: NumericSummary
  heapUsed: NumericSummary
  external: NumericSummary
}

export interface MeasureOptions {
  iterations?: number
  warmup?: number
  beforeEach?: (context: MeasureIterationContext) => unknown | Promise<unknown>
  afterEach?: (context: MeasureIterationContext) => unknown | Promise<unknown>
}

export interface BenchmarkOptions {
  iterations: number
  warmup: number
}

export interface RuntimeMetadata {
  node: string
  platform: NodeJS.Platform
  arch: string
  cpu: string
  pid: number
}

export interface BenchmarkComparison {
  api: string
  scale: string
  fixture?: {
    files: number
    dirs: number
    profile: ScaleFixture['profile']
  }
  node: Measurement
  vooya: Measurement
  ratio: number
  ratioLabel: string
  runtime: RuntimeMetadata
}

export interface BenchmarkReport {
  generatedAt: string
  options: BenchmarkOptions
  runtime: RuntimeMetadata
  comparisons: BenchmarkComparison[]
}

export interface MeasureIterationContext {
  index: number
  warmup: boolean
}

export function snapshotMemory(): MemorySnapshot {
  const usage = process.memoryUsage()
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getBenchmarkOptions(options: MeasureOptions = {}): BenchmarkOptions {
  return {
    iterations: options.iterations ?? readPositiveIntegerEnv('VOOYA_FS_PERF_ITERATIONS', 10),
    warmup: options.warmup ?? readPositiveIntegerEnv('VOOYA_FS_PERF_WARMUP', 2),
  }
}

export function summarizeSamples(samples: number[]): NumericSummary {
  if (samples.length === 0) {
    throw new Error('Cannot summarize an empty sample set')
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const trim = Math.floor(sorted.length * 0.1)
  const trimmed = trim > 0 && sorted.length - trim * 2 > 0 ? sorted.slice(trim, sorted.length - trim) : sorted
  const trimmedMean = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length

  return {
    samples,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
    mean,
    trimmedMean,
  }
}

export function getRuntimeMetadata(): RuntimeMetadata {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    pid: process.pid,
  }
}

async function measureOnce(fn: () => unknown | Promise<unknown>): Promise<{
  durationMs: number
  before: MemorySnapshot
  after: MemorySnapshot
  delta: MemorySnapshot
}> {
  if (global.gc) global.gc()
  const before = snapshotMemory()
  const start = performance.now()
  await fn()
  const durationMs = performance.now() - start
  if (global.gc) global.gc()
  const after = snapshotMemory()

  return {
    durationMs,
    before,
    after,
    delta: {
      rss: after.rss - before.rss,
      heapUsed: after.heapUsed - before.heapUsed,
      external: after.external - before.external,
    },
  }
}

export async function measure(
  name: string,
  fn: () => unknown | Promise<unknown>,
  options: MeasureOptions = {},
): Promise<Measurement> {
  const benchmarkOptions = getBenchmarkOptions(options)

  for (let i = 0; i < benchmarkOptions.warmup; i++) {
    const context = { index: i, warmup: true }
    await options.beforeEach?.(context)
    try {
      await fn()
    } finally {
      await options.afterEach?.(context)
    }
  }

  const samples = []
  const rssSamples = []
  const heapUsedSamples = []
  const externalSamples = []
  let firstBefore: MemorySnapshot | undefined
  let lastAfter: MemorySnapshot | undefined

  for (let i = 0; i < benchmarkOptions.iterations; i++) {
    const context = { index: i, warmup: false }
    await options.beforeEach?.(context)
    let sample
    try {
      sample = await measureOnce(fn)
    } finally {
      await options.afterEach?.(context)
    }
    samples.push(sample.durationMs)
    rssSamples.push(sample.delta.rss)
    heapUsedSamples.push(sample.delta.heapUsed)
    externalSamples.push(sample.delta.external)
    firstBefore ??= sample.before
    lastAfter = sample.after
  }

  const duration = summarizeSamples(samples)
  const before = firstBefore ?? snapshotMemory()
  const after = lastAfter ?? before
  const memoryDelta = {
    rss: summarizeSamples(rssSamples),
    heapUsed: summarizeSamples(heapUsedSamples),
    external: summarizeSamples(externalSamples),
  }

  return {
    name,
    durationMs: duration.trimmedMean,
    iterations: benchmarkOptions.iterations,
    warmup: benchmarkOptions.warmup,
    duration,
    before,
    after,
    delta: {
      rss: memoryDelta.rss.mean,
      heapUsed: memoryDelta.heapUsed.mean,
      external: memoryDelta.external.mean,
    },
    memoryDelta,
  }
}

export function formatBytes(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs < 1024) return `${value} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`
  return `${sign}${(abs / 1024 / 1024).toFixed(1)} MB`
}

const comparisons: BenchmarkComparison[] = []

export function createComparison(
  api: string,
  scale: string,
  node: Measurement,
  vooya: Measurement,
  fixture?: ScaleFixture,
): BenchmarkComparison {
  const ratio = vooya.durationMs / node.durationMs
  const ratioLabel = ratio > 1 ? `${ratio.toFixed(2)}x slower` : `${(1 / ratio).toFixed(2)}x faster`
  return {
    api,
    scale,
    fixture: fixture
      ? {
          files: fixture.files,
          dirs: fixture.dirs,
          profile: fixture.profile,
        }
      : undefined,
    node,
    vooya,
    ratio,
    ratioLabel,
    runtime: getRuntimeMetadata(),
  }
}

export function recordComparison(comparison: BenchmarkComparison): BenchmarkComparison {
  comparisons.push(comparison)
  return comparison
}

export function printComparison(
  api: string,
  scale: string,
  node: Measurement,
  vooya: Measurement,
  fixture?: ScaleFixture,
): void {
  const comparison = recordComparison(createComparison(api, scale, node, vooya, fixture))
  console.log(`\n${api} / ${scale}`)
  console.log(`  Samples  ${node.iterations} iterations, ${node.warmup} warmups`)
  if (fixture) {
    console.log(`  Fixture  ${fixture.files} files, ${fixture.dirs} dirs`)
  }
  console.log(
    `  Node.js  ${node.duration.trimmedMean.toFixed(2)} ms avg  ${node.duration.median.toFixed(2)} ms median  rss ${formatBytes(node.delta.rss)}  heap ${formatBytes(node.delta.heapUsed)}  external ${formatBytes(node.delta.external)}`,
  )
  console.log(
    `  Vooya FS  ${vooya.duration.trimmedMean.toFixed(2)} ms avg  ${vooya.duration.median.toFixed(2)} ms median  rss ${formatBytes(vooya.delta.rss)}  heap ${formatBytes(vooya.delta.heapUsed)}  external ${formatBytes(vooya.delta.external)}`,
  )
  console.log(`  Ratio    ${comparison.ratioLabel}`)
}

export function getPerformanceReport(): BenchmarkReport {
  return {
    generatedAt: new Date().toISOString(),
    options: getBenchmarkOptions(),
    runtime: getRuntimeMetadata(),
    comparisons,
  }
}

export function resetPerformanceReport(): void {
  comparisons.length = 0
}
