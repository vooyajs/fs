import test from 'ava'
import { writeFileSync, writeFile, readFileSync, appendFileSync, appendFile } from '../index.js'
import * as nodeFs from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpFile(name: string): string {
  const dir = join(tmpdir(), `vooya-fs-test-write-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

test('writeFileSync: should write string to file', (t) => {
  const file = tmpFile('str.txt')
  writeFileSync(file, 'hello world')
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'hello world')
})

test('writeFileSync: should write Buffer to file', (t) => {
  const file = tmpFile('buf.txt')
  writeFileSync(file, Buffer.from('buffer data'))
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'buffer data')
})

test('writeFileSync: should overwrite existing file', (t) => {
  const file = tmpFile('overwrite.txt')
  writeFileSync(file, 'first')
  writeFileSync(file, 'second')
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'second')
})

test('writeFile: async should write file', async (t) => {
  const file = tmpFile('async.txt')
  await writeFile(file, 'async content')
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'async content')
})

test('appendFileSync: should append to file', (t) => {
  const file = tmpFile('append.txt')
  writeFileSync(file, 'start')
  appendFileSync(file, '-end')
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'start-end')
})

test('appendFile: async should append', async (t) => {
  const file = tmpFile('append-async.txt')
  writeFileSync(file, 'a')
  await appendFile(file, 'b')
  const content = readFileSync(file, { encoding: 'utf8' })
  t.is(content, 'ab')
})

// ===== encoding option tests (async) =====

test('writeFile: async hex encoding should write decoded binary bytes', async (t) => {
  const file = tmpFile('async-hex.bin')
  // "deadbeef" 以 hex encoding 写入，应得到 4 个字节 0xde 0xad 0xbe 0xef
  await writeFile(file, 'deadbeef', { encoding: 'hex' })
  const buf = nodeFs.readFileSync(file)
  t.deepEqual([...buf], [0xde, 0xad, 0xbe, 0xef])
})

test('writeFile: async base64 encoding should write decoded bytes', async (t) => {
  const file = tmpFile('async-b64.bin')
  const original = Buffer.from([0x01, 0x02, 0x03, 0xff])
  const b64 = original.toString('base64')
  await writeFile(file, b64, { encoding: 'base64' })
  const buf = nodeFs.readFileSync(file)
  t.deepEqual([...buf], [...original])
})

test('writeFile: async encoding result matches node:fs writeFile', async (t) => {
  const nodeFile = tmpFile('node-hex.bin')
  const hyperFile = tmpFile('hyper-hex.bin')
  nodeFs.writeFileSync(nodeFile, 'cafebabe', { encoding: 'hex' })
  await writeFile(hyperFile, 'cafebabe', { encoding: 'hex' })
  t.deepEqual([...nodeFs.readFileSync(hyperFile)], [...nodeFs.readFileSync(nodeFile)])
})

test('appendFile: async hex encoding should append decoded binary bytes', async (t) => {
  const file = tmpFile('async-append-hex.bin')
  nodeFs.writeFileSync(file, Buffer.from([0x01]))
  await appendFile(file, 'ff00', { encoding: 'hex' })
  const buf = nodeFs.readFileSync(file)
  t.deepEqual([...buf], [0x01, 0xff, 0x00])
})

test('appendFile: async encoding result matches node:fs appendFile', async (t) => {
  const nodeFile = tmpFile('node-append-b64.bin')
  const hyperFile = tmpFile('hyper-append-b64.bin')
  const b64 = Buffer.from('hello').toString('base64')
  nodeFs.writeFileSync(nodeFile, '')
  nodeFs.writeFileSync(hyperFile, '')
  nodeFs.appendFileSync(nodeFile, b64, { encoding: 'base64' })
  await appendFile(hyperFile, b64, { encoding: 'base64' })
  t.deepEqual([...nodeFs.readFileSync(hyperFile)], [...nodeFs.readFileSync(nodeFile)])
})

// ===== dual-run comparison =====

test('dual-run: writeFileSync should produce same file content as node:fs', (t) => {
  const nodeFile = tmpFile('node-write.txt')
  const hyperFile = tmpFile('hyper-write.txt')
  const data = 'hello dual-run test 你好世界'

  nodeFs.writeFileSync(nodeFile, data)
  writeFileSync(hyperFile, data)

  const nodeContent = nodeFs.readFileSync(nodeFile, 'utf8')
  const hyperContent = nodeFs.readFileSync(hyperFile, 'utf8')
  t.is(hyperContent, nodeContent)
})

test('dual-run: writeFileSync Buffer should produce same content as node:fs', (t) => {
  const nodeFile = tmpFile('node-buf.txt')
  const hyperFile = tmpFile('hyper-buf.txt')
  const data = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])

  nodeFs.writeFileSync(nodeFile, data)
  writeFileSync(hyperFile, data)

  const nodeContent = nodeFs.readFileSync(nodeFile)
  const hyperContent = nodeFs.readFileSync(hyperFile)
  t.deepEqual(hyperContent, nodeContent)
})

test('dual-run: appendFileSync should produce same result as node:fs', (t) => {
  const nodeFile = tmpFile('node-append.txt')
  const hyperFile = tmpFile('hyper-append.txt')

  nodeFs.writeFileSync(nodeFile, 'base')
  writeFileSync(hyperFile, 'base')

  nodeFs.appendFileSync(nodeFile, '-appended')
  appendFileSync(hyperFile, '-appended')

  const nodeContent = nodeFs.readFileSync(nodeFile, 'utf8')
  const hyperContent = nodeFs.readFileSync(hyperFile, 'utf8')
  t.is(hyperContent, nodeContent)
})
