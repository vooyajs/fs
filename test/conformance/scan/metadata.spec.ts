import test from 'ava'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan, scanSync } from '../../../api.js'

test('public scan includes Node directory and file sizes in serial and parallel batches', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-scan-size-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(join(root, 'empty'))
  fs.mkdirSync(join(root, 'nested/deep'), { recursive: true })
  fs.writeFileSync(join(root, 'nested/deep/data'), Buffer.alloc(37, 0xa5))
  fs.writeFileSync(join(root, 'zero'), '')
  const expected = ['empty', 'nested', 'nested/deep', 'nested/deep/data', 'zero']
  for (const concurrency of [1, 4]) {
    const options = { withDirectories: true, concurrency }
    for (const entries of [scanSync(root, options), await scan(root, options)]) {
      t.deepEqual(
        entries.map((entry) => entry.path),
        expected,
      )
      for (const entry of entries) {
        const metadata = fs.lstatSync(join(root, entry.path))
        t.is(entry.kind, metadata.isDirectory() ? 'directory' : 'file')
        t.is(entry.size, metadata.size, entry.path)
        if (process.platform === 'win32' && metadata.isDirectory()) t.is(entry.size, 0)
      }
    }
  }
})

test('public scan applies directory size semantics to followed links, not link records', async (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), 'vooya-scan-link-size-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(join(root, 'target'))
  fs.writeFileSync(join(root, 'target/data'), 'payload')
  // Junctions do not require Windows symlink privileges.
  fs.symlinkSync(join(root, 'target'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
  for (const followSymlinks of [false, true]) {
    for (const concurrency of [1, 4]) {
      const options = { withDirectories: true, followSymlinks, concurrency }
      for (const entries of [scanSync(root, options), await scan(root, options)]) {
        const alias = entries.find((entry) => entry.path === 'alias')!
        t.truthy(alias)
        t.is(alias.kind, followSymlinks ? 'directory' : 'symlink')
        t.is(
          entries.some((entry) => entry.path === 'alias/data'),
          followSymlinks,
        )
        if (followSymlinks) t.is(alias.size, fs.statSync(join(root, 'alias')).size)
        else if (process.platform !== 'win32') t.is(alias.size, fs.lstatSync(join(root, 'alias')).size)
      }
    }
  }
})
