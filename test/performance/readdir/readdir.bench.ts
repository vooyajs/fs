const nodeFs = require('node:fs/promises')
const { readdir } = require('../../../index.js')
const { createScaleFixture, removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

const scales = process.env.VOOYA_FS_PERF_EXTREME
  ? ['tiny', 'small', 'medium', 'large', 'extreme']
  : process.env.VOOYA_FS_PERF_LARGE
    ? ['tiny', 'small', 'medium', 'large']
    : ['tiny', 'small', 'medium']

async function main(): Promise<void> {
  for (const scale of scales) {
    const fixture = await createScaleFixture('perf-readdir', scale)
    try {
      const node = await measure('node readdir recursive', () => nodeFs.readdir(fixture.root, { recursive: true }))
      const vooya = await measure('vooya readdir recursive', () => readdir(fixture.root, { recursive: true }))
      printComparison('readdir', scale, node, vooya, fixture)
    } finally {
      await removeFixture(fixture.root)
    }
  }
}

module.exports = { main }
