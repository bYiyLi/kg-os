# Client SDK 与 npm 分发

本文件是 KG OS v1 **TypeScript Client SDK、npm package topology、npx 入口与 native Runtime package 选择**的设计真源。CLI 命令语义见 [CLI](cli.md)，本地 Instance / `kgosd` lifecycle 见 [Runtime](runtime.md)，Object / Graph / Evolution 的业务合同仍由各自 owner 文档维护。

## 客户端分层

KG OS 的客户端层统一使用 TypeScript；Go 只保留在本地 Runtime / Kernel / Database Host：

```text
AI / Human
    │
    ▼
@kgos/cli ─────┐
               │
Web ───────────┼──→ @kgos/sdk ── HTTP ──→ kgosd (Go)
               │
TS Application ┘
```

- `@kgos/sdk` 是公共 HTTP Client 的唯一 TypeScript 实现，不拥有本地文件、daemon process 或 npm native artifact lifecycle。
- `@kgos/cli` 是 Node.js CLI adapter；它负责本地 Instance / Runtime 管理，再通过 `@kgos/sdk` 调用同一 HTTP API。
- 浏览器 Web 与第三方 TypeScript application 可以直接使用 `@kgos/sdk`，不得通过 CLI 子进程间接访问 KG OS。
- Phase 00–07 的 Go `kg` CLI 是 Phase 08 的迁移行为基准；当前实现已经在 TypeScript parity 与 packed package smoke 通过后删除 Go CLI，只保留 `@kgos/cli` 这一套正式 Client。

## `@kgos/sdk`

`@kgos/sdk` 映射 KG OS 已确认的公共 HTTP logical contract，按 `ontology / object / graph / evolution` 暴露对应 namespace。各 namespace 只适配对应 owner 已定义的 request/result/error，不重新发明第二套产品模型。

客户端构造必须由调用方显式提供 endpoint 与 token，例如：

```ts
new KGOSClient({
  endpoint: "http://127.0.0.1:51423",
  token: "<opaque-token>"
})
```

SDK 不读取 `--root`、`auth.json`、`kgosd.lock`、环境变量或 npm package location；本机 CLI 负责从 Instance Root 取得这些值后再创建 SDK client。

SDK 使用标准 Web Platform 能力，同时服务 Node.js、`kgosd` 内置浏览器 Web 与第三方 TypeScript / JavaScript application；不得依赖 Node-only `fs`、`child_process`、process signal、native addon 或 KG OS platform package。

Object namespace 可以同时提供 structured `read` 与 canonical-text `readText` convenience。两者映射同一个 Object logical read；`readText` 由 daemon 在同一次 batch State pin 后调用唯一 Go canonical renderer并返回 `state/kind/ref/body`，SDK 不在 TypeScript 中复制 YAML serializer，也不按 Ref 循环重新读取 State。

错误与 streaming 规则：

- daemon 返回 non-2xx public error envelope 时保留公开 `code/message/details`，不根据 message 猜 category；
- DNS/socket/EOF/abort 等 transport failure 与 daemon public error 保持可区分；
- Graph non-stream request 返回完整 logical result；Graph streaming 暴露增量 async iteration，不缓存完整结果；
- `columns` / `row` 按收到顺序交付，terminal `summary` 表示成功，terminal daemon `error` 或 incomplete transport 表示失败；
- SDK 不自动 retry mutation、不自动翻页、不自动 resolve Merge conflict，也不因为 transport failure 猜测写请求是否提交。

CLI 的 stdout/stderr/exit 映射仍由 [CLI](cli.md#error-与-exit-code)拥有；SDK 只提供足够结构让 CLI 区分 daemon error、transport error 与已经交付的 partial stream。

## `@kgos/cli`

`@kgos/cli` 是 KG OS v1 面向 AI / shell 的正式分发与执行入口，并且 package 只暴露一个 npm `bin` entry：`kg`。单一 bin 使 npm/npx 对 scoped package 的 executable 推断保持确定，不建立第二个 CLI executable 名。

`@kgos/cli` 的正式 Node.js runtime baseline 为 **Node >= 24.15.0**；package `engines.node`、仓库 pinned Node toolchain、CI 与发布 smoke 必须保持一致。版本不满足时属于 Client 前置条件不满足，不为兼容旧 Node 隐式切换另一套 CLI 实现。README / 使用指南必须在 canonical npx 路径附近明确这一要求，避免只依赖 npm 的 engine-version incompatibility warning 作为用户说明。`@kgos/sdk` 的浏览器 / Web Platform 边界不因为 CLI 的 Node baseline 自动变成 Node-only。

AI / CI 的 canonical invocation 为：

```text
npx --yes @kgos/cli@<version> --root <instance-root> <command>
```

例如：

```sh
npx --yes @kgos/cli@0.1.0 --root ./.kgos ontology --at branch/main
```

`--yes` 是 npm/npx 自身的非交互确认选项，必须位于 package specifier 之前；它不是 KG OS CLI flag。npm 在未安装 package 时可能先提示确认，因此 AI / CI 显式使用 `--yes`；非 TTY / CI 环境即使 npm 自动假定 yes，也保持这一 canonical spelling 以避免环境差异。人类交互使用可以省略 `--yes`。AI / CI 还应固定明确版本；`@latest` 可以用于人工试用，但不作为可复现自动化的推荐形式。

CLI 的业务命令通过 `@kgos/sdk` 调用 daemon。只有 `doctor`、`init`、Instance discovery、credential 读取、Runtime ensure、native package resolution、stdin/file adapter、CLI presentation、i18n 与 exit code 属于 CLI 自己的本机职责。

## npm package topology

发布单元固定分为跨平台 TypeScript package 与平台 native Runtime package：

```text
@kgos/sdk
@kgos/cli

@kgos/runtime-darwin-arm64
@kgos/runtime-darwin-x64
@kgos/runtime-linux-arm64
@kgos/runtime-linux-x64
@kgos/runtime-win32-arm64
@kgos/runtime-win32-x64
```

`@kgos/cli` 以 exact-version normal dependency 关联同版本 `@kgos/sdk`，再以 exact-version `optionalDependencies` 关联同版本的平台 Runtime package。每个 native package 使用 npm `os` / `cpu` metadata 声明目标；npm 可以跳过当前平台不适用的 optional package，也允许调用方整体 omit optional dependencies，因此 CLI 仍必须验证当前 platform/arch 对应 package 确实存在、metadata 匹配且 manifest 有效。SDK version mismatch或native package缺失/unsupported target统一 fail closed，不在运行时临时下载第二份 binary。

这些 package 都是普通预构建 npm artifacts：`@kgos/cli` 与 native Runtime packages 不使用 `preinstall/install/postinstall` lifecycle script 下载、选择或改写 binary。平台选择只依赖 npm package metadata + CLI runtime resolution；Unix native package中的 `kgosd` 必须在 packed artifact中保留可执行权限，Windows package提供 `kgosd.exe`。六个 `@kgos/*` Runtime package与 `@kgos/cli` / `@kgos/sdk` 均按 public scoped package准备（manifest不得保留 `private: true`；发布时使用public access metadata），实际registry publish仍由release动作单独授权。

平台 package 的 logical layout 为：

```text
<runtime-package>/
├── kgosd（Windows 为 kgosd.exe）
├── extensions/
│   ├── lithograph.<platform-suffix>
│   ├── lithograph-openai-compatible.<platform-suffix>
│   └── kgos-jieba.<platform-suffix>
└── manifest.json
```

package 不再包含 native `kg` binary。`kgosd` 与三个 required official extension 使用同一 KG OS package version；manifest 记录 target、version 与每个 native artifact 的 SHA-256，缺失、target/version 不匹配或 hash 不匹配必须 fail closed。official Jieba 的 tokenizer code / dictionary data必须随当前 platform package形成可复现 artifact，不依赖宿主预装资源或运行时下载。

当前源码的 native package target 为 macOS arm64/x64、Linux **glibc** arm64/x64 与 Windows arm64/x64。Windows 使用 Node/npm 的 `win32` target 名、`.dll` 扩展和 `kgosd.exe`；Linux native package除 `os/cpu` 外还必须声明与实际构建一致的 npm `libc` metadata。公开 v0.1.0 仍只有已发布的四个 macOS/Linux Runtime package，Windows 需后续新版本发布；Phase 08 的历史四平台结论不被追溯扩张。没有对应 native package 的平台返回明确 unsupported-platform local error，不从源码即时编译、不回退任意远端 binary。

## Runtime package 与 Instance 分离

npm package location 属于软件分发状态，不能进入 Instance 持久配置：

```text
npx --yes @kgos/cli@0.1.0
        │
        └── @kgos/runtime-<os>-<arch>@0.1.0
                 └── kgosd + official extensions

--root /data/world/.kgos
        └── config / auth / lock / kgos.db / caches
```

因此：

- `config.toml` 不保存 npm cache / `node_modules` 中的 `kgosd` 或 official extension absolute path；
- CLI 每次 invocation 从当前 npm dependency graph 解析 native package；
- daemon 启动时从自身 Runtime package 校验并取得 required official extensions，再把本次进程需要的 native artifacts 固定到 Instance 的 content-addressed extension cache；后续 SQLite connection 不依赖 npm cache 文件继续存在；
- 第三方 SQLite extension 仍由 Instance `config.toml` 的通用 extension 配置管理，不归 npm platform package 所有。

KG OS 不建立第二个长期 runtime installation directory 或自制 package manager。npm/npx 负责软件 version acquisition，Instance Root 只负责数据与实例运行状态。

## 版本关系

一次 npx invocation 的 `@kgos/cli`、`@kgos/sdk` 与 resolved native Runtime package 使用同一个 KG OS package version。新启动的 daemon 必须报告与启动它的 Runtime package 一致的版本。

如果目标 `--root` 已有 active daemon，CLI 必须验证 daemon identity / version。当前 v1 不静默替换正在运行的不同 Runtime；不兼容时 fail closed并由 `doctor` 报告实际/请求版本。未来如要自动 rolling restart，必须单独设计 lifecycle 与并发语义。

## 发布与验证边界

npm 是正式分发入口；GitHub artifacts 可以继续作为 CI / provenance / 调试证据，但不要求用户手工下载后才能使用 KG OS。

发布候选至少验证 SDK exports/types、Node >=24.15.0 baseline、packed `@kgos/cli` 的 `npm exec` 与 `npx --yes`、platform selection、native manifest/hash、repo 外 `doctor -> init -> 首次业务命令`、daemon auto-start/auth/streaming，以及 macOS arm64/x64、Linux glibc arm64/x64、Windows arm64/x64 对应 runner 的真实 native load。六个平台都必须实际加载 official Jieba tokenizer并证明新 Instance 省略 `--fulltext-analyzer` 后写出/使用 `jieba`，不能只检查 package里存在一个文件。

`@kgos/*` 使用 npm organization scope。实际发布前必须由有权限的 npm account / organization确认可以发布 `@kgos` scope；若该 namespace不可用，属于 release naming blocker，需要在发布前单独裁决，不能静默换名后仍宣称符合本设计。

正式 Release 由已经存在的 `v<version>` Git tag 触发 GitHub Actions。tag 名必须与 root/package version 完全一致，并指向 `main` 历史中的同一 source revision；普通 PR / `main` push 不触发 publish。手工 `workflow_dispatch` 只用于对一个已经存在的 release tag 恢复或重跑，不产生第二套 release version/source。

发布顺序固定为六个 Runtime package、SDK、CLI 最后。六平台 immutable candidate、native load 与 packed smoke 全部通过后，八个 package 直接使用本次正式 dist-tag 发布；CLI 只有在其 exact SDK / Runtime dependency 已经能从 registry 解析到同版本 artifact 后才允许发布。这样在 CLI 切换前，用户正式入口不会提前指向一个依赖不完整的新版本，也不需要发布完成后再执行单独的 npm `dist-tag add`。

GitHub Actions 的长期 npm 发布认证使用 npm Trusted Publishing / OIDC；published package 的 `repository.url` 必须绑定当前 GitHub repository，Release publish job 必须拥有 `id-token: write`，正式 publish step 不注入长期 `NODE_AUTH_TOKEN`。首个 package 尚未存在、无法在 package settings 建立 trusted publisher 时，允许使用一次短期 bootstrap credential完成首次 publish；bootstrap credential 只能保存在 GitHub Actions secret，不进入 repository、artifact 或 log，并在本次首发 package 都配置 trusted publisher 后删除。

实际 npm registry publish、public-registry smoke 与 GitHub Release 是发布动作；只有真实执行并取得 registry evidence 后才能声称已发布。Git tag 是发布指令与 source identity，不再表示“发布完成后才补建的结果”。

## 非目标

v1 不因为 npm 分发而：

- 把 `kgosd` / Kernel / SQLite Host 改写成 Node.js；
- 让 SDK 直接打开 `kgos.db`；
- 要求用户全局安装 CLI 或 `kgosd`；
- 暴露 `kgosd` 为普通用户 lifecycle command；
- 把 npm cache path、package manager内部目录或 native binary path写入 Knowledge Base State；
- 为不同 client surface复制 Object / Graph / Evolution 产品语义。
