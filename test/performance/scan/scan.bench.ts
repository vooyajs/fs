const nodeFs = require('node:fs/promises')
const path = require('node:path')
const { scan } = require('../../../index.js')
const { createScaleFixture, removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

const scales = process.env.VOOYA_FS_PERF_EXTREME
  ? ['tiny', 'small', 'medium', 'large', 'extreme']
  : process.env.VOOYA_FS_PERF_LARGE
    ? ['tiny', 'small', 'medium', 'large']
    : ['tiny', 'small', 'medium']

async function nodeScan(root: string): Promise<unknown[]> {
  const paths: string[] = await nodeFs.readdir(root, { recursive: true })
  const entries = await Promise.all(
    paths.map(async (relativePath) => ({
      path: relativePath,
      metadata: await nodeFs.lstat(path.join(root, relativePath)),
    })),
  )
  return entries.filter((entry) => !entry.metadata.isDirectory())
}

async function main(): Promise<void> {
  for (const scale of scales) {
    const fixture = await createScaleFixture('perf-scan', scale)
    try {
      const nodeEntries = await nodeScan(fixture.root)
      const vooyaEntries = await scan(fixture.root)
      if (nodeEntries.length !== vooyaEntries.length) {
        throw new Error(`scan count mismatch: Node ${nodeEntries.length}, Vooya ${vooyaEntries.length}`)
      }

      const node = await measure('node recursive readdir plus lstat', () => nodeScan(fixture.root))
      const vooya = await measure('vooya scan', () => scan(fixture.root))
      printComparison('scan', scale, node, vooya, fixture)
    } finally {
      await removeFixture(fixture.root)
    }
  }
}

module.exports = { main }
