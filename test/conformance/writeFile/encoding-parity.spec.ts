import test from 'ava'
import * as fs from 'node:fs'
import * as promises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile, readFileSync, writeFile, writeFileSync, appendFile, appendFileSync } from '../../../index.js'

const cases = [
  ['ascii', 'é中😀'],
  ['latin1', 'é中😀'],
  ['binary', 'é中😀'],
  ['base64', '-_8='],
  ['base64url', '+/8='],
  ['base64', 'YQ==Yg=='],
  ['base64url', 'Y Q\n==Yg=='],
  ['UTF-8', 'é中😀'],
  ['HEX', 'deadbeef'],
] as const

for (const [encoding, value] of cases) {
  test(`encoding parity: ${encoding} ${JSON.stringify(value)}`, async (t) => {
    const root = fs.mkdtempSync(join(tmpdir(), 'vooya-encoding-'))
    t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
    const actual = join(root, 'actual')
    const expected = join(root, 'expected')
    for (const options of [encoding, { encoding }]) {
      const nodeOptions = options as fs.WriteFileOptions
      fs.writeFileSync(expected, value, nodeOptions)
      writeFileSync(actual, value, options)
      t.deepEqual(fs.readFileSync(actual), fs.readFileSync(expected))
      await promises.writeFile(expected, value, nodeOptions)
      await writeFile(actual, value, options)
      t.deepEqual(fs.readFileSync(actual), fs.readFileSync(expected))
      fs.appendFileSync(expected, value, nodeOptions)
      appendFileSync(actual, value, options)
      t.deepEqual(fs.readFileSync(actual), fs.readFileSync(expected))
      await promises.appendFile(expected, value, nodeOptions)
      await appendFile(actual, value, options)
      t.deepEqual(fs.readFileSync(actual), fs.readFileSync(expected))
    }
  })
}

test('readFile: malformed UTF-8 uses Node replacement decoding in both API shapes', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-decoding-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'invalid')
  for (const bytes of [
    [0xff, 0x61],
    [0xe2, 0x82],
    [0xed, 0xa0, 0x80],
    [0xf0, 0x9f, 0x98, 0x80],
  ]) {
    fs.writeFileSync(file, Buffer.from(bytes))
    for (const encoding of ['utf8', 'utf-8', 'UTF8', 'UTF-8']) {
      const expected = fs.readFileSync(file, 'utf8')
      t.is(readFileSync(file, encoding), expected)
      t.is(await readFile(file, { encoding }), expected)
    }
  }
})
