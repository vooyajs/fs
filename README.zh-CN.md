<h1 align="center">Vooya FS</h1>

<p align="center">
  <strong>面向 Node.js 批量文件系统任务的 Rust 原生执行引擎。</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="https://github.com/vooyajs/fs">代码仓库</a> ·
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
> 当前分支正在完成 `@vooya/fs` 改名和新 API 整理。本次改造不会发布 npm 包。

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
目录的 fixture 扫描，Vooya FS 约为 **10.7 ms**；Node 使用递归 `readdir`
再逐项 `lstat` 约为 **34.0 ms**。但在只有 8 个文件的 fixture 上 Node 更快。
规模边界是产品设计的一部分，而不是被隐藏的脚注。

已有的 `readFile(..., { lines })` 扩展也体现了相同的融合原则：从 16 MB 文本
中读取前 100 行约为 **0.08 ms**，Node 读取、解码、切分并截取整个文件约为
**17.36 ms**。这是 API 形状带来的优势，并不代表所有单文件读取都快 200 倍。

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

兼容范围是明确受限的：当前路径参数为字符串，不提供 callback API，部分
Node 高级选项尚未实现。准确边界见 [API 文档](./docs/content/api/index.mdx)
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

运行带证据输出的性能基准：

```bash
corepack pnpm perf:fs scan --iterations 10 --warmup 2 --json .perf/scan.json
```

性能报告不是测试断言；报告会记录运行时、fixture 规模、样本、耗时统计与
内存变化。

## 从 Rush-FS 迁移

正式包名是 `@vooya/fs`，Rust crate 和原生二进制分别为 `vooya_fs`、
`vooya-fs`。旧的 `@rush-fs/core` 和 `rush-fs` 版本仍可安装，但会在 npm
上标记 deprecated，并给出明确的迁移提示。

npm deprecation 是警告，不是包名重定向。这里有意不发布兼容转接包：
旧包支持 Node.js 18，而 `@vooya/fs` 从 Node.js 22 起步；静默转发会让一次
patch 更新改变运行时要求。

## 与 Vooya 项目的关系

- [Vooya](https://github.com/vooyajs/vooya)：浏览器组件编译器、运行时契约和框架适配器；
- [Vooya Lab](https://github.com/vooyajs/vooya-lab)：展示经过测量的 Rust、WASM 与宿主边界；
- [Vooya FS](https://github.com/vooyajs/fs)：把相同的证据驱动边界设计用于 Node 文件系统任务，并采用 Rust 原生运行时。

## License

MIT
