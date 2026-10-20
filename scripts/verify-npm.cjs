// Run from a clean consumer directory, using only the installed npm package.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const consumerRequire = createRequire(path.join(process.cwd(), 'package.json'))
const vooya = consumerRequire('@vooya/fs')
const manifest = consumerRequire('@vooya/fs/package.json')

async function main() {
  if (process.env.PACKAGE_VERSION) assert.equal(manifest.version, process.env.PACKAGE_VERSION)
  if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime) {
    assert.equal(process.arch, 'x64')
    assert.equal(manifest.optionalDependencies['@vooya/fs-linux-x64-musl'], manifest.version)
    assert.ok(consumerRequire.resolve('@vooya/fs-linux-x64-musl').endsWith('.node'))
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-npm-'))
  try {
    fs.mkdirSync(path.join(root, 'nested'))
    const filename = path.join(root, 'nested', 'hello.txt')
    const payload = 'Hello from the published native package!\n'
    fs.writeFileSync(filename, payload)
    assert.equal(vooya.readFileSync(filename, 'utf8'), payload)
    assert.equal(await vooya.readFile(filename, 'utf8'), payload)
    assert.deepEqual(vooya.readFileSync(filename), Buffer.from(payload))
    assert.deepEqual(await vooya.readFile(filename), Buffer.from(payload))
    for (const entries of [vooya.scanSync(root), await vooya.scan(root)]) {
      assert.deepEqual(
        entries.map((entry) => entry.path),
        ['nested/hello.txt'],
      )
      assert.equal(entries[0].kind, 'file')
      assert.equal(entries[0].size, Buffer.byteLength(payload))
    }
    console.log(`Verified @vooya/fs@${manifest.version} on ${process.version} ${process.platform}/${process.arch}`)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
