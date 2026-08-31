import test from 'ava'
import { readFileSync, readFile, writeFileSync } from '../index.js'
import * as nodeFs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const multilineFixture = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n')

test('readFileSync: should read file as Buffer by default', (t) => {
  const result = readFileSync('./package.json')
  t.true(Buffer.isBuffer(result))
  t.true((result as Buffer).length > 0)
})

test('readFileSync: should read file as string with encoding=utf8', (t) => {
  const result = readFileSync('./package.json', { encoding: 'utf8' })
  t.is(typeof result, 'string')
  t.true((result as string).includes('vooya-fs'))
})

test('readFileSync: should match node:fs readFileSync', (t) => {
  const nodeResult = nodeFs.readFileSync('./package.json', 'utf8')
  const hyperResult = readFileSync('./package.json', { encoding: 'utf8' })
  t.is(hyperResult, nodeResult)
})

test('readFileSync: should throw on non-existent file', (t) => {
  t.throws(() => readFileSync('./no-such-file'), { message: /ENOENT/ })
})

test('readFile: async should read file', async (t) => {
  const result = await readFile('./package.json', { encoding: 'utf8' })
  t.is(typeof result, 'string')
  t.true((result as string).includes('vooya-fs'))
})

test('readFile: async should throw on non-existent file', async (t) => {
  await t.throwsAsync(async () => await readFile('./no-such-file'), { message: /ENOENT/ })
})

test('readFile: async should return string with encoding as string param', async (t) => {
  const result = await readFile('./package.json', 'utf-8')
  t.is(typeof result, 'string')
})

test('readFile: async should return string with encoding as options object', async (t) => {
  const result = await readFile('./package.json', { encoding: 'utf-8' })
  t.is(typeof result, 'string')
})

test('readFile: async should return Buffer with no encoding', async (t) => {
  const result = await readFile('./package.json')
  t.true(Buffer.isBuffer(result))
})

test('dual-run: readFileSync Buffer should match node:fs byte-for-byte', (t) => {
  const nodeResult = nodeFs.readFileSync('./package.json')
  const hyperResult = readFileSync('./package.json') as Buffer
  t.true(Buffer.isBuffer(hyperResult))
  t.deepEqual(hyperResult, nodeResult)
})

test('dual-run: readFileSync utf8 string should match node:fs', (t) => {
  const nodeResult = nodeFs.readFileSync('./package.json', 'utf8')
  const hyperResult = readFileSync('./package.json', { encoding: 'utf8' }) as string
  t.is(hyperResult, nodeResult)
})

test('readFile: async should read a line range', async (t) => {
  const fixturePath = join(tmpdir(), `vooya-fs-read-lines-${Date.now()}-range.txt`)
  writeFileSync(fixturePath, multilineFixture)

  const result = await readFile(fixturePath, { encoding: 'utf8', lines: { from: 1, to: 5 } })

  t.is(result, ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'].join('\n'))
})

test('readFile: async should return empty string when line range starts beyond file length', async (t) => {
  const fixturePath = join(tmpdir(), `vooya-fs-read-lines-${Date.now()}-empty.txt`)
  writeFileSync(fixturePath, multilineFixture)

  const result = await readFile(fixturePath, { encoding: 'utf8', lines: { from: 20, to: 25 } })

  t.is(result, '')
})

test('readFile: async should read a single line when from equals to', async (t) => {
  const fixturePath = join(tmpdir(), `vooya-fs-read-lines-${Date.now()}-single.txt`)
  writeFileSync(fixturePath, multilineFixture)

  const result = await readFile(fixturePath, { encoding: 'utf8', lines: { from: 7, to: 7 } })

  t.is(result, 'line 7')
})

test('readFile: async should clamp line range to file length', async (t) => {
  const fixturePath = join(tmpdir(), `vooya-fs-read-lines-${Date.now()}-clamp.txt`)
  writeFileSync(fixturePath, multilineFixture)

  const result = await readFile(fixturePath, { encoding: 'utf8', lines: { from: 10, to: 20 } })

  t.is(result, ['line 10', 'line 11', 'line 12'].join('\n'))
})

test('readFile: async should ignore line range in Buffer mode', async (t) => {
  const fixturePath = join(tmpdir(), `vooya-fs-read-lines-${Date.now()}-buffer.txt`)
  writeFileSync(fixturePath, multilineFixture)

  const result = await readFile(fixturePath, { lines: { from: 1, to: 2 } })

  t.true(Buffer.isBuffer(result))
  t.is((result as Buffer).toString('utf8'), multilineFixture)
})
