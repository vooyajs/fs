# 贡献指南

欢迎参与 vooya-fs 开发！本文档将引导你从零开始搭建环境、理解项目架构、实现新 API、编写测试，直到提交一个完整的 PR。

## 开发契约（必须遵守）

Vooya FS 的方向是：**通过 napi-rs 和稳定的 Node-API，让 Node.js 以尽量无侵入的
方式接入 Rust 生态，并获得原生层面可验证的性能收益。** 在明确支持的范围内，
保持 Node 的签名、选项、返回值和错误语义，让调用方通常只需替换 import。
扩展能力和兼容边界必须公开说明。

### 功能准入与完成条件

1. **先说明价值。** 明确真实工作负载、Node 基线、可复用的 Rust 库或算法，以及
   收益来自哪里：更好的算法、减少遍历/复制/分配、批处理、合并操作或有界并行。
   引入 crate 时评估维护状态、许可、平台支持和绑定成本。API 数量或改写成 Rust
   本身不能作为新增原生实现的理由。
2. **行为对齐。** 从公开包入口 `@vooya/fs` 对照 Node 22/24，使用独立 fixture，
   分别核对同步和 Promise 的类型、路径、选项、结果、错误字段和副作用。
   不得通过少做工作或改变语义换取加速比。Node 执行路径可用于保持兼容，
   但它的速度不能算作 Rust 加速。
3. **实现、测试、文档一起交付。** 功能和行为变更须在同一变更中更新相关测试、
   API SDD、用户文档和 CHANGELOG；修复须有回归测试。影响 README 或兼容性声明
   时同步更新。纯内部重构可复用现有测试和文档，但须说明具体理由，不能通过
   无意义地修改文件来满足检查项。
4. **测量受影响的路径。** 涉及热路径、调度、依赖、内存分配、复制和路由的变更，
   须用 release 构建，从公开包入口对比变更前后及 Node；把 N-API 转换和结果构造
   计入成本。保留原始样本、复现命令与结论，分别放到 `docs/public/evidence` 和
   对应文档中。已有基准可复用；未覆盖的场景须补充。
5. **根据证据决定推荐范围。** 原生快路径成为默认或获得推荐前，须证明目标负载
   上有可重复的收益。没有统一的加速百分比要求。必须公开小规模退化、性能回归
   和内存/延迟权衡。没有收益时保留必要的正确性修复，撤回加速声明并重新评估
   原生实现或适用范围；未测量的性能工作标记为未验证。

### 性能证据要求

记录 Node 版本、OS/CPU、变更前后版本或补丁标识、release 构建、数据规模和形状、
选项/编码、并发数、预热和样本数、缓存条件。保证比较的输出和副作用等价。
关注延迟、适用时的吞吐量，以及涉及物化/分配时的内存；RSS 前后差值不是峰值。
保留样本分布，不能只挑最好成绩。整文件读取与流式/局部读取的基线须明确命名。

至少包含 tiny/small 和有代表性的目标规模。通常从 2 次预热、10 次采样开始；
较少的探索性样本须说明原因。噪声较大时在受控条件下复测，计时时避免其他重负载。
不得把单平台结果推广到全部平台，或把 Node 回退路径的成绩当作原生收益。
共享 CI 上的固定加速比不作硬性断言；可复现的性能证据由评审检查。

### 验证与评审

行为/性能变更完成前执行相关检查：`pnpm build`、`pnpm test`、`pnpm typecheck`、
`pnpm lint`、`cargo fmt -- --check`、`cargo clippy --all-targets --all-features -- -D warnings`
和 `pnpm doc:build`。API/绑定变更还要通过 Node 22/24 与平台 CI 矩阵。
无法执行的平台运行时验证须明确记录，交叉编译不能代替运行测试。
纯文档变更执行格式、链接/内容检查，站点内容变化时构建文档，无须跑无关的文件系统基准。

[PR 模板](.github/PULL_REQUEST_TEMPLATE.md)记录证据与适用性说明；CI 验证可执行检查，
评审验证负载等价性、收益和限制。[AGENTS.md](AGENTS.md)约束后续编码代理。
参见[兼容策略](docs/content/api/compatibility.mdx)与[性能证据](docs/content/guide/batch-evidence.mdx)。
完整英文规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 目录

- [环境准备](#环境准备)
- [项目架构](#项目架构)
- [开发一个新 API 的完整流程](#开发一个新-api-的完整流程)
- [参考 Node.js 源码](#参考-nodejs-源码)
- [编写 Rust 实现](#编写-rust-实现)
- [性能优化：并行化](#性能优化并行化)
- [编写测试](#编写测试)
- [运行性能基准测试](#运行性能基准测试)
- [代码风格与提交规范](#代码风格与提交规范)
- [CI 流程](#ci-流程)

---

## 环境准备

### 必备工具

| 工具        | 版本要求                  | 用途               |
| ----------- | ------------------------- | ------------------ |
| **Node.js** | >= 20                     | 运行测试和构建脚本 |
| **pnpm**    | >= 9                      | 包管理器           |
| **Rust**    | stable (通过 rustup 安装) | 编译原生模块       |
| **rustup**  | 最新                      | Rust 工具链管理    |

### 初始化步骤

```bash
# 1. 克隆仓库
git clone <repo-url>
cd vooya-fs

# 2. 确保 Rust 工具链就绪
rustup default stable

# 3. 安装 Node.js 依赖
pnpm install

# 4. 构建原生模块（debug 模式，用于开发）
pnpm build:debug

# 5. 运行测试，确认环境正常
pnpm test
```

> **注意**：始终使用 `package.json` 中定义的脚本命令，不要直接跑 `cargo build` 或 `napi build`。这是因为 napi-rs 需要特定的参数来生成正确的 `.node` 二进制和类型声明。

### 常用命令速查

```bash
pnpm build:debug     # 开发构建（不优化，编译快）
pnpm build           # 发布构建（开启 LTO，编译慢但产物更快）
pnpm test            # 运行所有测试（AVA）
pnpm bench           # 运行所有基准测试
pnpm bench readdir   # 只运行 readdir 的基准测试
pnpm lint            # 代码检查（oxlint）
pnpm format          # 格式化所有代码（Prettier + cargo fmt + taplo）
```

---

## 项目架构

```
vooya-fs/
├── src/                    # Rust 源码（核心实现）
│   ├── lib.rs              # 模块注册入口
│   ├── types.rs            # 共享类型（Dirent, Stats）
│   ├── utils.rs            # 工具函数（文件类型判断等）
│   ├── readdir.rs          # readdir / readdirSync
│   ├── stat.rs             # stat / lstat
│   ├── read_file.rs        # readFile / readFileSync
│   ├── write_file.rs       # writeFile / appendFile
│   ├── cp.rs               # cp / cpSync（递归复制，支持并发）
│   └── ...                 # 每个 API 一个文件
├── __test__/               # 测试文件（TypeScript, AVA 框架）
│   ├── readdir.spec.ts
│   ├── stat.spec.ts
│   └── ...
├── benchmark/              # 性能基准测试
│   ├── bench.ts            # 基准测试入口（自动发现并运行）
│   ├── readdir.ts          # readdir 性能对比
│   ├── glob.ts             # glob 性能对比
│   ├── stat.ts             # stat / lstat 性能对比
│   ├── read_file.ts        # readFile 性能对比（多种文件大小）
│   ├── write_file.ts       # writeFile / appendFile 性能对比
│   ├── copy_file.ts        # copyFile 性能对比
│   ├── exists.ts           # exists / access 性能对比
│   ├── mkdir.ts            # mkdir 性能对比
│   ├── rm.ts               # rm 性能对比（含并发）
│   └── cp.ts               # cp 性能对比（含并发，树形/平铺目录）
├── reference/              # Node.js fs 模块源码参考
│   ├── fs.js               # Node.js 主 fs 模块
│   └── internal/fs/        # Node.js 内部实现
├── index.js                # napi-rs 自动生成的 JS 加载器
├── index.d.ts              # napi-rs 自动生成的类型声明
├── Cargo.toml              # Rust 依赖配置
└── package.json            # Node.js 项目配置
```

### 关键技术栈

- **napi-rs** — Rust ↔ Node.js 桥接层，通过宏自动生成 JS 绑定
- **jwalk** — 并行目录遍历（用于 readdir recursive）
- **ignore** — glob 模式匹配 + .gitignore 支持
- **rayon** — 数据并行处理（用于 rm concurrency）
- **AVA** — 测试框架（TypeScript, ESM）
- **mitata** — 微基准测试库

---

## 开发一个新 API 的完整流程

以实现 `symlink` 为例，完整走一遍流程。

### 第一步：参考 Node.js 源码

在 `reference/` 目录下查阅 Node.js 原始实现，理解：

1. **函数签名**：参数类型、可选项、返回值
2. **边界行为**：空路径怎么处理？不存在的文件报什么错？权限不足呢？
3. **错误格式**：Node.js 使用 `ENOENT: no such file or directory, symlink 'xxx' -> 'yyy'` 这样的格式

```bash
# 查看 Node.js 中 symlink 的实现
# reference/fs.js 搜索 "function symlink"
# reference/internal/fs/promises.js 搜索 "async function symlink"
```

### 第二步：创建 Rust 源文件

在 `src/` 下创建 `symlink.rs`，遵循以下模式：

```rust
use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

// 1. 内部实现函数（不暴露给 JS）
fn symlink_impl(target: String, path: String) -> Result<()> {
    // 实际逻辑...
    // 错误格式模拟 Node.js：
    // "ENOENT: no such file or directory, symlink 'target' -> 'path'"
    Ok(())
}

// 2. 同步版本
#[napi(js_name = "symlinkSync")]
pub fn symlink_sync(target: String, path: String) -> Result<()> {
    symlink_impl(target, path)
}

// 3. 异步版本（通过 AsyncTask 包装）
pub struct SymlinkTask {
    pub target: String,
    pub path: String,
}

impl Task for SymlinkTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        symlink_impl(self.target.clone(), self.path.clone())
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi(js_name = "symlink")]
pub fn symlink(target: String, path: String) -> AsyncTask<SymlinkTask> {
    AsyncTask::new(SymlinkTask { target, path })
}
```

### 代码模式要点

- **Options 结构体**：用 `#[napi(object)]` + `Option<T>` 字段
- **返回多态类型**：用 `Either<A, B>`（如返回 `string[] | Dirent[]`）
- **错误结构**：适用时保持 `code`、`syscall`、`path`、`dest`、`errno`，使用 `src/fs_error.rs` 从工作线程传递错误；只有消息前缀不够。
- **平台差异**：用 `#[cfg(unix)]` / `#[cfg(not(unix))]` 处理

### 第三步：注册模块

编辑 `src/lib.rs`，按字母序添加：

```rust
pub mod symlink;       // 在 mod 声明区
pub use symlink::*;    // 在 use 声明区
```

### 第四步：构建验证

```bash
pnpm build:debug
```

构建成功后 `index.d.ts` 会自动更新，新函数的类型声明会自动生成。

---

## 参考 Node.js 源码

`reference/` 目录包含从 Node.js 仓库复制的关键文件：

| 文件                                | 内容                                            |
| ----------------------------------- | ----------------------------------------------- |
| `reference/fs.js`                   | 所有 fs API 的回调/同步实现，是最重要的参考     |
| `reference/internal/fs/utils.js`    | Stats 类构造、参数校验、错误处理、常量定义      |
| `reference/internal/fs/promises.js` | Promise 版本的实现（我们的 async 版本参考这个） |
| `reference/internal/fs/dir.js`      | `opendir` / `Dir` 类实现                        |
| `reference/internal/fs/watchers.js` | `watch` / `watchFile` 实现                      |

**使用方法**：实现任何 API 前，先在对应文件中搜索函数名，理解其完整行为——特别是边界情况和错误处理。

---

## 性能优化：并行化

vooya-fs 的核心优势是利用 Rust 的并行能力。以下是常用的并行化手段：

### 1. jwalk — 并行目录遍历

用于 `readdir` 的递归模式：

```rust
use jwalk::{Parallelism, WalkDir};

let walk = WalkDir::new(path)
    .parallelism(Parallelism::RayonNewPool(concurrency));
```

### 2. rayon — 数据并行

用于 `rm` 的并发删除：

```rust
use rayon::prelude::*;

entries.par_iter().try_for_each(|entry| {
    remove_recursive(&entry.path(), opts)
})?;
```

### 3. ignore crate — 并行 glob

用于 `glob` 的多线程匹配：

```rust
use ignore::WalkBuilder;

let mut builder = WalkBuilder::new(&cwd);
builder
    .overrides(overrides)
    .threads(concurrency);  // 一行开启多线程

builder.build_parallel().run(/* ... */);
```

### 设计原则

- `concurrency` 选项默认值合理（通常 4 或 auto），用户可覆盖
- 低文件数量时并行开销可能大于收益，需要 benchmark 验证
- 使用 `Arc<Mutex<Vec<T>>>` 收集并行结果，注意锁粒度

---

## 编写测试

### 测试文件位置

每个 API 对应一个测试文件：`__test__/<api_name>.spec.ts`

### 测试框架

使用 [AVA](https://github.com/avajs/ava)，TypeScript 通过 `@oxc-node/core` 编译。测试以 ESM 模式运行，**不能使用 `require()`**，必须使用 `import`。

### 测试结构模板

```typescript
import test from 'ava'
import { symlinkSync, symlink } from '@vooya/fs'
import { existsSync, mkdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 辅助函数：创建临时目录
function tmpDir(): string {
  const dir = join(tmpdir(), `vooya-fs-test-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ===== 同步版本测试 =====

test('symlinkSync: should create a symbolic link', (t) => {
  // 测试正常功能
})

test('symlinkSync: should throw for a missing destination parent', (t) => {
  // 测试错误处理
  t.throws(() => symlinkSync('target', '/no/such/parent/link'), { message: /ENOENT/ })
})

// ===== 异步版本测试 =====

test('symlink: async should create a symbolic link', async (t) => {
  await symlink(target, dest)
  t.true(existsSync(dest))
})

// ===== 双跑对比测试（关键！）=====

test('symlinkSync: should match node:fs behavior', (t) => {
  const nodeResult = nodeFs.readlinkSync(link)
  const hyperResult = readlinkSync(link)
  t.is(hyperResult, nodeResult)
})
```

### 三类必须覆盖的测试

#### 1. 功能测试

验证 API 在正常场景下行为正确，sync 和 async 各一组。

#### 2. 双跑对比测试

同时调用 `node:fs` 和 `vooya-fs`，对比返回值。这是确保行为一致性的关键：

```typescript
import * as nodeFs from 'node:fs'
import { statSync } from '@vooya/fs'

test('statSync: should match node:fs stat values', (t) => {
  const nodeStat = nodeFs.statSync('./package.json')
  const hyperStat = statSync('./package.json')

  t.is(hyperStat.size, nodeStat.size)
  t.is(hyperStat.mode, nodeStat.mode)
  t.is(hyperStat.isFile(), nodeStat.isFile())
  t.is(hyperStat.isDirectory(), nodeStat.isDirectory())
})
```

#### 3. 错误处理测试

对照 Node 检查结构化错误字段与副作用；下面的消息检查仅作补充：

```typescript
test('should throw ENOENT on missing file', (t) => {
  t.throws(() => someSync('./no-such-file'), { message: /ENOENT/ })
})

test('async should throw ENOENT on missing file', async (t) => {
  await t.throwsAsync(async () => await someAsync('./no-such-file'), { message: /ENOENT/ })
})
```

### 运行测试

```bash
pnpm test              # 运行全部测试
npx ava __test__/stat.spec.ts  # 只运行 stat 的测试
```

---

## 运行性能基准测试

### 基准测试结构

基准测试位于 `benchmark/` 目录。纯读操作（stat、readFile、exists 等）使用 [mitata](https://github.com/evanwashere/mitata) 库获得精确的微基准数据；破坏性/有副作用的操作（writeFile、copyFile、mkdir、rm）使用手动迭代 + `process.hrtime` 测量，每次迭代前重新搭建测试数据。

### 已有的基准测试

| 文件            | 覆盖 API                                                   | 模式     |
| --------------- | ---------------------------------------------------------- | -------- |
| `readdir.ts`    | readdir（names / withFileTypes / recursive / concurrency） | mitata   |
| `glob.ts`       | glob vs node-glob vs fast-glob                             | mitata   |
| `stat.ts`       | stat / lstat / batch stat                                  | mitata   |
| `read_file.ts`  | readFile（11B / 64KB / 4MB, Buffer / utf8）                | mitata   |
| `exists.ts`     | exists / access / batch exists                             | mitata   |
| `write_file.ts` | writeFile / appendFile（多种大小）                         | 手动迭代 |
| `copy_file.ts`  | copyFile（11B / 64KB / 4MB）                               | 手动迭代 |
| `mkdir.ts`      | mkdir（单层 / recursive / 已存在）                         | 手动迭代 |
| `rm.ts`         | rm（flat / deep / tree + concurrency）                     | 手动迭代 |

### 运行方式

```bash
pnpm bench              # 运行所有基准测试
pnpm bench readdir      # 只运行包含 "readdir" 的基准
pnpm bench stat         # 只运行 stat 基准
pnpm bench read_file    # 只运行 readFile 基准
pnpm bench glob         # 只运行 glob 基准
```

### 编写新的基准测试

创建 `benchmark/<api_name>.ts`，按以下模板：

```typescript
import { run, bench, group } from 'mitata'
import * as fs from 'node:fs'
import { someSync } from '@vooya/fs'

// 对标 Node.js 原生实现
group('Some API', () => {
  bench('Node.js', () => fs.someSync(args)).baseline()
  bench('Vooya FS', () => someSync(args))
})

// 如果有并发选项，做并发对比
group('Vooya FS Concurrency', () => {
  bench('Default', () => someSync(args)).baseline()
  bench('4 Threads', () => someSync(args, { concurrency: 4 }))
  bench('8 Threads', () => someSync(args, { concurrency: 8 }))
})

await run({ colors: true })
```

### 基准测试要点

- **必须用 release 构建**：`pnpm build` 而不是 `pnpm build:debug`，否则性能数据没有参考意义
- **Baseline 标记**：用 `.baseline()` 标记 Node.js 原生实现作为基准线
- **大数据集**：尽量用 `node_modules` 等真实大目录做测试素材
- **预热**：mitata 自带预热机制，手动 bench 时记得先跑一次 warmup

---

## 代码风格与提交规范

### Rust 代码

- 缩进：2 空格（配置在 `rustfmt.toml`）
- 格式化：`pnpm format:rs`（等价于 `cargo fmt`）
- Lint：`cargo clippy`（CI 中自动执行）
- `#![deny(clippy::all)]` 已在 `lib.rs` 中启用

### TypeScript / JavaScript

- 格式化：`pnpm format:prettier`
- 规则：120 字符宽、无分号、单引号、尾逗号
- Lint：`pnpm lint`（oxlint）

### 提交流程

```bash
# 1. 创建分支
git checkout -b feat/add-symlink

# 2. 开发 + 测试
pnpm build:debug
pnpm test

# 3. 格式化
pnpm format

# 4. 提交（husky + lint-staged 会自动格式化暂存文件）
git add .
git commit -m "feat: add symlink/symlinkSync"

# 5. 性能测试（PR 中附上结果）
pnpm build
pnpm bench
```

### PR Checklist

使用 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)和上面的开发契约作为完成清单。
新增 Rust 模块时登记 `src/lib.rs`；测试和性能证据须覆盖公开包入口及变更行为，
不能只验证生成的原生绑定。

---

## 文档

- **每个已支持的 API 都应有对应的文档页**，位于 `docs/content/api/`。文档站（Nextra）在 `docs/` 目录，在仓库根目录执行 `pnpm doc:dev` 可本地预览。
- **当你新增或修改某个 API 时**，需在 `docs/content/api/` 下新增或更新对应文件（如 `docs/content/api/readdir.mdx`），并在 `docs/content/api/_meta.js` 中登记。每个 API 页须包含：**基础用法**、**方法**（签名与选项）、**性能**（来自 `pnpm bench` 的数据，表格形式，至少与 Node.js `fs` 对比）、**其他补充**（已知问题、使用建议）。证据要求以上面的开发契约为准。
- **保持文档同步**：若修改了行为或选项，请同步更新该 API 文档和 README 中受影响的声明，避免文档与实现不一致。

---

## CI 流程

GitHub Actions 会在 push / PR 时自动执行：

1. **Lint** — `oxlint` + `cargo fmt --check` + `cargo clippy`
2. **Build** — 跨平台编译（macOS x64/arm64, Windows x64, Linux x64）
3. **Test** — 在 macOS / Windows / Linux 上运行测试（Node 22 & 24）
4. **Documentation** — 构建文档站；发布由独立 Release 工作流手动触发

开发阶段可用 debug 构建迭代；提交评审前须满足上面的开发契约，CI 补充跨平台验证。

### 发布前/后检查（维护者）

打新版本时（在运行 Release 工作流**之前**）：

1. **升级版本号**（两处需一致）：
   - `package.json` → `"version": "x.y.z"`
   - `Cargo.toml` → `version = "x.y.z"`
   - npm 不允许覆盖已发布版本；若上次发布半途失败但版本已上 npm（例如 0.0.4 已存在），需先改为新版本号（如 0.0.5）再重新发布。
2. **更新 [CHANGELOG.md](CHANGELOG.md)**：将 **\[Unreleased]** 下的条目移到新的 `## [x.y.z] - YYYY-MM-DD` 小节，并在文末补充该版本的链接（`[x.y.z]: https://github.com/vooyajs/fs/compare/vA.B.C...vx.y.z`）。
3. **执行发布**：推送到 `main` 后，在 **Actions → Release → Run workflow** 中运行。工作流在 npm 发布成功后创建 `fs-vx.y.z` 标签。
