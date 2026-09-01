#!/usr/bin/env node

import * as fs from 'node:fs'
import { execSync } from 'node:child_process'

const messagePath = process.argv[2]
if (!messagePath) {
  console.error('Usage: validate-commit-msg.mjs <commit-msg-file>')
  process.exit(1)
}

const rawMessage = fs.readFileSync(messagePath, 'utf8')
const subject = rawMessage.split(/\r?\n/, 1)[0].trim()

const allowedTypes = new Set(['feat', 'fix', 'test', 'perf', 'docs', 'refactor', 'build', 'ci', 'chore', 'release'])
const apiScopes = new Set([
  'access',
  'appendFile',
  'chmod',
  'chown',
  'copyFile',
  'cp',
  'exists',
  'glob',
  'link',
  'lstat',
  'mkdir',
  'mkdtemp',
  'readFile',
  'readdir',
  'readlink',
  'realpath',
  'rename',
  'rm',
  'rmdir',
  'scan',
  'stat',
  'symlink',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
])

const apiFileToScope = new Map([
  ['access', 'access'],
  ['chmod', 'chmod'],
  ['chown', 'chown'],
  ['copy_file', 'copyFile'],
  ['cp', 'cp'],
  ['exists', 'exists'],
  ['glob', 'glob'],
  ['link', 'link'],
  ['mkdir', 'mkdir'],
  ['mkdtemp', 'mkdtemp'],
  ['read_file', 'readFile'],
  ['readdir', 'readdir'],
  ['readlink', 'readlink'],
  ['realpath', 'realpath'],
  ['rename', 'rename'],
  ['rm', 'rm'],
  ['rmdir', 'rmdir'],
  ['scan', 'scan'],
  ['stat', 'stat'],
  ['symlink', 'symlink'],
  ['truncate', 'truncate'],
  ['unlink', 'unlink'],
  ['utimes', 'utimes'],
  ['write_file', 'writeFile'],
])

function stagedFiles() {
  if (process.env.COMMIT_VALIDATION_STAGED_FILES) {
    return process.env.COMMIT_VALIDATION_STAGED_FILES.split('\n').filter(Boolean)
  }
  return execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (/^(Merge|Revert)\b/.test(subject)) {
  process.exit(0)
}

if (/[\u3400-\u9fff]/u.test(subject)) {
  fail('Commit subject must be written in English.')
}

const match = subject.match(/^(?:\p{Extended_Pictographic}\ufe0f?\s+)?([a-z]+)(?:\(([A-Za-z0-9-]+)\))?: (.+)$/u)
if (!match) {
  fail('Commit subject must match: [emoji] type(scope): concise English summary')
}

const [, type, scope, summary] = match
if (!allowedTypes.has(type)) {
  fail(`Invalid commit type: ${type}`)
}

if (scope && !/^[A-Za-z][A-Za-z0-9-]*$/.test(scope)) {
  fail(`Invalid commit scope: ${scope}`)
}

if (summary.length < 10 || summary.length > 90) {
  fail('Commit summary must be between 10 and 90 characters.')
}

if (/[。！？]|\.$/.test(summary)) {
  fail('Commit summary should be concise and must not end with punctuation.')
}

if (/^(update|change|changes|misc|wip|fix stuff|work in progress)$/i.test(summary.trim())) {
  fail('Commit summary is too vague; describe the capability or behavior changed.')
}

const touchedApiScopes = new Set()
for (const file of stagedFiles()) {
  const srcMatch = file.match(/^src\/([a-z_]+)\.rs$/)
  if (srcMatch && apiFileToScope.has(srcMatch[1])) {
    touchedApiScopes.add(apiFileToScope.get(srcMatch[1]))
  }

  const testMatch = file.match(/^test\/(?:conformance|performance)\/([^/]+)\//)
  if (testMatch && apiScopes.has(testMatch[1])) {
    touchedApiScopes.add(testMatch[1])
  }

  const legacyTestMatch = file.match(/^__test__\/([a-z_]+)\.spec\.ts$/)
  if (legacyTestMatch && apiFileToScope.has(legacyTestMatch[1])) {
    touchedApiScopes.add(apiFileToScope.get(legacyTestMatch[1]))
  }
}

if (touchedApiScopes.size > 0 && !scope) {
  fail(`API changes require a scope. Use one of: ${[...touchedApiScopes].sort().join(', ')}`)
}

if (scope && apiScopes.has(scope) && touchedApiScopes.size > 0 && !touchedApiScopes.has(scope)) {
  fail(`Commit scope "${scope}" does not match staged API files: ${[...touchedApiScopes].sort().join(', ')}`)
}
