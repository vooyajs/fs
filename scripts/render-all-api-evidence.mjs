import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
export function render(reports) {
  for (const report of reports) {
    if (!report.complete || report.smoke || report.samples < 10 || report.warmups < 2)
      throw new Error('Only completed full reports with >=10 samples / >=2 warmups can be published')
    if (new Set(report.cases.map((row) => row.api)).size !== 26) throw new Error('Expected all 26 operation families')
    for (const row of report.cases)
      for (const value of Object.values(row.implementations)) {
        if (
          value.samples.length !== report.samples ||
          value.samples.some((sample) => !Number.isFinite(sample.durationMs) || sample.durationMs <= 0)
        )
          throw new Error('Invalid raw sample count or duration')
      }
  }
  if (reports.length !== 2 || !reports[0].node.startsWith('v22.') || !reports[1].node.startsWith('v24.'))
    throw new Error('Expected one Node 22 report followed by one Node 24 report')
  for (const key of [
    'platform',
    'arch',
    'cpu',
    'logicalCpus',
    'sourceHashes',
    'nativeBinary',
    'packages',
    'samples',
    'warmups',
  ])
    if (JSON.stringify(reports[0][key]) !== JSON.stringify(reports[1][key]))
      throw new Error(`Mismatched report context: ${key}`)
  const signature = (row) => `${row.api}/${row.scale}/${row.variant}/${row.mode}`
  if (reports.some((r) => r.cases.length !== 136 || new Set(r.cases.map(signature)).size !== 136))
    throw new Error('Expected all 136 unique workload/mode cases per runtime')
  if (JSON.stringify(reports[0].cases.map(signature)) !== JSON.stringify(reports[1].cases.map(signature)))
    throw new Error('Mismatched workload matrix')
  const apis = [...new Set(reports.flatMap((r) => r.cases.map((c) => c.api)))].sort()
  const table = (head, rows) => [head, head.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')
  const format = (value) => (value === undefined ? '—' : value.toFixed(3))
  const output = [
    '# All API performance comparisons',
    '',
    'All **26 exported operation families** are measured through the public package, in synchronous and Promise forms. Each API has its own table below, including every measured loss. This is a baseline for choosing native work, not a claim that replacing every Node call with Rust is beneficial.',
    '',
    '## Reading the results',
    '',
    `Measured on **${reports[0].cpu}, ${reports[0].logicalCpus} logical CPUs, ${reports[0].platform}/${reports[0].arch}**, release build. Runtimes: ${reports.map((r) => r.node).join(', ')}. ${reports[0].warmups} warmups and ${reports[0].samples} samples per cell; tables show median **milliseconds for the entire workload**, lower is better. The reports include p90, raw wall/CPU samples, memory deltas and logical throughput. These are local warm-cache results; Windows/Linux performance has not been measured.`,
    '',
    '- `single` is one call; `batch-256` is 256 distinct paths (sync sequential, async bounded to eight in flight). This is caller batching, not a Vooya bulk-call extension.',
    '- Tree cases have 4 or 1,000 files of 4 KiB each, nested directories and one empty directory. File cases also cover an 8 MiB Buffer. UTF-8 cases contain non-ASCII text; stat/lstat separately exercise links.',
    '- fs-extra and graceful-fs are Node wrappers for ordinary calls. They are useful migration baselines, not independent Rust engines. rimraf and mkdirp have both their default and explicit manual implementations shown.',
    '- `Vooya c4` explicitly selects four internal traversal workers. `Node fallback` means the public Vooya API delegates to Node; sync cp/rm have no native acceleration, including their c4 column.',
    '- `copyFile / preserve` is a composed stat + copy + timestamp/mode restoration workload matching copy-file. `scan` peers compose crawl + lstat + complete metadata objects + sorting; Node has no identical scan method.',
    '- Every sample starts with freshly prepared equivalent state. Setup, GC, independent result/content/metadata validation and cleanup are excluded. Mutations are fully checked after timing. No fsync/flush is requested; copies may use filesystem cloning. Logical throughput is not physical disk bandwidth.',
    '- RSS/heap/external deltas are **not peaks**. Sub-millisecond single-call rankings are particularly noisy. Neither cold I/O, process startup, error races nor event-loop responsiveness is measured.',
    '',
    `Versions: ${Object.entries(reports[0].packages)
      .map(([name, version]) => `${name} ${version}`)
      .join('; ')}.`,
    '',
    '[Adapter contracts, peer sources and reproduction instructions](https://github.com/vooyajs/fs/blob/perf/all-api-comparisons/test/performance/api-comparisons/README.md). The earlier [real-repository glob/readdir comparison](/guide/competitor-evidence) provides additional tree shapes and multi-pattern workloads.',
    '',
    '## Batch overview',
    '',
    'One representative **async** row per API/runtime: batch-256 (Buffer or default variant), or tree-1000. The full tables below also show synchronous, tiny, large-file and other variants. The peer column is the fastest non-Vooya implementation in that row, including Node and its wrappers; close differences are not robust rankings.',
    '',
    table(
      ['API', 'Node runtime', 'Node ms', 'Best peer ms', 'Vooya ms', 'Node / Vooya'],
      apis.flatMap((api) =>
        reports.map((report) => {
          const row = report.cases.find(
            (r) =>
              r.api === api &&
              r.mode === 'async' &&
              ['batch-256', 'tree-1000'].includes(r.scale) &&
              ['default', 'buffer'].includes(r.variant),
          )
          const peers = Object.entries(row.implementations)
            .filter(([name]) => !name.startsWith('vooya'))
            .sort((a, b) => a[1].medianMs - b[1].medianMs)
          const native = row.implementations.vooya.medianMs,
            node = row.implementations.node.medianMs
          return [
            api,
            report.node,
            format(node),
            `${peers[0][0]} ${format(peers[0][1].medianMs)}`,
            format(native),
            `${(node / native).toFixed(2)}×`,
          ]
        }),
      ),
    ),
    '',
    '## Per-API tables',
    '',
  ]
  const notes = {
    access: 'F_OK on existing regular files. Permission failures are not timed.',
    appendFile:
      'Append one payload to an existing file containing an identical payload. Fresh state per sample; no flush.',
    chmod: 'Change regular-file permissions to 0640. This is a POSIX workload.',
    chown:
      'Set each file to the current uid/gid. This measures the allowed syscall path, not a privileged ownership change.',
    copyFile:
      'Default rows copy bytes/mode to a fresh destination. Preserve rows also restore timestamps/mode and request advisory cloning. copy-file only participates in the latter contract. Filesystem cloning can dominate large-file results; these numbers are not disk bandwidth.',
    cp: 'Recursive tree copy, new destination, timestamps not explicitly preserved. fs-extra uses copy; graceful-fs uses cp. Vooya sync is Node fallback; c4 does not change that route.',
    exists:
      'Existing and missing paths are separate. Node async is access mapped to a Boolean; fs-extra uses pathExists.',
    glob: 'Pattern `**/*`, relative strings for files and directories. No dotfiles or symlinks in this synthetic fixture. fs-extra/graceful-fs wrap Node glob.',
    link: 'Create a hard link and verify its inode and link count.',
    lstat: 'Separate regular-file and symbolic-link metadata cases. This suite also checks file/link classification.',
    mkdir:
      'Create missing a/b parents recursively. Compare directory effects; peer-specific return values are outside the shared contract.',
    mkdtemp: 'Create a unique directory for every prefix; verify each returned path exists.',
    readFile:
      'Whole-file materialization, Buffer or mixed non-ASCII UTF-8. No streaming or line-range extension measured.',
    readdir:
      'Recursive relative-string listing, including directories. fdir is an independent crawler; fs-extra/graceful-fs wrap Node.',
    readlink: 'Read a relative file-symlink target; no dereferencing.',
    realpath: 'Resolve existing absolute regular-file paths. No symlink chain in this workload.',
    rename: 'Move within the same temporary directory/filesystem; verify destination bytes and source disappearance.',
    rm: 'Remove a freshly populated tree. fs-extra remove and rimraf default use Node on this platform; explicit rimraf-manual is also shown. Vooya sync is Node fallback.',
    rmdir: 'Remove empty directories only; recursive deletion is in rm.',
    scan: 'Return sorted path/name/kind/size/mode/mtime/depth for files and directories. Node, fs-extra, graceful-fs, fdir and tinyglobby are explicitly composed pipelines with lstat; async metadata concurrency is eight. All construction/sorting is timed.',
    stat: 'Metadata for regular files and following symbolic links, measured separately.',
    symlink: 'Create relative file symlinks and verify their targets.',
    truncate: 'Shrink existing 4 KiB files to 1 KiB; verify retained bytes.',
    unlink: 'Remove existing regular files, one path per call.',
    utimes: 'Set fixed access and modification timestamps and verify both.',
    writeFile:
      'Write to fresh distinct paths, Buffer or mixed non-ASCII UTF-8. No flush or overwrite-race semantics measured.',
  }
  for (const api of apis) {
    const rows = reports.flatMap((report) =>
      report.cases.filter((r) => r.api === api).map((row) => ({ ...row, nodeVersion: report.node })),
    )
    const peers = [...new Set(rows.flatMap((r) => Object.keys(r.implementations)))].filter(
      (name) => !name.startsWith('vooya'),
    )
    const columns = [...peers, 'vooya', ...(rows.some((r) => r.implementations['vooya-c4']) ? ['vooya-c4'] : [])]
    output.push(
      `### ${api}`,
      '',
      notes[api],
      '',
      table(
        ['Runtime', 'Workload / variant', 'Mode', ...columns, 'Vooya route'],
        rows.map((row) => [
          row.nodeVersion,
          `${row.scale} / ${row.variant}`,
          row.mode,
          ...columns.map((name) => format(row.implementations[name]?.medianMs)),
          row.route === 'node-fallback' ? 'Node fallback' : 'native',
        ]),
      ),
      '',
    )
  }
  output.push(
    '## Raw evidence and reproduction',
    '',
    '- [Node 22 raw samples](/evidence/all-apis-node22.json)',
    '- [Node 24 raw samples](/evidence/all-apis-node24.json)',
    '',
    '```sh',
    'pnpm install --frozen-lockfile',
    'pnpm build',
    'pnpm test:competitor-contract',
    'pnpm perf:all-apis --output .perf/all-apis.json',
    '# Focus a follow-up:',
    'pnpm perf:all-apis --apis cp,rm,scan --output .perf/batches.json',
    '```',
    '',
    'No runtime default or implementation was changed for these measurements. Before promoting a fast path, repeat the relevant distributions in the target application and platform, with the required options and durability.',
    '',
  )
  return output.join('\n')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reports = ['22', '24'].map((v) =>
    JSON.parse(fs.readFileSync(`docs/public/evidence/all-apis-node${v}.json`, 'utf8')),
  )
  fs.writeFileSync('docs/content/guide/all-api-evidence.mdx', render(reports))
}
