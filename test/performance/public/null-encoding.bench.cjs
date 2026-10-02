// Run from the repository root after pnpm build. Redirect stdout to retain samples.
// The baseline is the checked-in public entry; both use the same release binding.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Module = require('node:module')
const { performance } = require('node:perf_hooks')
const root = process.cwd()
const baseline = process.argv[2] || 'd3c0ad06087855d39dee229198bfddf3a7b63a14'
const before = new Module(path.join(root, 'api-before.cjs'), module)
before.filename = path.join(root, 'api-before.cjs')
before.paths = module.paths
before._compile(execFileSync('git', ['show', `${baseline}:api.js`], { encoding: 'utf8' }), before.filename)
const after = require(path.join(root, 'api.js'))
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vooya-null-encoding-'))
const samples = []
try {
  for (const [scale, count, bytes] of [
    ['tiny', 8, 128],
    ['batch', 2048, 1024 * 1024],
  ]) {
    const dir = path.join(fixture, scale)
    fs.mkdirSync(dir)
    for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, String(i)), '')
    const file = path.join(fixture, `${scale}.bin`)
    fs.writeFileSync(file, Buffer.alloc(bytes, 65))
    for (const api of ['readFileSync', 'readdirSync']) {
      const target = api === 'readFileSync' ? file : dir
      for (const [route, implementation, options] of [
        ['before-default', before.exports, {}],
        ['after-default', after, {}],
        ['node-default', fs, {}],
        ['after-null', after, { encoding: null }],
        ['node-null', fs, { encoding: null }],
      ]) {
        const invoke = () => implementation[api](target, options)
        for (let warmup = 0; warmup < 2; warmup++) invoke()
        const milliseconds = []
        for (let sample = 0; sample < 10; sample++) {
          const start = performance.now()
          const result = invoke()
          milliseconds.push(performance.now() - start)
          if (result.length !== (api === 'readFileSync' ? bytes : count)) throw Error('invalid result')
        }
        samples.push({ scale, count, bytes, api, route, milliseconds })
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0].model,
        baseline: execFileSync('git', ['rev-parse', baseline], { encoding: 'utf8' }).trim(),
        binding: 'local release build; shared by before and after',
        warmups: 2,
        sampleCount: 10,
        cache: 'warm OS cache; sequential local samples; exploratory, no speed claim',
        limitations: 'No memory or cross-platform claim. Baseline null encoding throws InvalidArg, so it is not timed.',
        samples,
      },
      null,
      2,
    ),
  )
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
