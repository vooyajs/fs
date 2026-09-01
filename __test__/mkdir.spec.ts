import test from 'ava'
import { mkdirSync, mkdir, rmdirSync } from '../index.js'
import * as nodeFs from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpPath(name: string): string {
  return join(tmpdir(), `vooya-fs-test-mkdir-${Date.now()}-${name}`)
}

test('mkdirSync: should create a directory', (t) => {
  const dir = tmpPath('basic')
  const result = mkdirSync(dir)
  t.is(result, undefined)
  t.true(existsSync(dir))
  rmdirSync(dir)
})

test('mkdirSync: should throw on existing directory without recursive', (t) => {
  const dir = tmpPath('existing')
  mkdirSync(dir)
  t.throws(() => mkdirSync(dir), { message: /EEXIST/ })
  rmdirSync(dir)
})

test('mkdirSync: recursive should create nested dirs', (t) => {
  const dir = tmpPath('recursive')
  const nested = join(dir, 'a', 'b', 'c')
  mkdirSync(nested, { recursive: true })
  t.true(existsSync(nested))
  // cleanup
  rmdirSync(join(dir, 'a', 'b', 'c'))
  rmdirSync(join(dir, 'a', 'b'))
  rmdirSync(join(dir, 'a'))
  rmdirSync(dir)
})

test('mkdirSync: recursive should not throw if dir already exists', (t) => {
  const dir = tmpPath('recursive-exists')
  mkdirSync(dir)
  t.notThrows(() => mkdirSync(dir, { recursive: true }))
  rmdirSync(dir)
})

test('mkdirSync: recursive should throw EEXIST when target is a file', (t) => {
  const dir = tmpPath('recursive-file-exists')
  const file = join(dir, 'file.txt')
  mkdirSync(dir)
  nodeFs.writeFileSync(file, 'x')

  const err = t.throws(() => mkdirSync(file, { recursive: true }), { message: /EEXIST/ })
  t.true((err?.message ?? '').includes(file))

  nodeFs.rmSync(dir, { recursive: true, force: true })
})

test('mkdirSync: recursive should throw ENOTDIR when ancestor is a file', (t) => {
  const dir = tmpPath('recursive-not-dir')
  const file = join(dir, 'file.txt')
  const nested = join(file, 'child')
  mkdirSync(dir)
  nodeFs.writeFileSync(file, 'x')

  const err = t.throws(() => mkdirSync(nested, { recursive: true }), { message: /ENOTDIR/ })
  t.true((err?.message ?? '').includes(nested))

  nodeFs.rmSync(dir, { recursive: true, force: true })
})

test('mkdir: async should create a directory', async (t) => {
  const dir = tmpPath('async')
  const result = await mkdir(dir)
  t.is(result, undefined)
  t.true(existsSync(dir))
  rmdirSync(dir)
})

test('mkdir: async recursive', async (t) => {
  const dir = tmpPath('async-recursive')
  const nested = join(dir, 'x', 'y')
  await mkdir(nested, { recursive: true })
  t.true(existsSync(nested))
  rmdirSync(join(dir, 'x', 'y'))
  rmdirSync(join(dir, 'x'))
  rmdirSync(dir)
})

// ===== dual-run comparison =====

test('dual-run: mkdirSync recursive should create same structure as node:fs', (t) => {
  const nodeDir = tmpPath('node-recursive')
  const hyperDir = tmpPath('hyper-recursive')

  nodeFs.mkdirSync(join(nodeDir, 'a', 'b'), { recursive: true })
  mkdirSync(join(hyperDir, 'a', 'b'), { recursive: true })

  t.is(existsSync(join(nodeDir, 'a', 'b')), existsSync(join(hyperDir, 'a', 'b')))
  t.is(existsSync(join(nodeDir, 'a')), existsSync(join(hyperDir, 'a')))

  nodeFs.rmSync(nodeDir, { recursive: true })
  nodeFs.rmSync(hyperDir, { recursive: true })
})

test('dual-run: mkdirSync should return first created path like node:fs', (t) => {
  const nodeDir = tmpPath('node-return')
  const hyperDir = tmpPath('hyper-return')

  const nodeResult = nodeFs.mkdirSync(join(nodeDir, 'a', 'b'), { recursive: true })
  const hyperResult = mkdirSync(join(hyperDir, 'a', 'b'), { recursive: true })

  t.is(typeof hyperResult, typeof nodeResult)
  if (nodeResult !== undefined && hyperResult != null) {
    t.true(nodeResult.endsWith('node-return'))
    t.true(hyperResult.endsWith('hyper-return'))
  }

  nodeFs.rmSync(nodeDir, { recursive: true })
  nodeFs.rmSync(hyperDir, { recursive: true })
})
