import test from 'ava'
import * as fs from 'node:fs'
import * as promises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdir, readdirSync, readFile, readFileSync } from '../../../index.js'

function fixture(t: { teardown(fn: () => void): void }) {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-readdir-options-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('readdir: encoding shorthand, buffers and encoded Dirents match Node', async (t) => {
  const root = fixture(t)
  fs.writeFileSync(join(root, 'é.txt'), '')
  for (const encoding of ['utf8', 'hex', 'base64', 'latin1', 'buffer'] as const) {
    const expected = encoding === 'buffer' ? fs.readdirSync(root, 'buffer') : fs.readdirSync(root, encoding)
    t.deepEqual(readdirSync(root, encoding), expected)
    t.deepEqual(await readdir(root, { encoding }), expected)
    const nodeDirents =
      encoding === 'buffer'
        ? fs.readdirSync(root, { encoding: 'buffer', withFileTypes: true })
        : fs.readdirSync(root, { encoding, withFileTypes: true })
    const actual = (await readdir(root, { encoding, withFileTypes: true })) as Array<{
      name: unknown
      parentPath: string
      isFile(): boolean
    }>
    t.deepEqual(
      actual.map((v) => [v.name, v.parentPath, v.isFile()]),
      nodeDirents.map((v) => [v.name, v.parentPath, v.isFile()]),
    )
  }
})

test('readdir: empty path rejects instead of reading the current directory', async (t) => {
  const expected = t.throws(() => fs.readdirSync('')) as NodeJS.ErrnoException
  for (const error of [
    t.throws(() => readdirSync('')),
    await t.throwsAsync(() => readdir('')),
  ] as NodeJS.ErrnoException[]) {
    t.is(error.code, expected.code)
    t.is(error.path, '')
    t.is(error.syscall, expected.syscall)
  }
})

test('readdir: recursive file root rejects instead of returning an empty list', async (t) => {
  const root = fixture(t)
  const file = join(root, 'file')
  fs.writeFileSync(file, '')
  t.throws(() => readdirSync(file, { recursive: true }), { code: 'ENOTDIR' })
  await t.throwsAsync(() => readdir(file, { recursive: true }), { code: 'ENOTDIR' })
})

test('readFile lines: leading blank lines, CRLF and malformed UTF-8 retain selected content', async (t) => {
  const root = fixture(t)
  const file = join(root, 'file')
  for (const data of [Buffer.from('\n\nthird\r\nfourth\n'), Buffer.from([10, 255, 10, 97, 10])]) {
    await promises.writeFile(file, data)
    for (const [from, to] of [
      [1, 2],
      [2, 3],
      [1, 4],
    ]) {
      const expected = data
        .toString('utf8')
        .split(/\r?\n/)
        .slice(from - 1, Math.min(to, data.toString('utf8').split(/\r?\n/).length - 1))
        .join('\n')
      t.is(readFileSync(file, { encoding: 'utf8', lines: { from, to } }), expected)
      t.is(await readFile(file, { encoding: 'UTF8', lines: { from, to } }), expected)
    }
  }
})
