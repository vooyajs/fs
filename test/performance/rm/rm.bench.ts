const nodeFs = require('node:fs/promises')
const { rm } = require('../../../index.js')
const { copyFixture, createScaleFixture, removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

type MeasureContext = { index: number; warmup: boolean }

const scales = process.env.VOOYA_FS_PERF_EXTREME
  ? ['tiny', 'small', 'medium', 'large', 'extreme']
  : process.env.VOOYA_FS_PERF_LARGE
    ? ['tiny', 'small', 'medium', 'large']
    : ['tiny', 'small', 'medium']

async function main(): Promise<void> {
  for (const scale of scales) {
    const fixture = await createScaleFixture('perf-rm', scale)
    let nodeRoot = ''
    let vooyaRoot = ''
    try {
      const node = await measure('node rm recursive', () => nodeFs.rm(nodeRoot, { recursive: true }), {
        beforeEach: ({ index, warmup }: MeasureContext) =>
          copyFixture(fixture.root, `perf-node-rm-${warmup ? 'warmup' : 'sample'}-${index}`).then((root: string) => {
            nodeRoot = root
          }),
        afterEach: () => removeFixture(nodeRoot),
      })
      const vooya = await measure('vooya rm recursive', () => rm(vooyaRoot, { recursive: true, concurrency: 4 }), {
        beforeEach: ({ index, warmup }: MeasureContext) =>
          copyFixture(fixture.root, `perf-vooya-rm-${warmup ? 'warmup' : 'sample'}-${index}`).then((root: string) => {
            vooyaRoot = root
          }),
        afterEach: () => removeFixture(vooyaRoot),
      })
      printComparison('rm', scale, node, vooya, fixture)
    } finally {
      await removeFixture(fixture.root)
      await removeFixture(nodeRoot)
      await removeFixture(vooyaRoot)
    }
  }
}

module.exports = { main }
