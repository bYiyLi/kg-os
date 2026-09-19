# 工程映射与实现待办

本文件记录 **Phase 0 开发环境计划、工程工具与模块组织、实现依赖、compiler/adapter 工作和验收**。产品合同仍由 [Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 和 [Runtime](runtime.md)拥有。

## Phase 0：开发环境搭建

**当前状态：计划已记录，尚未实施。** 本阶段建立完整开发环境，让工程可以安装、开发启动、调试、检查、测试、构建和验证交付物。以下命令、目录和验收均是实施目标，不表示仓库已经具备这些能力。

用户已确认先搭开发环境、参考 Noven，并要求尽量全面。Phase 0 因此同时包含通用质量检查、浏览器测试、真实扩展测试入口、CI 和打包验证。它不改变 Object / Ontology / Graph / Evolution 的产品合同，也不把这些业务功能纳入本阶段完成声明。决定依据见 [D64](decisions.md#d64-phase0-development-environment)。

### 目标与边界

- 新 checkout 按开发说明安装工具链后，统一安装依赖、启动开发宿主、访问内置 Web 壳页，并运行 CLI 的帮助和版本入口。
- 开发与测试使用独立的 `KG_HOME` 和临时数据库，不默认打开开发者的 `~/.kgosd`；测试创建的进程、端口与目录由测试负责清理。
- 完整检查覆盖源代码、依赖、模块边界、真实运行、浏览器和交付物；命令缺失、必要资源缺失或测试跳过不算验收通过。
- Web 壳页和 HTTP 宿主证明工程链路可运行，不代表正式 daemon 已完成数据库初始化、认证、生命周期或业务 API。未实现的业务能力不能返回模拟成功；正式 `running` 条件继续由 [Runtime](runtime.md#daemon-lifecycle)定义。
- SQL `tx_*` 的完整事务行为、Native streaming / cancellation、只读查询与自动缓存、Schema compiler、批量 Patch、Merge 和业务页面，继续归后面的工程待办。Phase 0 不因准备了测试入口就将它们标为已验证。

### 工程组织与工具选择

采用 pnpm workspace 管理当前已经明确的职责。目录是代码与构建边界，不是多个运行服务，也不承诺每个包都单独发布到 npm。

```text
packages/
  contracts/   现有公共合同的共享类型与值定义，无 Node.js / 数据库依赖
  kernel/      Object / Graph / Evolution 与模型编排的实现位置
  daemon/      kgosd、HTTP 宿主、配置与 SQLite / Lithograph 接入
  sdk/         调用公共 HTTP 合同的客户端
  cli/         kg 命令入口
  web/         浏览器代码、页面与资源
scripts/       安装检查、构建、质量检查与本地打包验证
tests/         跨模块集成、浏览器、真实扩展与交付物测试
```

`contracts` 只解决服务端、CLI、SDK 和浏览器共享类型时不能带入数据库代码的问题；不建立新的协议层。没有实现的业务方法不通过空函数、示例返回值或占位测试制造完成状态。

依赖规则：`kernel → contracts`；`daemon → kernel / contracts`；`sdk → contracts`；CLI 与 Web 通过 SDK / 公共类型使用服务。客户端不运行 Kernel、不直接导入 daemon 内部或数据库代码。CLI 的本地 daemon 启动只定位并启动同一交付物中的 `kgosd` 可执行入口，不因此获得数据库访问能力。Web 产物由构建流程装入 daemon 交付物，不通过服务端 import 执行浏览器源码。

| 工具或配置 | Phase 0 实施选择 | 解决的问题 |
| --- | --- | --- |
| Node.js / pnpm | 首轮以 Node.js 24 为验证基线；P0-01 核验正式版本兼容性后，在 `.node-version` 固定精确 Node 版本，在根 `packageManager` 固定 pnpm 精确版本；CI 读取相同来源 | 避免本机、CI 和他人 checkout 使用不同工具链 |
| Workspace / 依赖锁定 | `pnpm-workspace.yaml`、内部 `workspace:` 依赖、一个 `pnpm-lock.yaml`；安装脚本许可按实际依赖配置 | 统一安装、构建顺序与本地包解析 |
| TypeScript | ESM、共享 strict 基线；Node 包使用 NodeNext，Web 使用浏览器 lib 和适合 bundler 的解析；测试类型单独配置 | 检查类型，同时隔离 Node 与浏览器运行环境 |
| 开发与构建 | Node 包用 `tsc` 生成 JS、类型声明和 source map；服务端 watch 启动；Web 用 Vite 构建和 middleware 模式热更新 | 一次启动即可联调，并能生成独立于源码的产物 |
| 基础质量 | ESLint / typescript-eslint / SonarJS、Prettier、Markdownlint、CSpell | 类型相关错误、代码复杂度、格式与文档检查 |
| 结构与依赖质量 | dependency-cruiser、Knip、Syncpack、Sherif、jscpd、type-coverage、pnpm dedupe | 循环 / 越层依赖、未使用项、版本不一致、重复代码与类型逃逸检查 |
| 依赖审查 | 正式版本声明检查、许可证检查、pnpm audit | 检查实际引入的依赖；许可规则依据 KG OS，不能复制 Noven 的允许清单 |
| 测试 | Vitest + V8 coverage；Playwright 浏览器测试；独立真实 Lithograph smoke | 验证模块、进程、HTTP、浏览器和 native extension 的不同边界 |
| Git / CI | Lefthook、GitHub Actions，复用根级脚本 | 本地快速反馈与干净环境完整验收 |
| 交付物 | publint、Are the Types Wrong、临时目录安装 / 运行 smoke | 验证 exports、类型和脱离工作区后的实际运行 |

具体依赖版本由 P0-01 结合 Node 基线实测并写入 manifest / lockfile；版本文件与锁文件是实施后的唯一版本来源。Noven 当前声明的版本与忽略项只是参考，不自动成为 KG OS 的兼容承诺。

### 开发与构建流程

`pnpm dev` 统一启动开发宿主与 Web 热更新。Vite 以 middleware 接入同一个 HTTP server，HMR WebSocket 也使用该 server；API 路由与页面资源使用同一 configured origin。服务端源码变化可以重启开发宿主，浏览器代码变化触发热更新。退出开发命令要关闭 watcher、HTTP、WebSocket 和其子进程，不遗留另一个 Web 服务。

`pnpm build` 先生成 Node 包与公共类型，再构建 Web 并把静态产物装入 daemon 的发布目录。构建结果中的 Web 由 `kgosd` 提供，运行时不依赖 Vite dev server、workspace 源文件或开发者机器上的绝对路径。Node.js 执行服务端代码，浏览器执行通过 HTTP 下载的 Web 代码；两边使用 TypeScript 不改变这一运行边界。

开发脚本可在尚未接入业务能力时运行页面与 HTTP 壳层，但它不是正式 daemon 的就绪旁路：不伪造 Knowledge Base、auth、lock、State 或成功业务响应。正式 daemon 的启动、配置、认证和读写规则仍按 Runtime 实现，开发时也不为已接入的业务 API 关闭认证。Phase 0 测试可直接启动同一 HTTP 宿主模块来验证页面和资源，不新增产品级“跳过数据库”模式。

IDE 配置支持服务端断点、CLI 参数调试和浏览器 source map；所有路径相对工作区。开发说明提供示例配置、测试 fixture 获取方式与报告位置，实际凭证不进入源码或 Web bundle。

### 分步任务与验收

任务按下表依赖推进，所有任务当前均为待实施。

| 任务 | 依赖 | 交付物 | 通过条件 |
| --- | --- | --- | --- |
| P0-01 工具链与安装 | 无 | 根 manifest、workspace、锁文件、Node 版本文件、忽略规则、环境检查与安装入口 | 新 checkout 使用固定版本安装成功；再次 frozen install 不改锁文件；缺工具给出准确提示；不要求全局安装业务工具或先安装整个 Noven |
| P0-02 模块与编译 | P0-01 | 上述职责目录、公共类型入口、Node / Web / test tsconfig、Node 构建脚本、CLI 帮助和版本入口 | 类型检查与 Node 构建通过；按依赖顺序构建；客户端不能引入数据库运行代码；CLI 输出来自真实包版本 |
| P0-03 开发联调与调试 | P0-02 | 单命令启动、Vite middleware、Web 壳页、watch / HMR、source map、IDE 配置、独立开发 profile | 页面可访问；前端热更新、服务端重启和断点可用；退出释放资源；正式 `KG_HOME` 不被创建或修改 |
| P0-04 完整质量检查 | P0-02 | 类型、lint / format、文档、依赖边界、未使用项、重复代码、版本 / dedupe、类型覆盖率、license / audit 等检查配置 | 每项都有真实命令；根入口可组合执行；通过受控错误样本确认检查确实能失败；样本不遗留在源码中 |
| P0-05 测试与隔离 | P0-03；覆盖率依赖 P0-04 | Vitest、Playwright、HTTP / CLI 测试、临时 profile helper、真实扩展 fixture 与 smoke | 实际启动与清理可验证；页面和静态资源正确加载；测试相互隔离；真实扩展 smoke 满足下文边界；无“没有测试也成功”的占位配置 |
| P0-06 构建与本地交付物 | P0-03、P0-04、P0-05 | Web 入包、exports / 类型检查、本地打包与干净目录运行验证 | 产物脱离仓库运行；CLI 入口、HTTP 宿主和 Web 资源可用；没有未解析 workspace 依赖、缺失资源或源码路径依赖；不执行对外发布 |
| P0-07 Git hooks 与 CI | P0-04、P0-05、P0-06 | Lefthook、GitHub Actions、依赖 / 浏览器 / 扩展安装步骤、失败报告与测试产物 | 提交前快速检查可运行；CI 在干净环境运行完整检查和打包验证；必要 job 的实际结果可核对 |
| P0-08 开发说明与收尾 | P0-01 至 P0-07 | 与真实命令一致的开发说明、README 状态和设计引用、vlog、验收记录 | 按文档从新目录完整重走成功；逐项记录已执行结果与未通过项；没有把环境搭建声明成业务实现完成 |

### 命令与完整检查入口

以下是 Phase 0 要建立的根级脚本合同，当前不能直接作为已经可用的使用说明。Makefile 可以作为便利包装，但不能成为另一份检查逻辑或必装前提。

| 命令 | 职责 |
| --- | --- |
| `pnpm run setup` | frozen 安装、Git hooks、测试浏览器与扩展 fixture 准备；不修改全局包管理器或默认用户 profile |
| `pnpm dev` | 开发宿主、同源 Web、watch / HMR 与完整退出清理 |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | 类型检查、代码与文档检查、显式格式修复；检查命令本身不自动改源码 |
| `pnpm test` / `pnpm test:coverage` | 单元及宿主集成测试；后者包含 V8 覆盖率报告与门槛检查 |
| `pnpm test:e2e` | Playwright 的实际页面、资源与浏览器交互检查 |
| `pnpm test:native` | 在 Node.js 中加载真实 Lithograph，初始化临时数据库、执行只读常量 Cypher 并关闭连接 |
| `pnpm check:quick` | typecheck、lint、快速测试，供开发与 pre-commit 使用 |
| `pnpm build` | Node 与 Web 的完整构建及 Web 资源入包 |
| `pnpm validate` | 按依赖顺序执行所有完整检查、测试、构建、exports / 类型与本地交付物验证 |
| `pnpm pack:release` | 生成本地候选交付物并在临时目录验证；不上传、不发布、不自动提交或推送 |

安装入口必须显式写为 `pnpm run setup`；`pnpm setup` 是包管理器自身的环境安装命令，不能用作项目安装脚本的简称。

完整检查必须包含：冻结安装检查、正式依赖版本声明、类型、ESLint / 格式 / Markdown / 拼写、模块边界与循环、未使用代码 / 依赖、重复代码、类型覆盖率、workspace 一致性、依赖版本与 dedupe、构建、单元 / 集成覆盖率、浏览器测试、真实扩展 smoke、包 exports / 类型、打包运行、diff 空白、许可证与已知漏洞检查。共享内部脚本避免 `validate` 与 `pack:release` 互相递归或重复运行同一整套测试。

构建必须先于依赖 `dist` 的 exports、包类型和交付物检查；浏览器产物测试必须使用本次生成的资源。不能照搬 Noven hook 中 exports 先于 build 的顺序。网络或工具不可用时报告该检查未完成，不能把跳过 audit、browser 或 native test 当作完整检查成功。

覆盖率配置在 P0-04 / P0-05 固定并提交：以 Noven 的四项代码覆盖率 90%、类型覆盖率 99% 为首轮工程目标，真实源码全部纳入；fixture、测试文件与生成文件按具体路径排除并说明理由。不得通过空测试、扩大 ignore、整包排除或全局关闭检查满足门槛。其它复杂度与重复代码规则按 KG OS 的真实源码配置，不复制 Noven 解析器的专用放宽项。

### 真实扩展、CI 与交付物验收

Phase 0 的真实扩展 smoke 只证明开发环境可以在 Node.js 中加载 Lithograph、初始化临时数据库、执行只读常量 Cypher、读取结果并释放连接。它不提前承诺最终 SQLite driver / Native adapter 选型：后者仍须满足[同一个 SQLite connection](runtime.md#lithograph-调用入口)和完整 Graph 合同，不能因 SQL 探针成功就认为 Native streaming 已解决。

测试使用固定版本或 commit 对应的 extension artifact，记录平台、架构、来源和 SHA-256；获取或构建步骤由 setup / CI 明确执行，不依赖相邻 `/Users/yi/Code/Lithograph` 工作树或手工拷贝。数据库放在临时目录；需要 Provider 的后续用例使用受控 fixture，不调用开发者的真实模型服务。真实 artifact 缺失时 `test:native` 必须明确失败并报告依赖，独立的 TS / Web 工作仍可继续，但整个 Phase 0 不得据此标为完成。

GitHub Actions 从空 checkout 安装固定工具链，并按锁文件安装依赖、浏览器和原生测试资源；本地已安装的依赖、缓存或 `dist` 不能成为成功前提。首轮至少记录当前 macOS 开发机与 Linux CI 的实际验收结果；这只是工程验证范围，不由此扩大最终产品的平台支持承诺。缓存用于加速，cache miss 也必须可完成安装与检查。

本地 pre-commit 使用快速检查；CI 及阶段收尾执行完整 `validate`。失败时保留相应日志、覆盖率、浏览器 trace 和交付物检查结果。已配置 workflow 与远端 job 已通过分别记录；提交 / 推送仍按任务授权处理，没有远端执行证据就保留对应验收未完成。

打包验证在 workspace 外的临时目录进行，运行构建后的 CLI 和 HTTP 宿主 / Web 壳层。它必须验证资源进入交付物、开发依赖不成为运行前提、声明的运行依赖可以安装或已随产物包含、package exports 与类型可解析。测试正式 daemon 时仍按 Runtime 准备 extensions / config / auth；壳层 smoke 不冒充正式启动验收。独立 Native probe 与打包 smoke 分别记录，不把它们合并描述为全部数据库接入通过。

### Phase 0 完成清单

- [ ] P0-01 至 P0-08 的交付物存在且逐项验收有结果。
- [ ] 新 checkout 可按说明完成 setup；工具链与锁文件一致。
- [ ] dev、热更新、断点、CLI 帮助 / 版本、资源清理实际可用。
- [ ] 所有通用质量检查都有实际执行记录；没有靠空项目、占位测试或静默跳过得到通过。
- [ ] 浏览器、HTTP / CLI 与真实扩展测试通过，测试不污染默认 `KG_HOME`。
- [ ] 完整 build、包类型 / exports 与干净目录打包运行通过。
- [ ] CI 必要 job 的实际结果已核对；本地结果与远端结果分别记录。
- [ ] 开发说明、README、设计状态和 vlog 与实现一致；业务实现和底层集成的剩余项仍准确可见。

### 参考与维护责任

工程基线与本阶段任务由本节维护；产品运行规则仍归 [Runtime](runtime.md)，产品 / 数据语义仍归各 owner。P0-08 在实际命令可运行后补充面向开发者的使用说明，不把本节待实施命令直接冒充已发布功能。

2026-09-19 已只读核对 Noven 的 `package.json`、workspace / tsconfig、ESLint、Vitest、dependency-cruiser、Lefthook、Makefile 和打包验证脚本。参考其通用工程方式；Noven 的语言解析器、GraphQLite、项目 IPC、业务搜索、专用版本 overrides 与发布仓库不属于 KG OS 工程模板。本轮没有运行 Noven 完整验证。

工具能力依据：[pnpm workspace](https://pnpm.io/workspaces)、[TypeScript moduleResolution](https://www.typescriptlang.org/tsconfig/moduleResolution.html)、[Vite middleware](https://vite.dev/config/server-options.html#server-middlewaremode)、[Vitest coverage](https://vitest.dev/guide/coverage.html)、[Playwright](https://playwright.dev/docs/intro)。实际兼容性仍由 P0-01 及相应运行测试证明。

## 剩余依赖与工程合同

Ontology 已确认渐进式读取与 Domain/Definition aggregate 编辑；不能因为仍需实现 compiler，就把它退回“模型尚未设计”或要求 AI 操作单独的 Property/Constraint/Index。逻辑字段和行为只在各 owner 文档维护。

[模型修改](ontology.md#patch-到真实变化)、[批量 Object Patch](object.md#object-公共调用合同)与 [Merge Session](evolution.md#evolution-公共调用合同)的产品规则已经确定，剩余工作是 compiler、底层事务与冲突映射的实现和验证。[只读连接与自动缓存](#managed-semantic-integration-readiness)同样已有目标行为，尚缺底层接入证据。这些工程待办不表示需要重新确认对应核心设计；Web 页面细化单独见 [Runtime](runtime.md#web-交互设计状态)。

| 已确认的合同 | 工程工作 |
| --- | --- |
| Ontology Overview → 可选 Domain → Definition，无 search；1..100 Ref batch read | 单次 State pin、输入顺序、per-Domain cursor、batch all-or-nothing、描述缺省提示与有界图预览 |
| Node/Relationship 聚合 Property、required/unique、Constraint/Index | 从公开 Graph Type/SHOW 与 semantic graph 反向构建逻辑值；编译到数据库，不建立 owner-only 公共 structure AST |
| Domain/Definition canonical YAML + 唯一 Object Patch | 标准 YAML/Git parser、exact apply、input-only renameFrom、语义差异、共享资源去重和冲突定位 |
| 单 State、strict base、无隐式数据损失 | SQL `tx_*` 封装接入 Lithograph explicit transaction；验证 DDL/DML 顺序、即时约束、引用改写、Knowledge data rewrite 与 index maintenance |
| Binding / Object Graph View / reserved identifier | 空库 bootstrap、Object / Ontology 的双向覆盖与内部数据投影校验；不作为公共 Graph Cypher 的执行条件 |
| 通用 SQLite Extension startup runtime | local/HTTPS source resolve、SHA-256 pin、safe archive extract、content-addressed cache、ordered per-connection load、Lithograph capability validation；不按插件用途建 loader |
| 全局 Full-text analyzer + 简化 Ontology | `type: fulltext` 只编译业务 targets/properties；新建/业务重建时写当前 `[fulltext].analyzer` + `eventually_consistent=false`，已有 versioned analyzer 保留，connection probe 当前 analyzer；不做 config migration |
| Lithograph Managed Semantic + 简化 Ontology | Provider extension 装配、默认配置到 versioned IndexDefinition 的映射、String query、读写连接选择与 cache policy；不实现 embedding HTTP client、向量 Property 或写入/合并刷新 |
| Evolution 统一历史与 Merge Session | Definition 内字段级历史；shared resource 单次 conflict 投影；固定 revision 的 candidate 检查 |
| CLI / SDK / Web 共享合同 | `KG_HOME` target discovery、Bearer authentication / `AUTHENTICATION_FAILED` mapping、ontology batch Markdown、batch --edit YAML multi-document stream、ontology scoped patch、Object JSON、Graph NDJSON、HTTP metadata 与错误映射 |

### Ontology compiler / decoder

实现先从目标 State 的公开 Schema 与 metadata 得到完整源信息，再建立本次操作的 source mapping，区分字段自带规则、具名约束、derived backing index 和独立显式索引。该映射是 operation-local 工程数据，不是新的公共结构、不作为第二份 Schema 持久化。

反向读取必须保留真实的 index/constraint name、target、字段顺序、类型、端点语义及配置。相同公共值能通过多种底层 DDL 实现，不要求 AST/资源数量一一对应；但不能把另一种 coverage、复合约束或多目标索引简化成语义不同的 Boolean。

正向编译先比较公共逻辑变化，再保留未修改的来源与配置，计算必需的底层变动。一次 Node/Relationship Patch 可同时改变 Schema、Constraint、Index 和 Binding；shared resource 使用一个规范化变化计划。新建时源映射为空，按 ontology.md 的命名/默认规则选择最小合法计划。不能靠临时 UUID、公共 owner registry 或 raw Schema escape hatch 填补 mapping。

公开 type/required/from/to 能力由 Lithograph Schema/Constraint 实际执行，KG OS 做的是输入、依赖与编排校验，不实现另一套数据库运行时约束引擎。

### Mutation planning

执行链路复用 Object contract：parse → exact apply → 公共值 → explicit delta → shared-resource normalization → derived reference / maintenance → conflict/dependency check → SQL `lithograph_tx_begin(expectedHead)` → SQL `lithograph_tx_execute` 执行标准 Cypher → SQL `lithograph_tx_commit`。这里的 expectedHead 属于 begin 的 JSON options；具体参数与 connection 边界见 [Runtime 调用入口](runtime.md#lithograph-调用入口)。

实现必须证明中间每条 statement 符合 Lithograph immediate semantics，不能只比较最终 Schema。对合法上层目标可采用同 transaction 内受控 drop/recreate 或先改写受影响数据再施加约束；语义保持要求仍由公共合同约束。新 alias result capture、顶层 Ref transition 与 Property Binding continuity 都在这一个边界内完成。Semantic source 写入不做 embedding；Semantic definition 新建 / 改变只执行本地 Provider/config validation，因此 Patch 不再需要在 writer 外预计算向量再回填内部 Property。

### Adapter 与运行时

Ontology batch read 在 daemon/kernel 层先解析一次 State，再读取全部 refs；adapter 不能通过循环读取 `branch/...` 模拟 batch，否则 Branch 移动会产生跨 State 结果。Batch `--edit` 要先取得并验证全部 Object bodies，再一次性写 stdout；任一失败不得留下半个 stream。单个 body 继续使用 Object canonical renderer，multi-document marker/comment 由 CLI framing 层添加。`ontology patch` 与 `object patch` 只有一套 request/result/compiler，前者只做 kind scope validation。不得让 CLI、Web、SDK 对缺失字段、删除、rename、shared resource、baseState 产生不同解释。Knowledge 保持直接 Cypher，不文件化。

**`kgosd` runtime implementation**：`kgosd` 与 Kernel 使用 TypeScript + Node.js，Web 构建产物随 daemon 交付，由同一进程与端口提供页面、API 和 control。v1 已确认 IPv4 HTTP、`KG_HOME` profile、根目录 `kgos.db` 单库、persistent `auth.json` 与客户端 `KG_TOKEN` Bearer authentication、显式 daemon lifecycle。SQLite host 按统一 resolver 装配 Lithograph、OpenAI-compatible Provider 和其它扩展；由 Runtime owner 定义 Full-text / Embedding 默认值及 Lithograph 内部 cache policy。

SQLite Extension resolver 先把全部 configured source 固定为 daemon-local immutable artifacts：local/HTTPS input、remote mandatory SHA-256、HTTPS-only redirect、direct library/archive 分支、`library` exact member、safe extraction 与 content-addressed cache 都必须在 database connection 进入可用生命周期前完成。每个新 connection 按 config order 通过 SQLite 驱动加载同一批 resolved artifacts，extension loading 只在 connection initialization window 开启；任一 load 失败拒绝该 connection。配置本身不标记 `kind=lithograph`。按 [Runtime](runtime.md#sqlite-extension-source-resolver)验证目标 connection 的公开 SQL 能力；仍需 Native 的 adapter 只从同一批 artifacts 绑定唯一兼容 provider，并使用已完成 extension registration 的同一个 SQLite connection。实现不能把下载放到 connection checkout 热路径、不能让不同 connection 因 source 更新加载不同 binary、不能实例化第二套 private SQLite，也不能通过业务 SQL/Cypher 暴露任意 extension loading。

Full-text runtime 在 extension load 后对当前 `[fulltext].analyzer` 做 connection-local FTS5 probe。Ontology compiler 对新建或业务定义变化后必须重建的 KG OS-managed `type: fulltext` 生成当前 analyzer 与 `eventually_consistent=false`；已有 IndexDefinition 未被本次业务 Patch 触碰时保留其实际 versioned analyzer。Decoder 有意不把 analyzer 暴露到公共 Ontology，因此不同 analyzer 不构成 public-profile mismatch；其它无法安全解释的未公开 Full-text 配置仍按 consistency boundary 拒绝。实现不维护 fulltext fingerprint/generation，也不因为 runtime config 改变迁移已有 State。

Embedding compiler 校验当前 `[embedding]`，按 [Runtime 映射](runtime.md#embedding-配置与索引映射)生成 `provider: openai-compatible`、versioned providerConfig 与 index dimensions/similarity。只接受 `api_key_env`，将变量名而非 secret 写入配置；明确 `send_dimensions=false` 与 `encoding_format=float`。Schema 创建使用 `db.index.semantic.createNodeIndex/createRelationshipIndex`，Graph 检索使用普通 String + `queryNodes/queryRelationships`。KG OS 不实现 HTTP、batching、source framing、`SemanticText` 预处理或第二套 Cypher parser。

`[cache]` 继续缺省 `enabled=true,max_size_mb=4096`；启动时通过公开 `cache.configure` 设置 Lithograph operational policy。source / query embedding 都由正常查询自动查缓存、miss 调 Provider、成功后发布持久缓存，详见 [Runtime](runtime.md#embedding-result-cache)。不新增独立 cache.db 或预热入口；物理只读连接无法发布缓存的现状必须在底层接入中解决，不能把内存命中算作持久复用。

修改 `[fulltext]` / `[embedding]` 后 restart 只改变以后新建 / 必须重建索引的默认值。已有索引保留真实配置，历史查询使用目标 Snapshot 的 IndexDefinition；实现不得用当前默认值覆盖未编辑的底层配置，不批量迁移历史或增加 `migrating` daemon 状态。

### TypeScript 运行时与数据库接入

语言与交付边界已由 [Architecture](architecture.md#v1-运行时与技术分层)及 [Runtime](runtime.md#web-hosting)确定；以下是工程工作，不要求重新确认 Rust / TypeScript 或 Web 是否独立部署：

1. **Node.js SQLite driver / adapter**：选择能够加载 configured extensions、维护只读 / 读写连接、参数与错误映射的接入方式；用真实扩展验证。所需 Native 调用必须与驱动共用同一个 SQLite 实例和 connection，不能另开一个库或另一套 SQLite 来模拟。SQL `tx_*` 可用不等于 Graph streaming / external I/O / transaction subquery 已获得等价 SQL surface。
2. **SQL 显式事务**：按 [Runtime 调用入口](runtime.md#lithograph-调用入口)实现 connection checkout 到 commit / abort 的完整链路，验证 expectedHead、事务内结果、单 Commit、取消及失败清理；保留 Object Patch 的 strict base / no-op 行为。底层 SQL 封装先在 Lithograph 完成，KG OS 以实际公开接口和测试对接，不复制事务状态机。
3. **执行与响应生命周期**：落实 Node.js 下长查询、Provider 等待、流式返回、取消与 daemon stop 的执行调度，验证 API/control 能按既有合同工作；具体驱动与线程调度属于工程实现，不在本轮新增第二个独立服务。
4. **内置 Web**：构建产物进入 `kgosd` 交付物，随 daemon 一次启动即可访问；验证页面、静态资源和已认证 API/control 使用同一 configured host/port，停止 daemon 后不存在独立存活的 Web 服务。页面布局与框架沿用 Web 后续工作，不把开发工具启动方式当作产品部署要求。

### Managed Semantic integration readiness

采用 Phase 13 后，旧方案中的 managed Property 隔离、mutation/merge 向量刷新、writer 外预计算向量再提交，不再是 KG OS 的实现前置条件。embedding 不属于图属性或 Commit，纯业务写入不访问模型服务。

本轮已确认 Graph 不审查 Cypher 内容；旧的 procedure 白名单、Graph caller-owned Vector / reserved identifier 提交前检查不再是实现前置条件。仍须完成以下工程验证，不能把文档决定当作接入已完成：

1. **读写连接执行**：Graph `query` 选择只读连接，`execute` 选择读写连接；以真实 Node.js SQLite / Lithograph adapter 执行证明底层拒绝只读入口中的写操作，正常执行允许的读取。`LOAD CSV` / Semantic I/O 不能因误用 `lithograph_rows()` 而被拦截；KG OS 不解析 Cypher、不实现 procedure 黑白名单、不把失败写入重试到写连接。
2. **只读查询与持久缓存**：当前 Lithograph 工作树在可写 `main` 上已有普通查询 publish 路径，但物理只读时跳过它。按 [Runtime](runtime.md#cypher-执行连接)同时满足只读执行与内部自动缓存；具体机制仍需底层公开合同和集成证据，不在 KG OS 增加缓存层或改成用户预热。缓存充足且未淘汰时，以 Provider 调用次数证明跨连接 / 重启复用，同时证明业务 graph/schema/history/ref 未被查询修改。
3. **原样 Cypher 与请求上下文**：公共 Graph 不附加排除内部节点的 `graphView`，完整传递 Lithograph JSON 值。验证 `at` / 默认 Branch / `author` / `message` 与 Schema / Version Procedure 的公开参数合同；不能无条件把 Native `branch` option 附加到不接受它的 procedure，也不能按 procedure 名维护 KG OS 特例表。使用底层公开连接或 execution 上下文机制；现有公开能力不足时记录准确缺口，不另写解析器。连接 checkout 不得在请求间泄漏，事务 / 部分提交结果不得伪装为统一单 Commit。
4. **真实扩展与版本配置集成**：在各实际 sqlite3 connection 上加载同一批 Lithograph 与 Provider，通过实际采用的 SQL / Native adapter 验证 create/query、历史配置保留、取消、错误 / 值映射及上述连接与缓存行为。只有 SQL 函数、ABI symbol 或文档声明不能证明 Node.js 集成通过。

Ontology 首版只实现单字段语义索引，联合检索沿用 Lithograph；`filterProperties` 与过滤范围内 top-k 的实际边界见 [owner 范围](ontology.md#语义索引的首版范围)。不增加未确认的底层过滤接口；缓存自动填充已经确认，不再列为需要用户设计的预热入口。

`KG_HOME`、单库、认证和通用 extension loader 的已确认边界保持；Object / Ontology / Evolution 的高层一致性校验保留，不能把它们重新挂到 Graph 透传路径。

## 工程实现待办

实现前检查 Lithograph 实际文件与测试，不复制它的 Phase 状态为 KG OS 真源。当前 KG OS 仍只有文档，以下都是待实现工作。

1. 建立 TypeScript / Node.js kgosd runtime/SQLite host：实现 `KG_HOME`、`auth.json`、Bearer middleware、根目录 `kgos.db`、统一 extension resolver/per-connection loading、Lithograph SQL transaction / 所需 Native / Managed Semantic 能力验证与 cache policy 配置；再完成 empty-database bootstrap。同一 HTTP server 承载 API/control 与内置 Web 资源。
2. 实现 ontology.md 的 semantic graph、Binding coverage、Schema Locator 与 Object / Ontology Graph View；高层 Object / Ontology 输入保留 reserved identifier 校验，公共 Graph 不复用该限制。
3. 实现五种公共 Object Ref、aggregate decoder 与 Knowledge 原生 Object value；canonical YAML / JSON 省略空的顶层 `indexes`，保留非空复合 / 共享索引。
4. 实现 Ontology read 的全局/Domain/Definition 展开与 1..100 Ref batch，同一次请求只 pin 一个 resolved State；实现 Object read/list，Object search 限定 Knowledge，不为 Ontology 加旁路搜索。
5. 实现共享 Object Patch compiler，覆盖聚合内字段/规则/索引、多 aggregate 原子修改、alias、显式 rename、no-op、冲突、rollback；不实现单独 Schema resource CRUD。
6. 实现 Graph query/execute：选择只读 / 读写连接，原样传递 Cypher 与 Lithograph JSON 值；不设 procedure、Vector 或 reserved identifier 检查。完成上述连接、上下文与缓存集成验收后再报告可用。
7. 实现 Evolution read/state/ref/history/diff/merge，内部 schema slot 转为 aggregate 字段，固定 candidate revision 检查一致性后 finalize。
8. 按 CLI / Runtime 文档实现 TypeScript/npm CLI / SDK、Ontology batch Markdown / batch-edit YAML stream / scoped patch、YAML/JSON/NDJSON 输出与 daemon 生命周期，并把 Web 页面构建产物接入同一 kgosd 交付 / 启动流程；提供 Skill/SDK/Web 使用文档。

Web 还需细化页面布局、导航与具体操作交互，状态由 [Runtime](runtime.md#web-交互设计状态)记录。页面细化是同一产品的前端工作，不产生单独部署的 Web 服务，也不是上面 Kernel、daemon、CLI 或 SDK 开工的前置条件；当前文档不把尚未细化的页面标为已设计完成。

## Ontology 专项验收

下表是**后续实现需要运行的验收场景**，不是本次已通过的运行测试。设计文档的文本/示例校验另记开发日志。

| 场景 | 必须证明的结果 |
| --- | --- |
| 无 Domain；多个 Domain；多父级；cycle | 每个 Definition 从全局可达，单次响应有界，不递归爆炸、不强制建 Domain |
| 说明缺失、同名不同 kind | 明确缺省提示、typed Ref 消歧，不猜业务语义，不自动添加 search |
| Root/Domain 大集合 | total/cursor 与 State 一致，无静默截断；Overview 不可写 |
| 多 Ref batch read | 1..100 个 Domain/Definition 只解析一次 State，按请求顺序返回；重复/缺失/invalid ref 或整体资源超限时不返回 partial success |
| batch Domain pagination | limit 对各 Domain 独立生效，各自 cursor 可用同一 resolved State + 单 Ref 继续；多 Ref 请求不能提交单个 cursor |
| Definition 普通 read 与 --edit | 阅读有真实查询信息；编辑正文与 Object read canonical YAML 相同 |
| Definition 至少一个字段 | Node / Relationship Definition 的空 properties，或删除最后一个字段后仍保留类型的 Patch，在编译前返回 INVALID_ARGUMENT；不自动补字段，不把声明字段等同于实例必填，不把该检查施加到公共 Graph |
| 标准 YAML 无损往返 | 使用标准库，以原始逻辑值验证 parse(render(value)) 相等；覆盖行首/行内/行尾空格、普通多行、空字符串、纯空白/换行、CR/LF、转义字符与 Unicode，并验证相同值输出确定；YAML 格式缩进不作为 String 内容比较 |
| 顶层 indexes 可选 | 缺省与 [] 逻辑等价且 canonical 均省略；空数组规范化不产生 Commit；非空复合/共享索引不丢失 |
| 多 Ref batch --edit | 输出是合法 YAML 1.2 multi-document stream；每个 document body 与单独 canonical YAML 逐字一致，顺序与请求一致；state/ref framing 不进入 Object Value / Git hunk；任一目标失败时 stdout 为空 |
| ontology patch scope | 多 Definition/Domain Patch 与 object patch 得到相同 Ontology 结果；出现 Knowledge target 时在执行前整体拒绝；不建立第二 transaction/compiler |
| Document 新建及全文/语义索引 | aggregate 只声明业务 source fields；不出现 caller-managed embedding Property/model/dimension，真实 fulltext/semantic Index name 均可查询 |
| SQLite extension local source | absolute direct library 可解析到 content-addressed cache；启动期间 source 被替换后，本进程后续 connection 仍加载启动时固定的同一 artifact |
| KG_HOME default / override | 未设置 `KG_HOME` 时使用 `~/.kgosd`；设置两个不同 absolute profile 时 config/auth/lock/cache/extensions/log/kgos.db 全部隔离，每个 profile 只打开自己的根目录 `kgos.db`，没有 `data/` 中间目录和单-daemon多库 selector |
| Embedding cache defaults | 省略 [cache] 等价 enabled=true + max_size_mb=4096；启动通过公开 procedure 映射为 4 GiB payload 预算，不意外使用底层 1 GiB 默认值 |
| Embedding cache eviction/recovery | 使用 Lithograph FIFO / derived-cache recovery；disabled 不读写持久 cache；普通 query/source miss 成功后自动发布；失败不缓存、不留下半写 entry；不承诺数据库文件立即缩小 |
| 只读 query 与缓存 | 真实 Node.js adapter 查询拒绝业务写入，同时验证内部自动缓存及跨连接 / 重启复用；现有物理只读跳过 publish 的行为不能算作该组合验收通过 |
| Auth first startup / restart | 新 profile 缺 `auth.json` 时安全随机生成并原子写入；restart token 保持不变；malformed/unreadable auth file fail closed，不静默 rotate；secret 不进入日志/错误/State |
| Daemon HTTP authentication | API/control 缺失、malformed、错误 Bearer token 都得到 `401 + AUTHENTICATION_FAILED`；正确 token 才能读取/修改业务数据或控制 daemon；Web 不存在 credential-free data API |
| CLI credential boundary | CLI 只从 `KG_TOKEN` 取得 token，不读取 `auth.json`、不接受 `--token`；缺失/空 token pre-dispatch exit 2，错误 token 由 daemon 拒绝并 exit 1；两者稳定 code 都是 `AUTHENTICATION_FAILED` |
| SQLite extension remote source | HTTPS artifact 必须 SHA-256 pin；GitHub redirect 可解析；cache 命中可离线 restart；download/hash mismatch/unsafe archive/missing library/entrypoint failure 都 fail closed |
| SQLite extension archive 安全 | absolute/`..`/symlink/hardlink/special entry 与越界 library 拒绝；资源超限中止且不发布半成品 cache |
| SQLite extension connection lifecycle | 每个实际 SQLite connection 按同一顺序加载全部 configured extensions，随后关闭任意 load 权限；任一 connection 缺插件不能进入 pool |
| Lithograph 统一加载与 capability | 配置不声明 plugin kind；每个实际 connection 的公开 SQL 与所需 Native 能力均验证通过；Native provider 来自同一批 artifacts、唯一匹配且已在同一个 SQLite connection 注册，缺失/歧义/不兼容时拒绝开放 Knowledge Base |
| SQL explicit transaction | Node.js 通过同一 connection 调用 SQL tx_*；多次 mutation 只生成一个 Commit，expectedHead mismatch/执行失败/abort/关闭未提交连接不残留变更，不额外套 SQLite BEGIN/COMMIT；只读与 empty-delta 行为遵守底层合同 |
| TypeScript runtime 与内置 Web | 一个 kgosd 启动完成后，同一 configured origin 可访问 Web 页面、资源和已认证 API/control；无需独立 Web 服务，stop/restart 同时管理 Web 与 API；长查询与取消不破坏响应和事务合同 |
| Full-text config 缺省/显式 | 无 `[fulltext]` 等价 `unicode61`；显式完整 FTS5 specification 原样编译到所有 managed Full-text definitions；Ontology 不出现 analyzer/plugin/options |
| Full-text analyzer runtime probe | extension load 后每个 connection 验证当前 analyzer；未知 tokenizer/无效参数/缺运行资源返回 FULLTEXT_ANALYZER_UNAVAILABLE，不伪装为空结果 |
| Full-text State profile | analyzer 不在 public Ontology；已有 Index 保留 actual versioned analyzer，新建/业务重建使用当前 runtime analyzer；不同 analyzer 本身不被 decoder 误报为 consistency failure，无法安全解释的其它 hidden config 仍拒绝 |
| Runtime analyzer change | 修改 `[fulltext].analyzer` 后 restart 正常 `running`，不扫描/迁移历史；已有 IndexDefinition 不变，之后新建/重建使用新 analyzer；旧 tokenizer 当前未加载时只让对应历史 Full-text query 返回 FULLTEXT_ANALYZER_UNAVAILABLE |
| Runtime embedding change | 修改默认配置后 restart；已有索引和历史 query 保持原 provider/config，新建 / 必须重建的索引才使用新配置 |
| Full-text query-time override 边界 | 官方 KG OS query 不生成 analyzer override；调用方手写 Lithograph override 时由 Lithograph 直接执行且只影响本次 query，不被 KG OS 误当为全局 config/State mutation |
| 同请求新建 Node/Relationship/Domain | alias 跨 entry 解析，与文本顺序无关，最终 from/to/includes 为正式 Ref |
| required / unique / 复合 KEY | 单字段和联合规则不混淆，类型/空值/冲突遵守对应数据库语义 |
| Object / Ontology caller-owned Vector | 高层 Object / Ontology profile 仍拒绝 Vector；Graph 直接执行不受该 profile 限制，后续高层读取按一致性合同处理 |
| Embedding config 缺失/非法 | 缺失或非法配置拒绝开放业务能力；api_key 字段拒绝，api_key_env 只存变量名，实际 secret 不进入 Schema/SHOW/history/log |
| Provider 暂时不可用 | Provider extension 缺失时 semantic 操作失败；扩展已加载而远端不可用时，只影响实际需要计算 embedding 的检索；普通 read/source write 继续工作 |
| Semantic source mapping | 首版单字段 exact UTF-8 source 直接映射 Managed Semantic；共享索引的每个 target 使用同名 source；明确拒绝多字段拼接声明，不静默截断、拆索引或恢复隐藏向量 Property |
| String + Semantic query | 用普通 String 调用 semantic query；不识别 $semantic marker，不预处理参数，不改变 Cypher bytes |
| raw Vector param/result | Graph 完整传递底层 Vector parameter/result（含嵌套值和 streaming），不新增 KG OS 类型；Semantic 内部 embedding 不自动成为图属性 |
| Semantic query result | RETURN n、properties/keys、projection/dynamic access 都无 embedding 属性；正常返回业务值与 score |
| Graph execute 写入 Vector | 合法值按 Lithograph Schema / Constraint 执行，不附加 KG OS staged public-profile validation |
| Graph execute 写 reserved identifier | 不因 `__kgos_` prefix 拦截原始 Cypher；Object / Ontology Patch 仍拒绝该 namespace，直接变更造成的高层 inconsistency 不自动修复 |
| Graph execute semantic target/source mutation | 普通 source mutation 不调用 Provider、不附加 KG OS profile 检查或修复 Commit；提交 / rollback 按所执行 Cypher 的底层事务语义 |
| Graph LOAD CSV / SHOW / Version Procedure | 不加语句清单或固定 Knowledge graphView；只读入口拒绝写入，读写入口按底层合同执行；上下文选项不额外阻断合法 procedure |
| Graph invalid high-level Snapshot | 缺失 Binding 或不符合 Object profile 不阻止 Graph 查询 / 执行；高层 Ontology / Object / Evolution 仍按各自合同报错 |
| Graph transaction subquery / streaming failure | 保留底层事务和已提交批次语义；缺失 final summary 不声称整条语句没有副作用，不自动重放未知结果的写入 |
| hybrid fulltext + semantic | 两者可以复用同一 String 参数；遵守底层组合语义，post-YIELD WHERE 不冒充过滤范围内 top-k |
| semantic-source mutation | Object Patch/Graph execute 保存 source 不依赖远端模型；后续 query 使用目标 Snapshot 的文本 |
| semantic-source merge | 合并业务 source 与索引定义，无 embedding slot/conflict/refresh；新增或改变定义只需本地 Provider validation |
| Semantic create / cache rebuild | 创建索引不遍历正文、不发 embedding 请求；新增/变更 definition 与其它 Patch 原子提交；独立 cache rebuild 不进入 Commit |
| 多字段/多目标 Full-text | 保留完整覆盖范围，不拆成不等价的多个索引 |
| shared Index 从任一 Definition 编辑 | 相同 delta 合并一次；不改另一份上下文也成功；矛盾目标整体失败 |
| shared targets 减少、整条删除 | 范围变更与全局删除有明确区别，不删除正文；Semantic DROP 不误删其它索引/历史可复用的共享 cache |
| 单字段 Range / Full-text 索引改为复合 / 多字段索引 | 按资源名识别延续并保留有序 properties；必须重建时遵守所属索引的默认配置规则 |
| 只改 description | 只有 semantic delta，不触发 Schema/Index rebuild |
| 无变化与纯排版变化 | strict base check 后返回原 State，不建空 Commit |
| 顶层 rename 与 Property renameFrom | 真实 Knowledge、Binding、端点/Index/Constraint 引用共同更新，不靠相似度 |
| 删除字段或 Definition，仍有数据/共享依赖 | 无隐式数据损失；可在同一 Patch 明确处理依赖，否则诊断聚合位置 |
| 目标合法但中间 DDL/DML 有约束 | planner 找到合法原子序列；任何失败不产生中间 durable State |
| stale base、重复字段、未知字段、无效 type/索引 | 分类正确并拒绝整个请求，不 fuzzy apply、不忽略输入 |
| rename 后/历史 Snapshot 再读取 | Schema、semantics 与索引来自同一历史 State，不用当前数据解释历史 |
| 多 Label 与作用范围重叠 | 不能局部改名时覆盖另一模型或其它 key；同一数据所有生效约束都保留 |
| shared resource History / Merge | 以 Definition+path 表达，同一 native conflictId 不因多处展示重复解决 |
| Object reserved/internal targets 与旧 Object Ref | Object 不暴露或误写内部资源；该投影边界不应用于 Graph Cypher |
| read → no-op → read；edit → compile → read | 公共逻辑 round-trip，保留未编辑的图数据、名称、选项与作用范围 |

## 参考证据

2026-09-19 本轮只读核对 Lithograph 工作树（HEAD `598829c`，含本轮未修改的未提交变更）：`docs/design/interfaces.md` 的 Native、Graph View、procedure context 与 external I/O；`docs/design/vector.md` 的普通 query/source 自动缓存和物理只读跳过 publish；`crates/lithograph-core/src/query/managed_semantic.rs` 的 `publish_query_embeddings`。本次只是当前文件与实现路径核对，没有运行 Lithograph / KG OS Native 集成测试，不证明这些底层改动已经交付或上述只读缓存组合可用。

公开语言参考（2026-09-15 核对；Lithograph 冻结 profile 而非未来网页变化决定实际支持范围）：[Constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/)、[Full-text indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/)、[Vector indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/)。研究证据不覆盖 ontology.md 的上层产品决定。

实现、验证、提交和推送分别按真实执行结果报告；文档完成不代表 KG OS compiler 或依赖库集成已经通过验收。
