const nodeFs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { writeFile } = require('../../../index.js')
const { removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

type MeasureContext = { index: number; warmup: boolean }

const scenarios = [
  { name: 'small-string', size: 128, data: () => 'x'.repeat(128) },
  { name: 'medium-string', size: 64 * 1024, data: () => 'x'.repeat(64 * 1024) },
  { name: 'large-string', size: 4 * 1024 * 1024, data: () => 'x'.repeat(4 * 1024 * 1024) },
  { name: 'medium-buffer', size: 64 * 1024, data: () => Buffer.alloc(64 * 1024, 'x') },
]

async function main(): Promise<void> {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-perf-writeFile-'))
  try {
    for (const scenario of scenarios) {
      let nodeFile = ''
      let vooyaFile = ''
      const node = await measure(`node writeFile ${scenario.name}`, () => nodeFs.writeFile(nodeFile, scenario.data()), {
        beforeEach: ({ index, warmup }: MeasureContext) => {
          nodeFile = path.join(root, `node-${scenario.name}-${warmup ? 'warmup' : 'sample'}-${index}`)
        },
        afterEach: () => removeFixture(nodeFile),
      })
      const vooya = await measure(`vooya writeFile ${scenario.name}`, () => writeFile(vooyaFile, scenario.data()), {
        beforeEach: ({ index, warmup }: MeasureContext) => {
          vooyaFile = path.join(root, `vooya-${scenario.name}-${warmup ? 'warmup' : 'sample'}-${index}`)
        },
        afterEach: () => removeFixture(vooyaFile),
      })
      printComparison('writeFile', scenario.name, node, vooya)
    }
  } finally {
    await removeFixture(root)
  }
}

module.exports = { main }
