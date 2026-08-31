import test from 'ava'

import { createComparison, summarizeSamples } from './_helpers/measure.ts'

function measurement(name: string, samples: number[]) {
  const duration = summarizeSamples(samples)
  const memory = summarizeSamples([0, 1024, 2048])
  return {
    name,
    durationMs: duration.trimmedMean,
    iterations: samples.length,
    warmup: 2,
    duration,
    before: { rss: 0, heapUsed: 0, external: 0 },
    after: { rss: 0, heapUsed: 0, external: 0 },
    delta: { rss: memory.mean, heapUsed: memory.mean, external: memory.mean },
    memoryDelta: {
      rss: memory,
      heapUsed: memory,
      external: memory,
    },
  }
}

test('summarizeSamples reports median and trimmed mean', (t) => {
  const summary = summarizeSamples([100, 1, 2, 3, 4, 5, 6, 7, 8, 9])

  t.deepEqual(summary.samples, [100, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  t.is(summary.min, 1)
  t.is(summary.max, 100)
  t.is(summary.median, 5.5)
  t.is(summary.trimmedMean, 5.5)
})

test('createComparison records a faster Vooya FS ratio label', (t) => {
  const comparison = createComparison('readdir', 'medium', measurement('node', [10, 10]), measurement('vooya', [5, 5]))

  t.is(comparison.api, 'readdir')
  t.is(comparison.ratio, 0.5)
  t.is(comparison.ratioLabel, '2.00x faster')
})
