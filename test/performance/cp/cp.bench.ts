const nodeFs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { cp } = require('../../../index.js')
const { createScaleFixture, removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

type MeasureContext = { index: number; warmup: boolean }

const scales = process.env.VOOYA_FS_PERF_EXTREME
  ? ['tiny', 'small', 'medium', 'large', 'extreme']
  : process.env.VOOYA_FS_PERF_LARGE
    ? ['tiny', 'small', 'medium', 'large']
    : ['tiny', 'small', 'medium']

async function main(): Promise<void> {
  for (const scale of scales) {
    const fixture = await createScaleFixture('perf-cp', scale)
    const destRoot = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-perf-cp-'))
    try {
      let nodeDest = ''
      let vooyaDest = ''
      const node = await measure('node cp recursive', () => nodeFs.cp(fixture.root, nodeDest, { recursive: true }), {
        beforeEach: ({ index, warmup }: MeasureContext) => {
          nodeDest = path.join(destRoot, `node-${warmup ? 'warmup' : 'sample'}-${index}`)
        },
        afterEach: () => removeFixture(nodeDest),
      })
      const vooya = await measure(
        'vooya cp recursive',
        () => cp(fixture.root, vooyaDest, { recursive: true, concurrency: 4 }),
        {
          beforeEach: ({ index, warmup }: MeasureContext) => {
            vooyaDest = path.join(destRoot, `vooya-${warmup ? 'warmup' : 'sample'}-${index}`)
          },
          afterEach: () => removeFixture(vooyaDest),
        },
      )
      printComparison('cp', scale, node, vooya, fixture)
    } finally {
      await removeFixture(fixture.root)
      await removeFixture(destRoot)
    }
  }
}

module.exports = { main }
