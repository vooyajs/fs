const nodeFs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { copyFile } = require('../../../index.js')
const { removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

async function writeFixture(file: string, bytes: number): Promise<void> {
  await nodeFs.writeFile(file, Buffer.alloc(bytes, 'x'))
}

async function compareCopy(root: string, scale: string, bytes: number): Promise<void> {
  const src = path.join(root, `${scale}-src.bin`)
  const nodeDest = path.join(root, `${scale}-node.bin`)
  const vooyaDest = path.join(root, `${scale}-vooya.bin`)
  await writeFixture(src, bytes)

  const node = await measure(`node copyFile ${scale}`, () => nodeFs.copyFile(src, nodeDest), {
    beforeEach: () => nodeFs.rm(nodeDest, { force: true }),
  })
  const vooya = await measure(`vooya copyFile ${scale}`, () => copyFile(src, vooyaDest), {
    beforeEach: () => nodeFs.rm(vooyaDest, { force: true }),
  })
  printComparison('copyFile', scale, node, vooya)
}

async function main(): Promise<void> {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-perf-copyfile-'))
  try {
    await compareCopy(root, 'small-4kb', 4 * 1024)
    await compareCopy(root, 'medium-1mb', 1024 * 1024)
    await compareCopy(root, 'large-8mb', 8 * 1024 * 1024)
  } finally {
    await removeFixture(root)
  }
}

module.exports = { main }
