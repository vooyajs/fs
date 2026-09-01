#!/usr/bin/env node

import { execSync } from 'node:child_process'

const protectedBranches = new Set(['main', 'master'])
const branchPattern = /^(feat|fix|perf|docs|refactor|chore|build|ci|release)\/[a-z0-9]+(?:-[a-z0-9]+)*$/
const testBranchPattern = /^test-(feat|fix|perf|docs|refactor|chore|build|ci|release)\/[a-z0-9]+(?:-[a-z0-9]+)*$/

function currentBranch() {
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME
  return execSync('git branch --show-current', { encoding: 'utf8' }).trim()
}

const branch = currentBranch()
const valid = protectedBranches.has(branch) || branchPattern.test(branch) || testBranchPattern.test(branch)

if (!valid) {
  console.error(`Invalid branch name: ${branch}`)
  console.error(
    'Use feat/<slug>, fix/<slug>, perf/<slug>, docs/<slug>, refactor/<slug>, chore/<slug>, build/<slug>, ci/<slug>, release/<slug>.',
  )
  console.error(
    'Temporary test branches must be named test-<original-branch>, for example test-feat/node-fs-conformance.',
  )
  process.exit(1)
}
