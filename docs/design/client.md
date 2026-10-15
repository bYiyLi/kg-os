# Client SDK 与 Docker-only 交付

本文件拥有 KG OS **TypeScript HTTP SDK、现存 CLI 适配层和当前 Docker-only 交付关系**。未来唯一官方运行产物按 [D99](decisions.md#d99-linux-amd64-docker-only-distribution) 为 Linux amd64 Docker 镜像；npm/npx 及六平台 Runtime 仅属已完成的历史发布。CLI 命令语义见 [CLI](cli.md)，本地 Instance / `kgosd` lifecycle 见 [Runtime](runtime.md)，Object / Graph / Evolution 的业务合同仍由各自 owner 文档维护。

## 客户端分层

KG OS 的浏览器与内部开发客户端使用 TypeScript；正式容器由 Go `kgosd` 承载，不运行 Node CLI：

```text
AI / Agent                  Browser / TS Application / internal CLI
    │                                      │
    ▼                                      ▼
 MCP + Skill                         packages/sdk
    │                               (TypeScript HTTP)
    │                                      │
    └─────────────────┬────────────────────┘
                      ▼
                  kgosd (Go)
               Web / HTTP API / MCP
```

- `@kgos/sdk` 是公共 HTTP Client 的唯一 TypeScript 实现，不拥有本地文件、daemon process 或 npm native artifact lifecycle。
- `packages/cli` 是历史 TypeScript CLI 的当前源码；可供内部开发/兼容测试使用，但不作为新的 npm 发行单元或官方 Docker 运行入口。
- 浏览器 Web 与第三方 TypeScript application 可以直接使用 `@kgos/sdk`，不得通过 CLI 子进程间接访问 KG OS。
- [Phase 16 Go 原生 MCP](mcp.md)由 `kgosd` 直接承载，与 Web、HTTP API 共用进程与监听端口；MCP Tool 直接映射 Kernel 的公共操作，不通过 `@kgos/sdk` 再发一次本机 HTTP。`@kgos/sdk` 仍是 TypeScript CLI / 浏览器 / 外部 TypeScript 调用方的 HTTP Client 合同，MCP 必须对齐其公开参数、结果和错误语义。独立 TypeScript MCP 与 Node Worker 已随 Phase 16 迁移从现行工作树移除，历史实现保留在 [Phase 15 已提交 revision](https://github.com/bYiyLi/kg-os/tree/ea37ddfca8c69bc701de0bb41d10d465f92c6b64/packages/mcp)，并非已发布的第九个 npm 包；当前统一 Go MCP 的开发及验收状态见 [Phase 16](../development/phases/16-kgosd-unified-mcp.md)。
- Phase 08 的 TypeScript CLI 取代了早期 Go `kg` CLI；这一已完成历史保留，但 [D99](decisions.md#d99-linux-amd64-docker-only-distribution) 不再承诺为它维护平台 native/npm 发布。

## `@kgos/sdk`

`@kgos/sdk` 映射 KG OS 已确认的公共 HTTP logical contract，按 `ontology / object / graph / evolution` 暴露对应 namespace。各 namespace 只适配对应 owner 已定义的 request/result/error，不重新发明第二套产品模型。

公共 `help(name?)` 是**不需要 Client/Token 的本地 SDK 文档查询**，并非 `KGOSClient` 的业务请求或额外 HTTP API；无参列出 MCP 沙箱当前支持的 31 个 SDK 业务方法，指定方法名返回来自本 SDK 类型合同的签名、入参/出参类型定义、示例及必要边界。帮助数据与 Go MCP 的同名异步 `help(name?)` 采用同一生成合同并在构建时验证；MCP 准入、参数与写权限继续由 Go Bridge 强制执行。具体模型可见语义由 [MCP SDK Help](mcp.md#mcp-tool-help) 拥有。

[Web 工作区数据](web.md#受控-api-与多窗口保存)的 `web.data.info({})` 已作为认证后连接启动信息入口实现，返回 `daemonBootId` 和 `storageStatus`；其余 `web.data / web.cache` 记录、缓存和导出 API 仍待实现。后续 adapter 沿用浏览器 Web Platform 边界和共享错误 envelope，下载使用 Blob，不加入本地文件系统访问、root discovery、Knowledge State 或自动 mutation retry。

Web 的[连接生命周期校验](web.md#连接认证与恢复)使用现有 `KGOSClientOptions.fetch` 注入点，为显式连接后的请求追加可选 expected-boot header；daemon 已校验并拒绝不匹配的请求。公共 SDK 仍由调用方显式提供 Bearer，不自动处理 Cookie、发现 / 更新 guard 或重试 mutation。浏览器 Web 的 `core/client` 在首次根 Token 认证后建立服务端 Web Session，刷新时依 HttpOnly Cookie 恢复当前进程的临时 Web Bearer 并重新绑定新的 boot ID；这不改变普通 SDK/CLI 的根 Token 合同。旧页面遇到 Boot Guard 失效时仍不能无提示地升级连接并重发操作。

同一 Web fetch adapter 按[接收与显示预算](web.md#接收与显示预算)在 SDK JSON / NDJSON 解码前限制响应字节并分块；这项 Web 实现尚不存在，不是当前 SDK 已保证内存上限。它继续复用 SDK 的唯一协议解析和每请求 AbortSignal，不复制另一套 transport / value 语义。

客户端构造必须由调用方显式提供 endpoint 与 token，例如：

```ts
new KGOSClient({
  endpoint: "http://127.0.0.1:51423",
  token: "<opaque-token>"
})
```

SDK 不读取 `--root`、`KGOS_ROOT`、`auth.json`、`kgosd.lock`、环境变量或 npm package location；本机 CLI 负责解析 Workspace Root，并从 `<root>/.kgos` 取得 Instance locator/credential 后再创建 SDK client。

SDK 使用标准 Web Platform 能力，同时服务 Node.js、`kgosd` 内置浏览器 Web 与第三方 TypeScript / JavaScript application；不得依赖 Node-only `fs`、`child_process`、process signal、native addon 或 KG OS platform package。

Object namespace 可以同时提供 structured `read` 与 canonical-text `readText` convenience。两者映射同一个 Object logical read；`readText` 由 daemon 在同一次 batch State pin 后调用唯一 Go canonical renderer并返回 `state/kind/ref/body`，SDK 不在 TypeScript 中复制 YAML serializer，也不按 Ref 循环重新读取 State。

错误与 streaming 规则：

- daemon 返回 non-2xx public error envelope 时保留公开 `code/message/details`，不根据 message 猜 category；
- DNS/socket/EOF/abort 等 transport failure 与 daemon public error 保持可区分；
- Graph non-stream request 返回完整 logical result；Graph streaming 暴露增量 async iteration，不缓存完整结果；
- `columns` / `row` 按收到顺序交付，terminal `summary` 表示成功，terminal daemon `error` 或 incomplete transport 表示失败；
- SDK 不自动 retry mutation、不自动翻页、不自动 resolve Merge conflict，也不因为 transport failure 猜测写请求是否提交。

CLI 的 stdout/stderr/exit 映射仍由 [CLI](cli.md#error-与-exit-code)拥有；SDK 只提供足够结构让 CLI 区分 daemon error、transport error 与已经交付的 partial stream。

## `@kgos/cli`（内部源码）

仓库保留 `packages/cli`，复用 SDK 及已有 CLI 命令/行为规范，供本地开发或迁移参考。它不是新的交付产物：`npx --yes @kgos/cli@<version>` 仅对应以往已发布版本，不对应未来 Docker 新版，也不进入当前 CI、GHCR Release 门禁。当前 Docker 中没有 Node.js 运行时，不以 `docker exec` 运行 TypeScript CLI。历史 Node CLI / Native package 的语义、初始化与退出码设计仍见 [CLI owner](cli.md)，不因发布方式收敛而自动改写业务 API。

<a id="npm-package-topology"></a>

## 历史 npm 分发（已停止新增发布）

<a id="版本关系"></a>
<a id="发布与验证边界"></a>

v0.2.1 已发布的 `@kgos/sdk`、`@kgos/cli` 和六个 `@kgos/runtime-*` 属于既有历史结果，相关 Phase 08–13 和 D76 不撤销。现行仓库中的平台 package manifest、Native Runtime 组装代码仅用于已存在的本机 CLI 开发路径；**不再作为用户新的安装、发布、测试平台承诺**。新的发布流程不会执行 npm Publish/OIDC、Registry Smoke 或 Runtime tarball matrix。

<a id="docker-only-交付"></a>

## 当前 Docker-only 交付

```text
Linux amd64 Docker / OCI (one official runtime artifact)
  └── kgosd (Go; non-root; no Node.js runtime)
        ├── HTTP API + Web (built from packages/sdk + packages/web)
        ├── MCP / SDK Help (generated from packages/sdk public types)
        ├── Lithograph + Provider + official Jieba extensions
        └── <workspace>/.kgos persistent Instance
```

- 唯一当前官方镜像为 `ghcr.io/<owner 小写>/kgos:v<version>`，只支持 Linux amd64；一次 Tag Release 发布且验证同一 Docker image，不再发布新 npm 包。镜像构建时的 TS/Node 是开发工具，不作为镜像运行时能力。
- `packages/sdk` 保持 TypeScript API 合同真源，是 Web 及 MCP SDK Help 生成的必要源码；不因为不对外发布 npm 而删除 SDK 类型定义、API 错误/流式约束或必要测试。
- 当前镜像构建暂复用先前已发布的 `@kgos/runtime-linux-x64@0.2.1` 中的**固定原生扩展文件**，仅为 build-only 历史 artifact 输入。这个输入版本独立于 KG OS 镜像 Tag；Docker 阶段重新编译当前 `kgosd`。完整原生扩展安装、Instance/materialization、网络和安全规则仍由 [Runtime](runtime.md#native-runtime-package)、[MCP Docker](mcp.md#docker-only-交付) 拥有。
- 验证只对单一交付目标做 Ubuntu/Linux amd64 源码质量门禁与 Linux amd64 Docker 隔离 Smoke。镜像中的原生扩展及 Go/JS/WASM 实际行为必须测试；旧 npm packaging/六平台 runner 不是这条链上的门禁。
- Tag、镜像 digest、GHCR 发布、Dev 部署/生产部署互相独立；未执行的动作不得写成已成功。详见 [D99](decisions.md#d99-linux-amd64-docker-only-distribution) 和 [Phase 21](../development/phases/21-docker-only-delivery.md)。
