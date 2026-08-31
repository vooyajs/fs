const nodeFs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { readFile } = require('../../../index.js')
const { removeFixture } = require('../../fixtures/fs-scale.ts')
const { measure, printComparison } = require('../_helpers/measure.ts')

const scenarios = [
  { name: 'small-utf8', file: 'small.txt', size: 128, encoding: 'utf8' },
  { name: 'medium-utf8', file: 'medium.txt', size: 64 * 1024, encoding: 'utf8' },
  { name: 'large-utf8', file: 'large.txt', size: 4 * 1024 * 1024, encoding: 'utf8' },
  { name: 'large-buffer', file: 'large.bin', size: 4 * 1024 * 1024 },
]

async function main(): Promise<void> {
  const root = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'vooya-fs-perf-readFile-'))
  try {
    for (const scenario of scenarios) {
      const file = path.join(root, scenario.file)
      await nodeFs.writeFile(file, Buffer.alloc(scenario.size, 'x'))
      const options = scenario.encoding ? { encoding: scenario.encoding } : undefined
      const node = await measure(`node readFile ${scenario.name}`, () => nodeFs.readFile(file, options))
      const vooya = await measure(`vooya readFile ${scenario.name}`, () => readFile(file, options))
      printComparison('readFile', scenario.name, node, vooya)
    }

    const lineFile = path.join(root, 'large-lines.txt')
    const line = '0123456789abcdef0123456789abcdef\n'
    await nodeFs.writeFile(lineFile, line.repeat(Math.ceil((16 * 1024 * 1024) / line.length)))
    const nodeLines = () =>
      nodeFs.readFile(lineFile, 'utf8').then((text: string) => text.split(/\r?\n/).slice(0, 100).join('\n'))
    const node = await measure('node readFile and select first 100 lines', nodeLines)
    const vooya = await measure('vooya readFile lines 1-100', () =>
      readFile(lineFile, { encoding: 'utf8', lines: { from: 1, to: 100 } }),
    )
    printComparison('readFile', 'large-lines-head', node, vooya)
  } finally {
    await removeFixture(root)
  }
}

module.exports = { main }
