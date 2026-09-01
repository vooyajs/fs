import test from 'ava'
import { readFileSync, writeFileSync } from '../index.js'
import * as nodeFs from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpFile(name: string, content?: string | Buffer): string {
  const dir = join(tmpdir(), `vooya-fs-test-enc-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  if (content !== undefined) {
    nodeFs.writeFileSync(file, content)
  }
  return file
}

// ===== readFile encoding =====

test('readFile: utf8 encoding', (t) => {
  const file = tmpFile('utf8.txt', '你好世界 hello')
  const result = readFileSync(file, { encoding: 'utf8' })
  t.is(result, '你好世界 hello')
})

test('readFile: utf-8 encoding (alias)', (t) => {
  const file = tmpFile('utf8-alias.txt', 'test')
  const result = readFileSync(file, { encoding: 'utf-8' })
  t.is(result, 'test')
})

test('readFile: ascii encoding', (t) => {
  const file = tmpFile('ascii.txt', Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
  const result = readFileSync(file, { encoding: 'ascii' }) as string
  t.is(result, 'Hello')
})

test('readFile: latin1 encoding', (t) => {
  const file = tmpFile('latin1.txt', Buffer.from([0xe9, 0xe8, 0xea]))
  const result = readFileSync(file, { encoding: 'latin1' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'latin1' })
  t.is(result, nodeResult)
})

test('readFile: hex encoding', (t) => {
  const file = tmpFile('hex.txt', Buffer.from([0xde, 0xad, 0xbe, 0xef]))
  const result = readFileSync(file, { encoding: 'hex' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'hex' })
  t.is(result, nodeResult)
})

test('readFile: base64 encoding', (t) => {
  const file = tmpFile('base64.txt', 'Hello World')
  const result = readFileSync(file, { encoding: 'base64' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'base64' })
  t.is(result, nodeResult)
})

test('readFile: base64url encoding', (t) => {
  const file = tmpFile('base64url.txt', Buffer.from([0xfb, 0xff, 0xfe]))
  const result = readFileSync(file, { encoding: 'base64url' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'base64url' })
  t.is(result, nodeResult)
})

test('readFile: unknown encoding should throw', (t) => {
  const file = tmpFile('unknown.txt', 'test')
  t.throws(() => readFileSync(file, { encoding: 'unknown' }), { message: /Unknown encoding/ })
})

test('readFile: no encoding returns Buffer', (t) => {
  const file = tmpFile('buf.txt', 'buffer test')
  const result = readFileSync(file)
  t.true(Buffer.isBuffer(result))
})

// ===== writeFile encoding =====

test('writeFile: hex encoding', (t) => {
  const file = tmpFile('write-hex.bin')
  writeFileSync(file, 'deadbeef', { encoding: 'hex' })
  const content = nodeFs.readFileSync(file)
  t.deepEqual(content, Buffer.from([0xde, 0xad, 0xbe, 0xef]))
})

test('writeFile: base64 encoding', (t) => {
  const file = tmpFile('write-base64.txt')
  writeFileSync(file, 'SGVsbG8=', { encoding: 'base64' })
  const content = nodeFs.readFileSync(file, 'utf8')
  t.is(content, 'Hello')
})

test('writeFile: latin1 encoding', (t) => {
  const file = tmpFile('write-latin1.txt')
  const nodeFile = tmpFile('write-latin1-node.txt')

  writeFileSync(file, '\xe9\xe8\xea', { encoding: 'latin1' })
  nodeFs.writeFileSync(nodeFile, '\xe9\xe8\xea', { encoding: 'latin1' })

  const hyperBuf = nodeFs.readFileSync(file)
  const nodeBuf = nodeFs.readFileSync(nodeFile)
  t.deepEqual(hyperBuf, nodeBuf)
})

// ===== dual-run encoding comparison =====

test('dual-run: readFile base64 should match node:fs', (t) => {
  const data = 'The quick brown fox jumps over the lazy dog'
  const file = tmpFile('dual-b64.txt', data)
  const hyperResult = readFileSync(file, { encoding: 'base64' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'base64' })
  t.is(hyperResult, nodeResult)
})

test('dual-run: readFile hex should match node:fs', (t) => {
  const file = tmpFile('dual-hex.txt', Buffer.from([0x00, 0x11, 0x22, 0x33, 0xff]))
  const hyperResult = readFileSync(file, { encoding: 'hex' }) as string
  const nodeResult = nodeFs.readFileSync(file, { encoding: 'hex' })
  t.is(hyperResult, nodeResult)
})
