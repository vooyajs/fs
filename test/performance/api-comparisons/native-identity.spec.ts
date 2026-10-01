import test from 'ava'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Module } from 'node:module'
import { pathToFileURL } from 'node:url'
import { nativeBinaryIdentity } from '../../../scripts/benchmark-native-identity.mjs'

test('benchmark identity follows the loader override with multiple native binaries loaded', (t) => {
  const original = nativeBinaryIdentity()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-binary-identity-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))
  const override = path.join(root, 'custom-override.node')
  fs.copyFileSync(original.file, override)
  // The default binary enters the module cache first. The generated loader must
  // then select a different, explicitly overridden binary, not the first entry.
  const script = `
    import { createRequire } from 'node:module'
    import { nativeBinaryIdentity } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/benchmark-native-identity.mjs')).href)}
    const require = createRequire(import.meta.url)
    require(${JSON.stringify(original.file)})
    const identity = nativeBinaryIdentity()
    const loaded = Object.keys(require.cache).filter(file => file.endsWith('.node'))
    console.log(JSON.stringify({ identity, loaded }))
  `
  const result = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NAPI_RS_NATIVE_LIBRARY_PATH: override, NAPI_RS_FORCE_WASI: '' },
    }),
  )
  t.true(result.loaded.includes(original.file))
  t.true(result.loaded.includes(fs.realpathSync(override)))
  t.is(result.identity.file, fs.realpathSync(override))
  t.is(result.identity.sha256, createHash('sha256').update(fs.readFileSync(override)).digest('hex'))
})

test('benchmark identity rejects WASM or ambiguous bindings instead of guessing a file', (t) => {
  const binding = {}
  const entry = new Module('benchmark-fixture')
  entry.exports = binding
  t.throws(() => nativeBinaryIdentity(binding, { 'fallback.wasm': entry }), {
    message: /found 0.*WASM/,
  })
  t.throws(() => nativeBinaryIdentity(binding, { 'first.node': entry, 'second.node': entry }), { message: /found 2/ })
})
