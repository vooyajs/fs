import test from 'ava'
import { rmSync, rm } from '../index.js'
import { mkdirSync, writeFileSync, existsSync, rmSync as nodeRmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Helper function to create a temporary directory
function createTempDir(): string {
  const tempDir = join(tmpdir(), `vooya-fs-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
  mkdirSync(tempDir, { recursive: true })
  return tempDir
}

test('sync: should remove a file', (t) => {
  const tempDir = createTempDir()
  const testFile = join(tempDir, 'test.txt')
  writeFileSync(testFile, 'test content')

  t.true(existsSync(testFile), 'File should exist before removal')
  rmSync(testFile)
  t.false(existsSync(testFile), 'File should not exist after removal')
})

test('async: should remove a file', async (t) => {
  const tempDir = createTempDir()
  const testFile = join(tempDir, 'test.txt')
  writeFileSync(testFile, 'test content')

  t.true(existsSync(testFile), 'File should exist before removal')
  await rm(testFile)
  t.false(existsSync(testFile), 'File should not exist after removal')
})

test('sync: should remove an empty directory', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'empty-dir')
  mkdirSync(testDir)

  t.true(existsSync(testDir), 'Directory should exist before removal')
  rmSync(testDir)
  t.false(existsSync(testDir), 'Directory should not exist after removal')
})

test('async: should remove an empty directory', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'empty-dir')
  mkdirSync(testDir)

  t.true(existsSync(testDir), 'Directory should exist before removal')
  await rm(testDir)
  t.false(existsSync(testDir), 'Directory should not exist after removal')
})

test('sync: should remove a directory recursively when recursive=true', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'nested-dir')
  const nestedDir = join(testDir, 'nested')
  const testFile = join(nestedDir, 'file.txt')

  mkdirSync(nestedDir, { recursive: true })
  writeFileSync(testFile, 'content')

  t.true(existsSync(testDir), 'Directory should exist before removal')
  t.true(existsSync(testFile), 'Nested file should exist before removal')

  rmSync(testDir, { recursive: true })

  t.false(existsSync(testDir), 'Directory should not exist after removal')
  t.false(existsSync(testFile), 'Nested file should not exist after removal')
})

test('async: should remove a directory recursively when recursive=true', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'nested-dir')
  const nestedDir = join(testDir, 'nested')
  const testFile = join(nestedDir, 'file.txt')

  mkdirSync(nestedDir, { recursive: true })
  writeFileSync(testFile, 'content')

  t.true(existsSync(testDir), 'Directory should exist before removal')
  t.true(existsSync(testFile), 'Nested file should exist before removal')

  await rm(testDir, { recursive: true })

  t.false(existsSync(testDir), 'Directory should not exist after removal')
  t.false(existsSync(testFile), 'Nested file should not exist after removal')
})

test('sync: should throw error when removing non-empty directory without recursive', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'non-empty-dir')
  const testFile = join(testDir, 'file.txt')

  mkdirSync(testDir)
  writeFileSync(testFile, 'content')

  t.true(existsSync(testDir), 'Directory should exist')
  t.throws(() => rmSync(testDir), { message: /ENOTEMPTY|EEXIST/ })
})

test('async: should throw error when removing non-empty directory without recursive', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'non-empty-dir')
  const testFile = join(testDir, 'file.txt')

  mkdirSync(testDir)
  writeFileSync(testFile, 'content')

  t.true(existsSync(testDir), 'Directory should exist')
  await t.throwsAsync(async () => await rm(testDir), { message: /ENOTEMPTY|EEXIST/ })
})

test('sync: should throw error when file does not exist and force=false', (t) => {
  const tempDir = createTempDir()
  const nonExistentFile = join(tempDir, 'non-existent.txt')

  t.false(existsSync(nonExistentFile), 'File should not exist')
  t.throws(() => rmSync(nonExistentFile), { message: /ENOENT/ })
})

test('async: should throw error when file does not exist and force=false', async (t) => {
  const tempDir = createTempDir()
  const nonExistentFile = join(tempDir, 'non-existent.txt')

  t.false(existsSync(nonExistentFile), 'File should not exist')
  await t.throwsAsync(async () => await rm(nonExistentFile), { message: /ENOENT/ })
})

test('sync: should not throw error when file does not exist and force=true', (t) => {
  const tempDir = createTempDir()
  const nonExistentFile = join(tempDir, 'non-existent.txt')

  t.false(existsSync(nonExistentFile), 'File should not exist')
  // Should not throw
  t.notThrows(() => rmSync(nonExistentFile, { force: true }))
})

test('async: should not throw error when file does not exist and force=true', async (t) => {
  const tempDir = createTempDir()
  const nonExistentFile = join(tempDir, 'non-existent.txt')

  t.false(existsSync(nonExistentFile), 'File should not exist')
  // Should not throw
  await t.notThrowsAsync(async () => await rm(nonExistentFile, { force: true }))
})

test('sync: should remove file when force=true (even if file exists)', (t) => {
  const tempDir = createTempDir()
  const testFile = join(tempDir, 'test.txt')
  writeFileSync(testFile, 'content')

  t.true(existsSync(testFile), 'File should exist before removal')
  rmSync(testFile, { force: true })
  t.false(existsSync(testFile), 'File should not exist after removal')
})

test('async: should remove file when force=true (even if file exists)', async (t) => {
  const tempDir = createTempDir()
  const testFile = join(tempDir, 'test.txt')
  writeFileSync(testFile, 'content')

  t.true(existsSync(testFile), 'File should exist before removal')
  await rm(testFile, { force: true })
  t.false(existsSync(testFile), 'File should not exist after removal')
})

test('sync: should work with recursive=false explicitly', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'empty-dir')
  mkdirSync(testDir)

  t.true(existsSync(testDir), 'Directory should exist before removal')
  rmSync(testDir, { recursive: false })
  t.false(existsSync(testDir), 'Directory should not exist after removal')
})

test('async: should work with recursive=false explicitly', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'empty-dir')
  mkdirSync(testDir)

  t.true(existsSync(testDir), 'Directory should exist before removal')
  await rm(testDir, { recursive: false })
  t.false(existsSync(testDir), 'Directory should not exist after removal')
})

test('sync: should remove deep nested directory with concurrency', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'nested-dir-concurrency')
  // Create a structure: nested-dir/subdir1/file, nested-dir/subdir2/file, ...
  mkdirSync(testDir)
  for (let i = 0; i < 10; i++) {
    const subDir = join(testDir, `sub-${i}`)
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'file.txt'), 'content')
  }

  t.true(existsSync(testDir))
  rmSync(testDir, { recursive: true, concurrency: 4 })
  t.false(existsSync(testDir))
})

test('async: should remove deep nested directory with concurrency', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'nested-dir-async-concurrency')
  mkdirSync(testDir)
  for (let i = 0; i < 10; i++) {
    const subDir = join(testDir, `sub-${i}`)
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'file.txt'), 'content')
  }

  t.true(existsSync(testDir))
  await rm(testDir, { recursive: true, concurrency: 4 })
  t.false(existsSync(testDir))
})

// ===== dual-run comparison =====

test('dual-run: rmSync file should behave same as node:fs', (t) => {
  const dir = createTempDir()
  const nodeFile = join(dir, 'node.txt')
  const hyperFile = join(dir, 'hyper.txt')
  writeFileSync(nodeFile, 'a')
  writeFileSync(hyperFile, 'a')

  t.is(existsSync(hyperFile), existsSync(nodeFile))

  nodeRmSync(nodeFile)
  rmSync(hyperFile)

  t.is(existsSync(hyperFile), existsSync(nodeFile))
})

test('dual-run: rmSync recursive should behave same as node:fs', (t) => {
  const dir1 = createTempDir()
  const dir2 = createTempDir()
  const nodeDir = join(dir1, 'sub')
  const hyperDir = join(dir2, 'sub')

  mkdirSync(nodeDir, { recursive: true })
  mkdirSync(hyperDir, { recursive: true })
  writeFileSync(join(nodeDir, 'f.txt'), 'x')
  writeFileSync(join(hyperDir, 'f.txt'), 'x')

  nodeRmSync(nodeDir, { recursive: true, force: true })
  rmSync(hyperDir, { recursive: true, force: true })

  t.is(existsSync(hyperDir), existsSync(nodeDir))
})

// ===== maxRetries / retryDelay =====

test('sync: maxRetries should eventually succeed on transient failure', (t) => {
  const tempDir = createTempDir()
  const testFile = join(tempDir, 'retry.txt')
  writeFileSync(testFile, 'retry test')

  rmSync(testFile, { maxRetries: 3, retryDelay: 10 })
  t.false(existsSync(testFile))
})

test('sync: maxRetries with recursive should work', (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'retry-dir')
  mkdirSync(testDir, { recursive: true })
  writeFileSync(join(testDir, 'f.txt'), 'data')

  rmSync(testDir, { recursive: true, maxRetries: 2, retryDelay: 50 })
  t.false(existsSync(testDir))
})

test('async: maxRetries with recursive should work', async (t) => {
  const tempDir = createTempDir()
  const testDir = join(tempDir, 'retry-async')
  mkdirSync(testDir, { recursive: true })
  writeFileSync(join(testDir, 'f.txt'), 'data')

  await rm(testDir, { recursive: true, maxRetries: 2, retryDelay: 50 })
  t.false(existsSync(testDir))
})
