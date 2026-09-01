const nodeFs = require('node:fs/promises')
const { glob } = require('../../../index.js')
const { createScaleFixture, removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

const scales = process.env.VOOYA_FS_PERF_EXTREME
  ? ['tiny', 'small', 'medium', 'large', 'extreme']
  : process.env.VOOYA_FS_PERF_LARGE
    ? ['tiny', 'small', 'medium', 'large']
    : ['tiny', 'small', 'medium']

async function collectNodeGlob(root: string): Promise<unknown[]> {
  const results: unknown[] = []
  for await (const entry of nodeFs.glob('**/*.txt', { cwd: root })) {
    results.push(entry)
  }
  return results
}

async function main(): Promise<void> {
  for (const scale of scales) {
    const fixture = await createScaleFixture('perf-glob', scale)
    try {
      const node = await measure('node glob recursive', () => collectNodeGlob(fixture.root))
      const vooya = await measure('vooya glob recursive', () => glob('**/*.txt', { cwd: fixture.root }))
      printComparison('glob', scale, node, vooya, fixture)
    } finally {
      await removeFixture(fixture.root)
    }
  }
}

module.exports = { main }
