'use strict'

// Public policy layer. Native batches remain the default for the measured surface;
// Node handles options that require JS callbacks, cancellation or richer input types.
const native = require('./index.js')
const fs = require('node:fs')
const promises = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const { isUtf8 } = require('node:buffer')
const { getSystemErrorMap } = require('node:util')

let systemErrors
function nativeError(error) {
  if (error && typeof error.code === 'string') {
    systemErrors ??= new Map([...getSystemErrorMap()].map(([errno, [code]]) => [code, errno]))
    if (systemErrors.has(error.code)) error.errno = systemErrors.get(error.code)
    if (error.code === 'ERR_FS_CP_EEXIST') error.errno = require('node:os').constants.errno.EEXIST
    if (error.code === 'ERR_FS_EISDIR') error.errno = require('node:os').constants.errno.EISDIR
    const copyErrno = {
      ERR_FS_CP_EINVAL: 'EINVAL',
      ERR_FS_CP_DIR_TO_NON_DIR: 'EISDIR',
      ERR_FS_CP_NON_DIR_TO_DIR: 'ENOTDIR',
      ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY: 'EINVAL',
      ERR_FS_CP_FIFO_PIPE: 'EINVAL',
      ERR_FS_CP_SOCKET: 'EINVAL',
    }[error.code]
    if (copyErrno) error.errno = require('node:os').constants.errno[copyErrno]
  }
  return error
}
function syncCall(name, args) {
  try {
    return native[name](...args)
  } catch (error) {
    throw nativeError(error)
  }
}
async function asyncCall(name, args) {
  try {
    return await native[name](...args)
  } catch (error) {
    throw nativeError(error)
  }
}
function nativePath(path) {
  if (path instanceof URL) return fileURLToPath(path)
  if (Buffer.isBuffer(path)) return isUtf8(path) && !path.includes(0) ? path.toString() : undefined
  return typeof path === 'string' && !path.includes('\0') ? path : undefined
}
function optionsObject(options) {
  return options == null ? {} : typeof options === 'string' ? { encoding: options } : options
}
function validOptions(options, keys) {
  return (
    options &&
    typeof options === 'object' &&
    !Array.isArray(options) &&
    (Object.getPrototypeOf(options) === Object.prototype || Object.getPrototypeOf(options) === null) &&
    Object.getOwnPropertyNames(options).every((key) => keys.includes(key))
  )
}
function concurrency(options) {
  const count = options?.concurrency
  if (count !== undefined && (!Number.isInteger(count) || count < 0 || count > 1024)) {
    const error = new RangeError('concurrency must be an integer between 0 and 1024')
    error.code = 'ERR_OUT_OF_RANGE'
    throw error
  }
}
function booleans(options, keys) {
  return keys.every((key) => options[key] === undefined || typeof options[key] === 'boolean')
}
const encodings = new Set(['utf8', 'utf-8', 'ascii', 'latin1', 'binary', 'base64', 'base64url', 'hex'])
function encodingSupported(encoding, buffer = false) {
  return (
    encoding == null ||
    (typeof encoding === 'string' && (encodings.has(encoding.toLowerCase()) || (buffer && encoding === 'buffer')))
  )
}
// Node treats null encoding as the default; napi-rs optional strings accept undefined.
function nativeEncodingOptions(options) {
  return options.encoding === null ? Object.create(options, { encoding: { value: undefined } }) : options
}
function directoryRoute(path, options) {
  const p = nativePath(path)
  const opts = optionsObject(options)
  concurrency(opts)
  const supported =
    validOptions(opts, ['encoding', 'recursive', 'withFileTypes', 'skipHidden', 'concurrency']) &&
    booleans(opts, ['recursive', 'withFileTypes', 'skipHidden']) &&
    encodingSupported(opts.encoding, true)
  // Node's recursive Buffer result currently has runtime-specific behavior.
  return p !== undefined && supported && !(opts.recursive && opts.encoding === 'buffer')
    ? [p, nativeEncodingOptions(opts)]
    : undefined
}
function copyRoute(src, dest, options) {
  const a = nativePath(src),
    b = nativePath(dest)
  const opts = options ?? {}
  concurrency(opts)
  const supported =
    options !== null &&
    validOptions(opts, [
      'recursive',
      'force',
      'errorOnExist',
      'preserveTimestamps',
      'dereference',
      'verbatimSymlinks',
      'concurrency',
    ]) &&
    booleans(opts, ['recursive', 'force', 'errorOnExist', 'preserveTimestamps', 'dereference', 'verbatimSymlinks'])
  // Dereference cycles, callbacks and copy modes use Node's full implementation.
  return a !== undefined && b !== undefined && supported && !opts.dereference && process.platform !== 'win32'
    ? [a, b, opts]
    : undefined
}
function removeRoute(path, options) {
  const p = nativePath(path),
    opts = options ?? {}
  concurrency(opts)
  const supported =
    options !== null &&
    validOptions(opts, ['recursive', 'force', 'maxRetries', 'retryDelay', 'concurrency']) &&
    booleans(opts, ['recursive', 'force']) &&
    ['maxRetries', 'retryDelay'].every(
      (key) => opts[key] === undefined || (Number.isInteger(opts[key]) && opts[key] >= 0 && opts[key] <= 0xffffffff),
    )
  return p !== undefined && supported && opts.recursive && process.platform !== 'win32' ? [p, opts] : undefined
}
function readRoute(path, options) {
  const p = nativePath(path),
    opts = optionsObject(options)
  const supported =
    validOptions(opts, ['encoding', 'flag', 'lines']) &&
    encodingSupported(opts.encoding) &&
    (opts.flag === undefined || opts.flag === 'r')
  if (opts?.lines !== undefined && (!supported || p === undefined)) {
    const error = new TypeError(
      'lines requires a string/UTF-8 Buffer/file URL path, a supported encoding, and flag r; signal and file handles are not supported with lines',
    )
    error.code = 'ERR_INVALID_ARG_VALUE'
    throw error
  }
  return p !== undefined && supported ? [p, nativeEncodingOptions(opts)] : undefined
}
function nativePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.endsWith('/')) return false
  if (!pattern.includes('*') && !pattern.includes('{')) return false
  // Globset's ?/classes are byte-based; Node matches Unicode characters.
  // Non-globstar directory wildcards also have different symlink traversal rules.
  if (/[?[\]!()+]|\\/.test(pattern) || pattern.startsWith('/') || /\{[^}]*[.{]/.test(pattern)) return false
  if (/\{[^},]*\}|\{,|,,|,\}/.test(pattern)) return false
  const components = pattern.split('/')
  if (components.some((part) => part.startsWith('.'))) return false
  if (components.slice(0, -1).some((part) => part !== '**' && /[*{}]/.test(part))) return false
  let braces = 0
  for (const character of pattern) {
    if (character === '{') braces++
    if (character === '}' && --braces < 0) return false
  }
  return braces === 0
}
function globRoute(pattern, options) {
  const opts = options ?? {}
  concurrency(opts)
  const patterns = typeof pattern === 'string' ? [pattern] : pattern
  const cwd = opts.cwd === undefined ? undefined : nativePath(opts.cwd)
  const supported =
    options !== null &&
    Array.isArray(patterns) &&
    patterns.every(nativePattern) &&
    validOptions(opts, ['cwd', 'withFileTypes', 'exclude', 'concurrency', 'gitIgnore']) &&
    booleans(opts, ['withFileTypes', 'gitIgnore']) &&
    (opts.exclude === undefined ||
      (Array.isArray(opts.exclude) &&
        opts.exclude.every(
          (pattern) =>
            typeof pattern === 'string' &&
            !/[?[\]!()+{}]|\\/.test(pattern) &&
            !pattern.endsWith('/') &&
            (opts.gitIgnore ||
              (!pattern.includes('*') &&
                !pattern.includes(':') &&
                pattern.split('/').every((part) => part !== '' && part !== '.' && part !== '..'))),
        ))) &&
    (opts.cwd === undefined || cwd !== undefined)
  if (!supported && opts.gitIgnore) {
    const error = new TypeError('gitIgnore requires native-supported glob patterns and string-array excludes')
    error.code = 'ERR_INVALID_ARG_VALUE'
    throw error
  }
  // Adjacent globstars are one globstar in Node's matcher, including root inclusion.
  const normalized = supported
    ? patterns.map((value) =>
        value
          .split('/')
          .filter((part, i, parts) => part !== '**' || parts[i - 1] !== '**')
          .join('/'),
      )
    : undefined
  return supported
    ? [typeof pattern === 'string' ? normalized[0] : normalized, { ...opts, cwd }, !opts.gitIgnore]
    : undefined
}

// Explicit assignments preserve CommonJS named exports for ESM consumers.
module.exports.Dirent = native.Dirent
module.exports.Stats = native.Stats
module.exports.access = native.access
module.exports.accessSync = native.accessSync
module.exports.appendFile = native.appendFile
module.exports.appendFileSync = native.appendFileSync
module.exports.chmod = native.chmod
module.exports.chmodSync = native.chmodSync
module.exports.chown = native.chown
module.exports.chownSync = native.chownSync
module.exports.copyFile = native.copyFile
module.exports.copyFileSync = native.copyFileSync
module.exports.cp = native.cp
module.exports.cpSync = native.cpSync
module.exports.exists = native.exists
module.exports.existsSync = native.existsSync
module.exports.glob = native.glob
module.exports.globSync = native.globSync
module.exports.link = native.link
module.exports.linkSync = native.linkSync
module.exports.lstat = native.lstat
module.exports.lstatSync = native.lstatSync
module.exports.mkdir = native.mkdir
module.exports.mkdirSync = native.mkdirSync
module.exports.mkdtemp = native.mkdtemp
module.exports.mkdtempSync = native.mkdtempSync
module.exports.readdir = native.readdir
module.exports.readdirSync = native.readdirSync
module.exports.readFile = native.readFile
module.exports.readFileSync = native.readFileSync
module.exports.readlink = native.readlink
module.exports.readlinkSync = native.readlinkSync
module.exports.realpath = native.realpath
module.exports.realpathSync = native.realpathSync
module.exports.rename = native.rename
module.exports.renameSync = native.renameSync
module.exports.rm = native.rm
module.exports.rmdir = native.rmdir
module.exports.rmdirSync = native.rmdirSync
module.exports.rmSync = native.rmSync
module.exports.scan = native.scan
module.exports.scanSync = native.scanSync
module.exports.stat = native.stat
module.exports.statSync = native.statSync
module.exports.symlink = native.symlink
module.exports.symlinkSync = native.symlinkSync
module.exports.truncate = native.truncate
module.exports.truncateSync = native.truncateSync
module.exports.unlink = native.unlink
module.exports.unlinkSync = native.unlinkSync
module.exports.utimes = native.utimes
module.exports.utimesSync = native.utimesSync
module.exports.writeFile = native.writeFile
module.exports.writeFileSync = native.writeFileSync
module.exports.constants = fs.constants
module.exports.readdirSync = function readdirSync(path, options) {
  const args = directoryRoute(path, options)
  return args ? syncCall('readdirSync', args) : fs.readdirSync(path, options)
}
module.exports.readdir = async function readdir(path, options) {
  const args = directoryRoute(path, options)
  return args ? asyncCall('readdir', args) : promises.readdir(path, options)
}
module.exports.cpSync = function cpSync(src, dest, options) {
  concurrency(options)
  // Node's synchronous copy already executes natively and differs from Promise cp
  // on symlink errors. Retain its runtime-specific semantics.
  return fs.cpSync(src, dest, options)
}
module.exports.cp = async function cp(src, dest, options) {
  const args = copyRoute(src, dest, options)
  return args ? asyncCall('cp', args) : promises.cp(src, dest, options)
}
module.exports.rmSync = function rmSync(path, options) {
  concurrency(options)
  // Node 24's synchronous native remover reports different permission errors.
  return fs.rmSync(path, options)
}
module.exports.rm = async function rm(path, options) {
  const args = removeRoute(path, options)
  return args ? asyncCall('rm', args) : promises.rm(path, options)
}
module.exports.readFileSync = function readFileSync(path, options) {
  const args = readRoute(path, options)
  return args ? syncCall('readFileSync', args) : fs.readFileSync(path, options)
}
module.exports.readFile = async function readFile(path, options) {
  const args = readRoute(path, options)
  return args ? asyncCall('readFile', args) : promises.readFile(path, options)
}
module.exports.globSync = function globSync(pattern, options) {
  const args = globRoute(pattern, options)
  if (args) {
    try {
      return syncCall('globSync', args)
    } catch (error) {
      if (error?.code !== 'ERR_VOOYA_GLOB_NODE_FALLBACK') throw error
    }
  }
  return fs.globSync(pattern, options)
}
module.exports.glob = function glob(pattern, options) {
  // Preserve the actual Promise batch API while accepting Node's for-await usage.
  const batch = (async () => {
    const args = globRoute(pattern, options)
    if (args) {
      try {
        return await asyncCall('glob', args)
      } catch (error) {
        if (error?.code !== 'ERR_VOOYA_GLOB_NODE_FALLBACK') throw error
      }
    }
    const entries = []
    for await (const entry of promises.glob(pattern, options)) entries.push(entry)
    return entries
  })()
  const iterator = (async function* () {
    yield* await batch
  })()
  batch.next = iterator.next.bind(iterator)
  batch.return = iterator.return.bind(iterator)
  batch.throw = iterator.throw.bind(iterator)
  batch[Symbol.asyncIterator] = function () {
    return this
  }
  return batch
}

module.exports.scanSync = function scanSync(root, options) {
  const path = nativePath(root)
  concurrency(options)
  if (path === undefined) throw new TypeError('scan requires a string, UTF-8 Buffer or file URL path')
  return syncCall('scanSync', [path, options])
}
module.exports.scan = async function scan(root, options) {
  const path = nativePath(root)
  concurrency(options)
  if (path === undefined) throw new TypeError('scan requires a string, UTF-8 Buffer or file URL path')
  return asyncCall('scan', [path, options])
}
