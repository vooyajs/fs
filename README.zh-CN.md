<h1 align="center">Vooya FS</h1>

<p align="center">
  <strong>面向 Node.js 批量文件系统任务的 Rust 原生执行引擎。</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="https://github.com/vooyajs/fs">代码仓库</a> ·
  <a href="https://rush-fs-docs.vercel.app/guide/quick-start">快速上手与文档</a> ·
  <a href="https://vooyajs.com/">Vooya</a> ·
  <a href="https://vooyajs.github.io/vooya-lab/">Vooya Lab</a>
</p>

Vooya FS 是 **Rush-FS** 在 Vooya 项目下的延续。它在有意义的地方保持
Node 文件系统 API 的兼容形状，同时提供有边界的批处理能力：用一次
JavaScript → Rust 调用，替代成千上万次 JS 与文件系统之间的往返。

它不试图证明每一个 `node:fs` 调用都更快。`existsSync` 这类微小操作通常
应该继续使用 Node；Vooya FS 专注于大目录遍历、glob、递归复制/删除，以及
“遍历 + 过滤 + metadata”这类可以在原生侧合并完成的工作。

> [!IMPORTANT]
> 安装 `@vooya/fs@0.1.1` 即可使用这里说明的兼容性修复；从旧版升级时请查看 [0.1.0 → 0.1.1 差异](https://rush-fs-docs.vercel.app/guide/quick-start#published-release-and-source-differences)。

## 安装并运行

使用 Node.js 22 或更新版本。0.1.1 提供 macOS arm64/x64、Linux x64 glibc
和 Windows x64 预编译包；这些平台直接安装使用不需要 Rust。
请启用 optional dependencies，以便 npm 安装对应平台的原生包。

```sh
npm install @vooya/fs@0.1.1
```

在项目中将以下内容保存为 `scan.mjs`，然后运行 `node scan.mjs`：

```js
import { scan } from '@vooya/fs'

try {
  const entries = await scan('.', {
    include: ['**/*.{js,mjs,ts,rs}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    skipHidden: true,
  })
  console.table(entries.slice(0, 10))
  console.log(`${entries.length} matching entries`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
```

该示例适用于 npm 0.1.1。返回的路径相对于扫描目录；没有匹配文件时，
空数组是正常结果。CommonJS 可以用 `const { scan } = require('@vooya/fs')`
导入，并在 async 函数中调用。

[快速上手（英文）](https://rush-fs-docs.vercel.app/guide/quick-start) 说明两种安装方式。
使用新选项前请查看[0.1.0 → 0.1.1 差异](https://rush-fs-docs.vercel.app/guide/quick-start#published-release-and-source-differences)；
导入失败时请按[原生绑定排错步骤](https://rush-fs-docs.vercel.app/guide/troubleshooting#cannot-find-the-native-binding)检查。

## 产品方向与开发约束

通过 napi-rs 和稳定的 Node-API，让 Node.js 以尽量无侵入的方式接入 Rust 生态。
API 对齐降低接入成本，可重复验证的原生性能收益决定优化与推荐范围。
更好的原生算法、成熟 Rust 库、批处理、合并操作和有界并行都是实现手段。

功能变更必须同步交付测试和文档；影响性能的变更还必须提供相对 Node 的前后
实测证据，公开退化和适用边界。见[开发契约](./CONTRIBUTING-CN.md#开发契约必须遵守)
及[编码代理规范](./AGENTS.md)。

## 我们优化的是边界

```text
应用代码
  │
  ├── 微小、单次操作 ─────────────────────→ node:fs
  │
  └── 递归或批量操作
           │ 一次 N-API 调用
           ▼
       Rust 遍历引擎
           │ 并行遍历、过滤、metadata、I/O
           ▼
       一次性返回批量结果
```

这与 Vooya 在 Web 上采用的是同一种“边界优先”理念：保留宿主应用与现有
生态，只把经过测量、边界清晰的工作负载交给 Rust。Vooya FS 通过稳定的
Node-API 服务 Node；Vooya 组件通过 WebAssembly 服务浏览器。两者都不会
声称 Rust 或 WASM 会让普通宿主工作普遍变快。

## 示例：一次完成扫描

`scan` 把递归遍历、glob 过滤与 metadata 收集合并为一次原生任务。它是
Vooya FS 扩展，不属于 Node 兼容 API。

```ts
import { scan } from '@vooya/fs'

const sources = await scan('./packages', {
  include: ['**/*.{ts,tsx,rs}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  skipHidden: true,
  concurrency: 4,
})

for (const source of sources) {
  console.log(source.path, source.size, source.mtimeMs)
}
```

在 Apple M4 Pro / Node 22.22 的本地开发基准中，对包含 2,728 个文件、341 个
目录的 fixture 扫描，Vooya FS 约为 **10.8 ms**；Node 使用递归 `readdir`
再逐项 `lstat` 约为 **31.1 ms**。但在只有 8 个文件的 fixture 上 Node 更快。
规模边界是产品设计的一部分，而不是被隐藏的脚注。

已有的 `readFile(..., { lines })` 扩展也体现了相同的融合原则：从 16 MB 文本
中读取前 100 行约为 **0.06 ms**，Node 读取、解码、切分并截取整个文件约为
**15.94 ms**。这是 API 形状带来的优势，并不代表所有单文件读取都快 200 倍。

## Node 对齐能力

```ts
import { cp, glob, readdir, rm } from '@vooya/fs'

const entries = await readdir('./node_modules', {
  recursive: true,
  withFileTypes: true,
})

const manifests = await glob('**/package.json', {
  cwd: './node_modules',
  concurrency: 4,
})

await cp('./cache', './cache-copy', { recursive: true, concurrency: 4 })
await rm('./cache-copy', { recursive: true, force: true, concurrency: 4 })
```

此外还提供 `access`、`appendFile`、`chmod`、`chown`、`copyFile`、`exists`、
`link`、`lstat`、`mkdir`、`mkdtemp`、`readFile`、`readlink`、`realpath`、
`rename`、`rmdir`、`stat`、`symlink`、`truncate`、`unlink`、`utimes`、
`writeFile` 的 Promise 与同步版本。

兼容范围是明确受限的：核心批量 API 的包入口支持字符串、Buffer 和 file URL
路径；需要 JS 回调或其他高级语义时使用 Node 路径，不承诺这些配置也能加速。
其他导出仍以各自文档为准，不提供 callback 风格的 API。准确边界见 [API 文档](./docs/content/api/index.mdx)
和 [`test/conformance`](./test/conformance) 下的 SDD。

## 原生优先，WASM 以后作为显式选项

正式运行路径继续采用 Rust + Node-API 原生扩展：

- 原生代码能直接使用操作系统文件系统语义；
- Rayon 和遍历库使用真实宿主线程；
- Node-API 在支持的 Node 版本间保持 JavaScript ABI 稳定。

WASI 可以作为未来独立的可移植包，但不能成为静默 fallback。当前权限、
所有权、软链和时间戳实现包含 Unix 专属语义；WASI 版本必须先通过声明范围
内的 conformance，并对不支持的能力明确抛错。

仓库中 [`experiments/node-wasi`](./experiments/node-wasi) 的 Node 24.20 可复现
实验里，同一棵 2,728 文件目录树，原生 `scanSync` 为 **9.86 ms**，只返回一个
计数的 WASI 遍历为 **15.96 ms**。模块只实例化一次，而且比较刻意偏向 WASI；
因此 WASM 在这里更适合作为可移植性/隔离选项，而不是默认性能路径。

## 开发与验证

需要 Node.js 22 或 24、pnpm 与当前稳定版 Rust：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
cargo clippy --all-targets --all-features -- -D warnings
corepack pnpm test
corepack pnpm doc:build
```

[官方性能入口](https://rush-fs-docs.vercel.app/benchmarks) 包含全部 26 组 API
对比表、同行测试集和原始证据。指定已安装的 Node 路径即可顺序复跑两版运行时：

```bash
pnpm perf:matrix --node22 /path/to/node22 --node24 /path/to/node24 \
  --output .perf/reproduction
```

运行单项性能基准：

```bash
corepack pnpm perf:fs scan --iterations 10 --warmup 2 --json .perf/scan.json
```

性能报告不是测试断言；报告会记录运行时、fixture 规模、样本、耗时统计与
内存变化。

## 从 Rush-FS 迁移

正式包名是 `@vooya/fs`，Rust crate 和原生二进制分别为 `vooya_fs`、
`vooya-fs`。旧的 `@rush-fs/core` 和 `rush-fs` 版本仍可安装，但已在 npm
上标记 deprecated，并给出明确的迁移提示。

npm deprecation 是警告，不是包名重定向。这里有意不发布兼容转接包：
旧包支持 Node.js 18，而 `@vooya/fs` 从 Node.js 22 起步；静默转发会让一次
patch 更新改变运行时要求。

## 与 Vooya 项目的关系

- [Vooya](https://github.com/vooyajs/vooya)：浏览器组件编译器、运行时契约和框架适配器；
- [Vooya Lab](https://github.com/vooyajs/vooya-lab)：展示经过测量的 Rust、WASM 与宿主边界；
- [Vooya FS](https://github.com/vooyajs/fs)：把相同的证据驱动边界设计用于 Node 文件系统任务，并采用 Rust 原生运行时。

## 当前兼容性迭代

[API execution policy and limits](./docs/content/api/compatibility.mdx) · [Measured batch evidence](./docs/content/guide/batch-evidence.mdx)

## License

MIT
