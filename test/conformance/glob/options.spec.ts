import test from 'ava'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { glob, globSync } from '../../../index.js'

const patterns = [
  'src/a*.ts',
  'src/?eta.ts',
  'src/[ab]*.ts',
  'src/{alpha,beta}.ts',
  'src/*.ts',
  '**/*.ts',
  'src',
  'src/alpha.ts',
  '**',
  '**/*',
  './src/*.ts',
  ['src/*.ts', '**/*.ts'],
  [],
] as const
for (const input of patterns) {
  test(`glob matches Node: ${JSON.stringify(input)}`, async (t) => {
    const root = fs.mkdtempSync(join(tmpdir(), 'vooya-glob-options-'))
    t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
    fs.mkdirSync(join(root, 'src/sub'), { recursive: true })
    for (const name of ['src/alpha.ts', 'src/beta.ts', 'src/sub/child.ts', 'src/.hidden.ts', 'top.ts'])
      fs.writeFileSync(join(root, name), '')
    const pattern = typeof input === 'string' ? input : [...input]
    for (const exclude of [[], ['src/alpha.ts'], ['src/sub/**']]) {
      const options = { cwd: root, exclude }
      const expected = fs.globSync(pattern, options).sort()
      t.deepEqual((globSync(pattern, options) as string[]).sort(), expected)
      t.deepEqual(((await glob(pattern, options)) as string[]).sort(), expected)
    }
  })
}

test('glob: Dirent parentPath includes cwd', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-glob-dirent-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(join(root, 'src'))
  fs.writeFileSync(join(root, 'src/file.ts'), '')
  const options = { cwd: root, withFileTypes: true } as const
  const expected = fs.globSync('src/*.ts', options)
  const actual = (await glob('src/*.ts', options)) as Array<{ name: unknown; parentPath: string }>
  t.deepEqual(
    actual.map((v) => [v.name, v.parentPath]),
    expected.map((v) => [v.name, v.parentPath]),
  )
})
