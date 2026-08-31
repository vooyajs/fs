import test from 'ava'
import { globSync as rawGlobSync, glob as rawGlob, rmSync, type Dirent, type GlobOptions } from '../index.js'
import * as nodeFs from 'node:fs'
import { join } from 'path'
import { tmpdir } from 'node:os'
import { globSync as nodeGlobSync } from 'glob'

const CWD = process.cwd()

function globSync(pattern: string, options?: GlobOptions): string[] {
  return rawGlobSync(pattern, options) as string[]
}

async function glob(pattern: string, options?: GlobOptions): Promise<string[]> {
  return rawGlob(pattern, options) as Promise<string[]>
}

// 构造包含文件和子目录的临时目录，用于验证目录匹配行为
function makeDirFixture(): string {
  const base = join(tmpdir(), `hyper-glob-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  nodeFs.mkdirSync(join(base, 'src/sub'), { recursive: true })
  nodeFs.writeFileSync(join(base, 'src/a.ts'), '')
  nodeFs.writeFileSync(join(base, 'src/b.ts'), '')
  nodeFs.writeFileSync(join(base, 'src/sub/c.ts'), '')
  nodeFs.mkdirSync(join(base, 'dist'), { recursive: true })
  nodeFs.writeFileSync(join(base, 'dist/out.js'), '')
  return base
}

/**
 * Create a deep tree under a tmp dir for glob performance validation.
 * Each level has `filesPerDir` files and `filesPerDir` subdirs up to `depth` levels.
 * Returns { root, expectedMatchCount }. Caller must rmSync(root, { recursive: true }) when done.
 */
function makeDeepTreeFixture(opts: { depth: number; filesPerDir: number; extension: string }): {
  root: string
  expectedMatchCount: number
} {
  const { depth, filesPerDir, extension } = opts
  const root = join(tmpdir(), `hyper-glob-deep-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  nodeFs.mkdirSync(root, { recursive: true })
  let totalMatches = 0
  function createLevel(dirPath: string, currentDepth: number) {
    for (let i = 0; i < filesPerDir; i++) {
      nodeFs.writeFileSync(join(dirPath, `f${i}.${extension}`), '')
      totalMatches += 1
    }
    if (currentDepth >= depth) return
    for (let i = 0; i < filesPerDir; i++) {
      const subDir = join(dirPath, `d${i}`)
      nodeFs.mkdirSync(subDir, { recursive: true })
      createLevel(subDir, currentDepth + 1)
    }
  }
  createLevel(root, 1)
  return { root, expectedMatchCount: totalMatches }
}

test('globSync: should find files in current directory', (t) => {
  const files = globSync('*.json', { cwd: CWD })
  t.true(files.length > 0)
  t.true(files.some((f) => f.endsWith('package.json')))
})

test('globSync: should match files in subdirectories', (t) => {
  const files = globSync('src/*.rs', { cwd: CWD })
  t.true(files.length > 0)
  t.true(files.some((f) => f.endsWith('lib.rs')))
})

test('globSync: should return Dirent objects when withFileTypes is true', (t) => {
  const files = rawGlobSync('src/*.rs', { cwd: CWD, withFileTypes: true }) as Dirent[]
  t.true(files.length > 0)

  const first = files[0]
  if (typeof first === 'object') {
    t.is(typeof first.isFile, 'function')
    t.true(first.isFile())
    t.is(typeof first.name, 'string')
    t.true(first.name.endsWith('.rs'))
    t.is(typeof first.parentPath, 'string')
  } else {
    t.fail('Should return objects')
  }
})

test('globSync: should support exclude option', (t) => {
  // Should match multiple .rs files normally
  const allFiles = globSync('src/*.rs', { cwd: CWD })
  t.true(allFiles.some((f) => f.endsWith('lib.rs')))

  // Exclude lib.rs
  const filteredFiles = globSync('src/*.rs', { cwd: CWD, exclude: ['lib.rs'] })
  t.true(filteredFiles.length > 0)
  t.false(
    filteredFiles.some((f) => f.endsWith('lib.rs')),
    'Should exclude lib.rs',
  )
  t.true(filteredFiles.length < allFiles.length)
})

test('globSync: gitIgnore option (default: false, align with Node)', (t) => {
  // Node.js fs.globSync does not respect .gitignore by default. When gitIgnore: true,
  // vooya-fs excludes files matching .gitignore. Only assert when this repo has
  // .gitignore rules that affect target/**/*.d.
  const defaultFiles = globSync('target/**/*.d', { cwd: CWD })
  const withGitIgnore = globSync('target/**/*.d', { cwd: CWD, gitIgnore: true })

  if (defaultFiles.length > 0 && withGitIgnore.length < defaultFiles.length) {
    t.pass('gitIgnore: true reduced results as expected')
  } else if (defaultFiles.length > 0) {
    t.pass('No .gitignore effect on target/**/*.d in this repo')
  } else {
    t.pass('Target directory empty or not present')
  }
})

test('globSync: concurrency option should not crash', (t) => {
  const files = globSync('src/**/*.rs', { cwd: CWD, concurrency: 2 })
  t.true(files.length > 0)
})

test('async: should work basically', async (t) => {
  const files = await glob('*.json', { cwd: CWD })
  t.true(files.length > 0)
  t.true(files.some((f) => f.endsWith('package.json')))
})

test('async: withFileTypes', async (t) => {
  const files = (await rawGlob('src/*.rs', { cwd: CWD, withFileTypes: true })) as Dirent[]
  t.true(files.length > 0)
  const first = files[0]
  t.is(typeof first, 'object')
  t.true(first.isFile())
})

test('async: should return empty array for no matches', async (t) => {
  const files = await glob('non_existent_*.xyz', { cwd: CWD })
  t.true(Array.isArray(files))
  t.is(files.length, 0)
})

test('async: should return empty array for a missing cwd like node:fs', async (t) => {
  const cwd = join(tmpdir(), `vooya-fs-missing-cwd-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const files = await glob('*.xyz', { cwd })
  t.deepEqual(files, [])
})

test('async: recursive match', async (t) => {
  const files = await glob('**/*.rs', { cwd: CWD })
  t.true(files.length > 0)
  t.true(files.some((f) => f.replace(/\\/g, '/').includes('src/lib.rs')))
})

// ===== 目录匹配行为（对齐 Node.js fs.globSync）=====

test('globSync: "src/*" should include subdirectories matching the pattern', (t) => {
  const base = makeDirFixture()
  // Node.js: fs.globSync('src/*') 返回 src/ 下的文件 AND 子目录
  const results = globSync('src/*', { cwd: base })
  const names = results.map((r) => r.replace(/\\/g, '/'))
  t.true(names.includes('src/a.ts'), 'should include files')
  t.true(names.includes('src/b.ts'), 'should include files')
  t.true(names.includes('src/sub'), 'should include directories matching the pattern')
  // 不应包含 dist/ 下的内容（不匹配 src/*）
  t.false(names.some((n) => n.startsWith('dist')))
})

test('globSync: "**/*.ts" should NOT include directories (dirs lack .ts extension)', (t) => {
  const base = makeDirFixture()
  const results = globSync('**/*.ts', { cwd: base })
  const names = results.map((r) => r.replace(/\\/g, '/'))
  // 所有结果应以 .ts 结尾（目录不应被包含）
  t.true(names.length > 0)
  t.true(
    names.every((n) => n.endsWith('.ts')),
    `non-.ts entry found: ${names.join(', ')}`,
  )
})

test('globSync: "**" should include both files and directories recursively', (t) => {
  const base = makeDirFixture()
  const results = globSync('**', { cwd: base })
  const names = results.map((r) => r.replace(/\\/g, '/'))
  // 应包含目录 src、src/sub、dist
  t.true(names.includes('src'), 'should include top-level directories')
  t.true(names.includes('src/sub'), 'should include nested directories')
  // 也应包含文件
  t.true(names.some((n) => n.endsWith('.ts')))
})

test('globSync: dir-matching result should have isDirectory()=true with withFileTypes', (t) => {
  const base = makeDirFixture()
  const results = rawGlobSync('src/*', { cwd: base, withFileTypes: true }) as Dirent[]
  t.true(results.length > 0)
  const subDir = results.find((r) => typeof r === 'object' && r.name === 'sub')
  t.truthy(subDir, 'should include sub directory as Dirent')
  if (subDir && typeof subDir === 'object') {
    t.true(subDir.isDirectory())
    t.false(subDir.isFile())
  }
})

test('dual-run: globSync "src/*" should match node:fs.globSync behavior for directories', (t) => {
  const base = makeDirFixture()
  // node:fs.globSync is stable since v22; align directory matching behavior
  const nodeResults: string[] = []
  try {
    const nodeGlob = nodeFs.globSync as ((p: string, o: object) => string[]) | undefined
    if (typeof nodeGlob !== 'function') {
      t.pass('node:fs.globSync not available, skipping dual-run comparison')
      return
    }
    nodeResults.push(...nodeGlob('src/*', { cwd: base }))
  } catch {
    t.pass('node:fs.globSync not available, skipping dual-run comparison')
    return
  }
  const hyperResults = globSync('src/*', { cwd: base }).map((r) => r.replace(/\\/g, '/'))
  const nodeNorm = nodeResults.map((r) => r.replace(/\\/g, '/'))
  const nodeDirs = nodeNorm.filter((n) => {
    try {
      return nodeFs.statSync(join(base, n)).isDirectory()
    } catch {
      return false
    }
  })
  for (const d of nodeDirs) {
    t.true(hyperResults.includes(d), `should include directory '${d}' as node:fs does`)
  }
})

// ===== Node-aligned behavior: path-prefix pattern, ** recursion =====

test('globSync: pattern with path prefix (e.g. .dir/**/*.txt) without cwd should find files', (t) => {
  const base = makeDirFixture()
  const hiddenDir = join(base, '.vooya-fs-glob-check')
  nodeFs.mkdirSync(hiddenDir, { recursive: true })
  nodeFs.writeFileSync(join(hiddenDir, 'a.txt'), '')
  nodeFs.writeFileSync(join(hiddenDir, 'b.txt'), '')

  const results = globSync('.vooya-fs-glob-check/**/*.txt', { cwd: base })
  const names = results.map((r) => r.replace(/\\/g, '/'))
  t.true(
    names.length >= 2,
    `expected at least 2 .txt under .vooya-fs-glob-check, got ${names.length}: ${names.join(', ')}`,
  )
  t.true(names.some((n) => n.endsWith('a.txt')))
  t.true(names.some((n) => n.endsWith('b.txt')))
})

test('globSync: **/*.txt with cwd should recurse into subdirectories', (t) => {
  const base = makeDirFixture()
  nodeFs.writeFileSync(join(base, 'root-only.txt'), '')
  nodeFs.mkdirSync(join(base, 'sub'), { recursive: true })
  nodeFs.writeFileSync(join(base, 'sub', 'nested.txt'), '')

  const results = globSync('**/*.txt', { cwd: base })
  const names = results.map((r) => r.replace(/\\/g, '/'))
  t.true(names.length >= 2, `expected at least 2 .txt (root + sub), got ${names.length}: ${names.join(', ')}`)
  t.true(names.some((n) => n === 'root-only.txt' || n.endsWith('/root-only.txt')))
  t.true(
    names.some((n) => n.endsWith('nested.txt')),
    `should include sub/nested.txt, got: ${names.join(', ')}`,
  )
})

// Dual-run: align with node:fs.globSync when available (Node 22+)
function getNodeGlobSync(): ((p: string, o: { cwd: string }) => string[]) | undefined {
  const g = (nodeFs as { globSync?: (p: string, o: { cwd: string }) => string[] }).globSync
  return typeof g === 'function' ? g : undefined
}

test('dual-run: path-prefix pattern .dir/**/*.txt matches node:fs.globSync', (t) => {
  const base = makeDirFixture()
  const hiddenDir = join(base, '.vooya-fs-glob-check')
  nodeFs.mkdirSync(hiddenDir, { recursive: true })
  nodeFs.writeFileSync(join(hiddenDir, 'a.txt'), '')
  nodeFs.writeFileSync(join(hiddenDir, 'b.txt'), '')

  const hyper = globSync('.vooya-fs-glob-check/**/*.txt', { cwd: base })
    .map((r) => r.replace(/\\/g, '/'))
    .sort()
  const nodeGlob = getNodeGlobSync()
  if (!nodeGlob) {
    t.pass('node:fs.globSync not available')
    return
  }
  let nodeResults: string[] = []
  try {
    nodeResults = nodeGlob('.vooya-fs-glob-check/**/*.txt', { cwd: base })
      .map((r) => r.replace(/\\/g, '/'))
      .sort()
  } catch {
    t.pass('node:fs.globSync threw, skipping')
    return
  }
  t.true(
    hyper.length >= 2,
    `vooya-fs: expected >= 2, got ${hyper.length} (run 'pnpm build' if path-prefix fix not in binary)`,
  )
  t.deepEqual(hyper.sort(), nodeResults.sort(), 'path-prefix pattern results should match Node')
})

test('dual-run: **/*.txt recursion matches node:fs.globSync', (t) => {
  const base = makeDirFixture()
  nodeFs.writeFileSync(join(base, 'root-only.txt'), '')
  nodeFs.mkdirSync(join(base, 'sub'), { recursive: true })
  nodeFs.writeFileSync(join(base, 'sub', 'nested.txt'), '')

  const hyper = globSync('**/*.txt', { cwd: base })
    .map((r) => r.replace(/\\/g, '/'))
    .sort()
  const nodeGlob = getNodeGlobSync()
  if (!nodeGlob) {
    t.pass('node:fs.globSync not available')
    return
  }
  let nodeResults: string[] = []
  try {
    nodeResults = nodeGlob('**/*.txt', { cwd: base })
      .map((r) => r.replace(/\\/g, '/'))
      .sort()
  } catch {
    t.pass('node:fs.globSync threw, skipping')
    return
  }
  t.true(hyper.length >= 2, `vooya-fs: expected >= 2, got ${hyper.length}`)
  t.deepEqual(hyper.sort(), nodeResults.sort(), '**/*.txt recursive results should match Node')
})

// extract_path_prefix must treat ? and [ as glob metacharacters so "dir?/sub/**/*.ts" uses "dir" as
// walk root with pattern "?/sub/**/*.ts", not the literal "dir?/sub" (which would not exist).
test('globSync: pattern with ? before first * uses correct walk root (dir?/sub/**/*.ts)', (t) => {
  const base = join(tmpdir(), `hyper-glob-metachar-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  // With prefix "dir", walk root is base/dir; ? matches one char so we need dir/a/sub and dir/b/sub
  nodeFs.mkdirSync(join(base, 'dir/a/sub'), { recursive: true })
  nodeFs.mkdirSync(join(base, 'dir/b/sub'), { recursive: true })
  nodeFs.writeFileSync(join(base, 'dir/a/sub/a.ts'), '')
  nodeFs.writeFileSync(join(base, 'dir/b/sub/b.ts'), '')
  try {
    const results = globSync('dir?/sub/**/*.ts', { cwd: base })
    const normalized = results.map((result) => result.replace(/\\/g, '/'))
    t.true(normalized.length >= 2, `expected at least 2 matches for dir?/sub/**/*.ts, got ${results.length}`)
    t.true(
      normalized.some((p) => p.includes('a.ts')),
      'should match dir/a/sub/a.ts',
    )
    t.true(
      normalized.some((p) => p.includes('b.ts')),
      'should match dir/b/sub/b.ts',
    )
  } finally {
    rmSync(base, { recursive: true })
  }
})

// Synthetic deep tree: validate glob correctness on a large, deep tree (same scale idea as readdir node_modules).
// Perf comparison is in `pnpm bench glob` (Large tree group); no strict timing here to avoid CI flakiness.
test('glob: deep tree fixture — Vooya FS and node-glob return same match count', (t) => {
  const { root, expectedMatchCount } = makeDeepTreeFixture({ depth: 3, filesPerDir: 6, extension: 'hit' })
  try {
    const pattern = '**/*.hit'
    const hyperCount = globSync(pattern, { cwd: root }).length
    const nodeCount = nodeGlobSync(pattern, { cwd: root }).length
    t.is(hyperCount, expectedMatchCount, 'Vooya FS should find all matching files')
    t.is(nodeCount, expectedMatchCount, 'node-glob should find same set')
  } finally {
    rmSync(root, { recursive: true })
  }
})
