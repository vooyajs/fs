import test from 'ava'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { glob, globSync } from '../../../api.js'

const normalize = (values: string[]) => values.map((v) => v.replace(/\\/g, '/')).sort()
const dirents = (values: fs.Dirent[]) =>
  values
    .map((v) => [join(v.parentPath, v.name).replace(/\\/g, '/'), v.isFile(), v.isDirectory(), v.isSymbolicLink()])
    .sort()

const cases = [
  ['**/*.ts', '**/*.js', '**/*.md', '**/*.ts'],
  ['src/**/*.ts', 'src/**/*.js', 'src/**/*'],
  ['src/**/*.ts', '**/*.ts', 'other/**/*.js'],
  ['**', '**/*', '**/*.ts'],
  ['.hidden/**/*.ts', 'src/**/*.ts'],
]
for (const patterns of cases) {
  test(`public glob grouped traversal: ${JSON.stringify(patterns)}`, async (t) => {
    const root = fs.mkdtempSync(join(tmpdir(), 'vooya-glob-grouped-'))
    t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
    for (const name of [
      'src/a.ts',
      'src/a.js',
      'src/deep/b.ts',
      'src/deep/c.md',
      'other/a.js',
      '.hidden/a.ts',
      'src/.secret.ts',
      'root.md',
    ]) {
      const file = join(root, name)
      fs.mkdirSync(join(file, '..'), { recursive: true })
      fs.writeFileSync(file, '')
    }
    for (const exclude of [[], ['src/deep/*'], ['src/deep/**'], ['**/*.js']]) {
      const options = { cwd: root, exclude }
      const expected = normalize(fs.globSync(patterns, options))
      t.deepEqual(normalize(globSync(patterns, options)), expected)
      t.deepEqual(normalize(await glob(patterns, options)), expected)
      const individual = [...new Set(patterns.flatMap((pattern) => globSync(pattern, options)))]
      t.deepEqual(normalize(individual), expected)
      const typed = { ...options, withFileTypes: true } as const
      const expectedTypes = dirents(fs.globSync(patterns, typed))
      t.deepEqual(dirents(globSync(patterns, typed) as fs.Dirent[]), expectedTypes)
      t.deepEqual(dirents((await glob(patterns, typed)) as fs.Dirent[]), expectedTypes)
    }
  })
}

test('public glob shared traversal preserves gitIgnore and distinct symlink roots', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-glob-ignore-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(join(root, 'src'))
  for (const name of ['keep.ts', 'keep.js', 'skip.ts', 'skip.js']) fs.writeFileSync(join(root, 'src', name), '')
  fs.writeFileSync(join(root, '.gitignore'), 'skip.*\n')
  const patterns = ['src/**/*.ts', 'src/**/*.js']
  const options = { cwd: root, gitIgnore: true }
  const expected = normalize(patterns.flatMap((pattern) => globSync(pattern, options)))
  t.deepEqual(normalize(await glob(patterns, options)), expected)
  t.deepEqual(expected, ['src/keep.js', 'src/keep.ts'])
  if (process.platform !== 'win32') {
    fs.symlinkSync('src', join(root, 'alias'))
    const linked = [...patterns, 'alias/**/*.ts', 'alias/**/*.js']
    t.deepEqual(normalize(globSync(linked, { cwd: root })), normalize(fs.globSync(linked, { cwd: root })))
  }
})
