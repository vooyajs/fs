import test from 'ava'
import { realpathSync, realpath } from '../index.js'
import * as nodeFs from 'node:fs'
import * as path from 'node:path'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-realpath-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  nodeFs.mkdirSync(dir, { recursive: true })
  return dir
}

test('realpathSync: should resolve to absolute path', (t) => {
  const result = realpathSync('.')
  t.true(path.isAbsolute(result))
})

test('realpathSync: should match node:fs realpathSync', (t) => {
  const nodeResult = nodeFs.realpathSync('.')
  const hyperResult = realpathSync('.')
  if (process.platform === 'win32') {
    t.is(nodeFs.realpathSync(hyperResult), nodeFs.realpathSync(nodeResult))
  } else {
    t.is(hyperResult, nodeResult)
  }
})

test('realpathSync: should throw on non-existent path', (t) => {
  t.throws(() => realpathSync('./no-such-path'), { message: /ENOENT/ })
})

test('realpath: async should resolve path', async (t) => {
  const result = await realpath('.')
  t.true(path.isAbsolute(result))
})

test('realpath: async should throw on non-existent path', async (t) => {
  await t.throwsAsync(async () => await realpath('./no-such-path'), { message: /ENOENT/ })
})

test('dual-run: realpathSync should resolve symlink to real path', (t) => {
  const dir = tmpDir()
  const target = join(dir, 'real-target.txt')
  const link = join(dir, 'link.txt')
  nodeFs.writeFileSync(target, 'hello')
  nodeFs.symlinkSync(target, link)

  const nodeResult = nodeFs.realpathSync(link)
  const hyperResult = realpathSync(link)
  if (process.platform === 'win32') {
    const nodeHyper = nodeFs.statSync(hyperResult)
    const nodeNode = nodeFs.statSync(nodeResult)
    t.true(nodeHyper.ino === nodeNode.ino && nodeHyper.dev === nodeNode.dev, 'same file')
  } else {
    t.is(hyperResult, nodeResult)
  }
  t.true(hyperResult.endsWith('real-target.txt'))
})

test('dual-run: realpathSync should resolve relative path same as node:fs', (t) => {
  const nodeResult = nodeFs.realpathSync('src')
  const hyperResult = realpathSync('src')
  if (process.platform === 'win32') {
    t.is(nodeFs.realpathSync(hyperResult), nodeFs.realpathSync(nodeResult))
  } else {
    t.is(hyperResult, nodeResult)
  }
})

test('realpath: async dual-run should resolve symlink same as node:fs', async (t) => {
  const dir = tmpDir()
  const target = join(dir, 'async-target.txt')
  const link = join(dir, 'async-link.txt')
  nodeFs.writeFileSync(target, 'hello')
  nodeFs.symlinkSync(target, link)

  const nodeResult = nodeFs.realpathSync(link)
  const hyperResult = await realpath(link)
  if (process.platform === 'win32') {
    const nodeHyper = nodeFs.statSync(hyperResult)
    const nodeNode = nodeFs.statSync(nodeResult)
    t.true(nodeHyper.ino === nodeNode.ino && nodeHyper.dev === nodeNode.dev, 'same file')
  } else {
    t.is(hyperResult, nodeResult)
  }
})
