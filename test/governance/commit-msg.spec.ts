import test from 'ava'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const script = path.resolve('scripts/validate-commit-msg.mjs')

function run(message: string, stagedFiles = ''): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-fs-commit-msg-'))
  const file = path.join(dir, 'COMMIT_EDITMSG')
  fs.writeFileSync(file, `${message}\n`)
  try {
    execFileSync('node', [script, file], {
      env: { ...process.env, COMMIT_VALIDATION_STAGED_FILES: stagedFiles },
      stdio: 'pipe',
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('commit validation accepts English subjects with optional emoji', (t) => {
  t.notThrows(() => run('feat(glob): add promise conformance matrix', 'src/glob.rs'))
  t.notThrows(() => run('✨ feat(glob): add promise conformance matrix', 'src/glob.rs'))
  t.notThrows(() => run('feat(scan): add fused traversal metadata', 'src/scan.rs'))
  t.notThrows(() => run('docs: clarify promise-first compatibility'))
})

test('commit validation requires API scope for API files', (t) => {
  t.throws(() => run('feat: add promise conformance matrix', 'src/glob.rs'))
  t.notThrows(() => run('feat(glob): add promise conformance matrix', 'src/glob.rs'))
})

test('commit validation rejects mismatched API scope', (t) => {
  t.throws(() => run('feat(readdir): add promise conformance matrix', 'src/glob.rs'))
})

test('commit validation rejects vague or non-English subjects', (t) => {
  t.throws(() => run('chore: update'))
  t.throws(() => run('feat(glob): 添加 glob 测试', 'src/glob.rs'))
})
