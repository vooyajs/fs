import test from 'ava'
import * as nodeFs from 'node:fs'
import { accessSync, access } from '../index.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const F_OK = 0
const R_OK = 4
const W_OK = 2
const X_OK = 1

function tmpFile(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-access-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  nodeFs.mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  nodeFs.writeFileSync(file, 'test')
  return file
}

test('accessSync: should succeed for existing file (F_OK)', (t) => {
  t.notThrows(() => accessSync('./package.json'))
})

test('accessSync: should succeed with explicit F_OK', (t) => {
  t.notThrows(() => accessSync('./package.json', F_OK))
})

test('accessSync: should succeed with R_OK', (t) => {
  t.notThrows(() => accessSync('./package.json', R_OK))
})

test('accessSync: should succeed with W_OK', (t) => {
  t.notThrows(() => accessSync('./package.json', W_OK))
})

test('accessSync: should throw on non-existent file', (t) => {
  t.throws(() => accessSync('./no-such-file'), { message: /ENOENT/ })
})

test('access: async should succeed for existing file', async (t) => {
  await t.notThrowsAsync(async () => await access('./package.json'))
})

test('access: async should throw on non-existent file', async (t) => {
  await t.throwsAsync(async () => await access('./no-such-file'), { message: /ENOENT/ })
})

// ===== dual-run comparison =====

test('dual-run: accessSync should behave same as node:fs for existing file', (t) => {
  let nodeErr: Error | null = null
  let hyperErr: Error | null = null

  try {
    nodeFs.accessSync('./package.json', R_OK)
  } catch (e) {
    nodeErr = e as Error
  }
  try {
    accessSync('./package.json', R_OK)
  } catch (e) {
    hyperErr = e as Error
  }

  t.is(hyperErr, nodeErr)
})

test('dual-run: accessSync should both throw for non-existent file', (t) => {
  const target = './no-such-file-access-dual-' + Date.now()
  let nodeThrew = false
  let hyperThrew = false

  try {
    nodeFs.accessSync(target)
  } catch {
    nodeThrew = true
  }
  try {
    accessSync(target)
  } catch {
    hyperThrew = true
  }

  t.is(hyperThrew, nodeThrew)
})

test('accessSync: X_OK should succeed for executable file', (t) => {
  if (process.platform === 'win32') {
    t.pass('Skipping X_OK test on Windows')
    return
  }
  const file = tmpFile('exec.sh')
  nodeFs.chmodSync(file, 0o755)
  t.notThrows(() => accessSync(file, X_OK))
})

test('accessSync: should throw ENOENT (not EACCES) for missing file', (t) => {
  const target = '/tmp/no-such-file-access-' + Date.now()
  t.throws(() => accessSync(target), { message: /ENOENT/ })
})

test('dual-run: accessSync ENOENT error message starts with ENOENT like node:fs', (t) => {
  const target = '/tmp/no-such-file-access-dual-' + Date.now()
  let nodeMsg = ''
  let hyperMsg = ''
  try {
    nodeFs.accessSync(target)
  } catch (e) {
    nodeMsg = (e as Error).message
  }
  try {
    accessSync(target)
  } catch (e) {
    hyperMsg = (e as Error).message
  }
  t.true(nodeMsg.startsWith('ENOENT'))
  t.true(hyperMsg.startsWith('ENOENT'))
})
