# Phase 08：TypeScript Client & npm Runtime Distribution

## 1. 目标

把 Phase 00–07 已完成的 Go CLI 客户端实现迁移到新的 v1 Client 架构：

```text
@kgos/cli (TypeScript)
        │
        ▼
@kgos/sdk (TypeScript)
        │ HTTP
        ▼
kgosd (Go)
        │
        ▼
KG OS Kernel / Lithograph
```

同时把本地实例定位从 `KG_HOME` / `KG_TOKEN` / fixed install distribution 收敛为显式 `--root`，把 `kgosd` 与 official native extensions 通过 platform-specific npm packages 分发，使 `npx --yes @kgos/cli@<version>` 成为 AI / CI 正式客户端入口。

本 Phase 只迁移 Client / local Runtime distribution 与 Instance addressing；不重新实现 Object / Graph / Evolution 业务语义，不修改 Lithograph 数据库合同，不展开 Web 页面设计，也不把实际 npm registry 发布冒充实现验收。

## 2. 状态

`done`

Design Inputs、Phase 00–07 前置能力、08.1–08.8实现、Acceptance、Review、本地/fresh-source验证与要求的 pushed 四平台 native/package matrix均已取得真实成功证据。Phase 08 完成，不包含 npm registry publish、Git tag、dist-tag 或 release announcement。

## 3. Design Inputs

- [Architecture：v1 运行时与技术分层](../../design/architecture.md#v1-运行时与技术分层)
- [Client SDK 与 npm 分发](../../design/client.md)
- [CLI](../../design/cli.md)
- [Runtime](../../design/runtime.md)
- [公共错误合同](../../design/contracts.md#公共错误合同)
- [D75 TypeScript client](../../design/decisions.md#d75-typescript-client)
- [D76 npm distribution](../../design/decisions.md#d76-npm-distribution)
- [D77 explicit instance root](../../design/decisions.md#d77-explicit-instance-root)

业务 command / wire 语义继续引用 Ontology / Object / Graph / Evolution owner；本 Phase 不复制它们。

## 4. 前置依赖

1. Phase 00–07 保持 `done`，其 Go CLI E2E 与 HTTP contract作为迁移基准。
2. `kgosd` / Kernel / Lithograph Host继续使用 Go；SQLite streaming/cancellation/transaction基线不重写。
3. npm workspace、Node.js / pnpm、TypeScript build/test基线继续复用 Phase 00。
4. 当前 Lithograph artifact mapping 已覆盖 macOS / Linux arm64/x64，但 KG OS 已有真实平台证据只有 macOS arm64 + Ubuntu 24.04 x64；其余 target 必须在本 Phase 对应 native runner 取得新证据。Linux package按实际构建声明 `libc`，v1只验收 glibc，不推定 musl/Alpine兼容。

## 5. Feature 顺序

```text
08.1 Public TypeScript SDK
  -> 08.2 TypeScript CLI parity
  -> 08.3 Explicit Instance Root + init/doctor
  -> 08.4 kgosd --root + per-instance dynamic endpoint/auth
  -> 08.5 npm native Runtime packages
  -> 08.6 Runtime ensure / package integration
  -> 08.7 Go CLI removal + repository cleanup
  -> 08.8 Cross-platform integration / review closure
```

SDK 先建立唯一 HTTP client，CLI 再基于 SDK 迁移；不得先复制一套 TS CLI HTTP client后再补 SDK。

## 6. Features

### 08.1 `@kgos/sdk` Public TypeScript SDK

- 将 `packages/sdk` 从 Phase 00 metadata壳层实现为真实公共 client package；
- 提供 Ontology / Object / Graph / Evolution namespace和对应 public request/result/error types；
- endpoint + token显式注入，SDK不读取Instance文件、环境变量或npm Runtime package；
- 使用标准 `fetch` / Web Stream compatible能力，保持Node与browser可用；
- non-stream JSON、Graph NDJSON async streaming、daemon public error与transport error全部有稳定TypeScript映射；
- 不自动翻页、不自动retry write、不自动resolve/finalize Merge；
- package export、ESM、declaration files与版本保持可发布状态。

### 08.2 `@kgos/cli` TypeScript CLI Parity

- 建立 publishable `@kgos/cli` package，只暴露一个 npm bin `kg`；AI / CI 正式入口支持 `npx --yes @kgos/cli@<version>`，人类交互可省略 npm `--yes`；
- CLI / SDK / Runtime package manifests准备为public scoped packages，不保留`private: true`；Phase只验证pack/publish metadata，不执行registry publish；
- `@kgos/cli` 对 `@kgos/sdk` 使用exact same-version dependency，不能用宽范围让CLI与SDK transport版本漂移；
- 迁移当前命令树：`doctor`、`init`、Ontology、Object、Graph、Evolution / Merge；
- `install` 不再存在，原初始化职责改名为 `init`；
- 业务命令统一调用 `@kgos/sdk`，不直接维护第二套HTTP request/response decoder；
- 保持当前AI-first输入输出合同：JSON-first、`--pretty`、stdin/file互斥、Object raw body、Graph partial stream、stderr public error、exit code、English/中文human-facing text；
- current Go CLI tests按行为迁移为TS unit/integration fixtures，不能因语言变化弱化已验收边界。

### 08.3 Explicit Instance Root + `init` / `doctor`

- 全局 `--root <path>` 成为所有Instance命令的唯一实例定位输入；`--help` / `--version` 不要求root；
- 删除 `KG_HOME`、默认 `~/.kgosd`、`KG_TOKEN` credential override及相关fallback；
- root解析为确定的absolute Instance Root，同一 invocation所有config/auth/lock/database/cache路径都来自这一root；
- `init` 只创建完整Instance config和必要目录，不启动daemon、不创建`auth.json/kgos.db`、不bootstrap；
- `doctor`保持side-effect-free，检查root、config、native Runtime package、required env、auth/database/daemon实际状态；
- 缺失 `--root`、root shape冲突、已存在非法config等均使用稳定local error，不猜默认实例。

### 08.4 `kgosd --root` 与 Per-Instance Runtime

- `kgosd` 改为要求显式 `--root <absolute-instance-root>`，删除 `KG_HOME` dependency；
- one root = one config = one auth token = one `kgos.db` = at most one active daemon；
- CLI-managed daemon只绑定 `127.0.0.1:0`，由OS分配当前空闲port；Instance config不保存server host/port；
- `kgosd.lock`继续由daemon持有OS exclusive lock，并发布至少`pid/endpoint/version`；lock不保存token；
- TypeScript CLI不实现第二套native file-lock inspector；并发/竞态由daemon自身exclusive lock仲裁，CLI只消费locator并在需要时spawn contender / 等待winner；
- `auth.json`继续是唯一server credential真源；首次daemon启动secure create，之后restart复用；
- CLI只能把同一root的`kgosd.lock.endpoint`与`auth.json.token`组合成SDK client；stale/wrong endpoint必须因transport/auth fail closed，不能fallback其它root或token；
- 首次业务命令仍负责lazy create `auth.json/kgos.db` + bootstrap后执行原始request。

### 08.5 npm Native Runtime Packages

- 建立 `@kgos/runtime-darwin-arm64`、`@kgos/runtime-darwin-x64`、`@kgos/runtime-linux-arm64`、`@kgos/runtime-linux-x64`；
- 每个 package 包含同版本 `kgosd`、Lithograph、OpenAI-compatible Provider与native manifest；
- package 使用 npm `os/cpu` metadata 并由 `@kgos/cli` exact-version `optionalDependencies` 关联；Linux package同时声明 `libc=glibc`；CLI 必须处理 optional dependency 被 omit 或缺失的情况并 fail closed；
- CLI与native packages不使用preinstall/install/postinstall脚本下载或选择binary；packed `kgosd`直接保留目标平台executable mode；
- manifest验证version/platform/arch与全部required native file SHA-256；
- SQLite extension固定加载顺序为official Lithograph → official Provider → caller additional config order；caller不能覆盖或插入official slots；
- official extension path不写入Instance `config.toml`；daemon从自身Runtime package发现official artifacts并在startup固定到Instance content-addressed extension cache；
- caller additional SQLite extensions继续使用现有通用source resolver，不被npm package topology替代。

### 08.6 Runtime Ensure / Package Integration

- CLI按当前platform/arch解析唯一native Runtime package，unsupported target稳定失败；
- active daemon存在时读取root runtime locator并使用root token验证；不同/不兼容Runtime version fail closed，不静默kill或upgrade；
- 没有usable active daemon时spawn当前native package的`kgosd --root ...`，并发spawn继续由daemon OS lock收敛为单owner；
- CLI等待endpoint publication后读取同root token并构造`KGOSClient`，直接执行原始业务request；不为Runtime ensure新增health/control API，wrong endpoint由原始Bearer request在进入Kernel前fail closed；
- npm/node_modules/cache路径不得持久写入Instance config、Knowledge Base State或State Data；
- daemon startup固定后的SQLite connection不能依赖npm cache源文件继续存在。

### 08.7 Go CLI Removal / Configuration Cleanup

- 只有08.1–08.6的parity测试通过后才能删除`cmd/kg`及Go CLI专用代码；
- 删除`KG_HOME` / `KG_TOKEN`、`kg install`、fixed server host/port、official distribution-path config与不再可达的测试/脚本；
- 保留仍由Go daemon / Runtime host使用的公共Kernel、HTTP、buildinfo、SQLite resolver与native tests；
- repository build/package命令调整为TS CLI + Go daemon，不保留第二套旧distribution兼容层；
- 历史Phase 00–07证据继续保留为当时真实完成记录，不重写成从未使用Go CLI。

### 08.8 Cross-Platform Integration / Review Closure

- 从workspace外使用packed npm tarballs模拟`npx/npm exec`，完成`doctor -> init -> 首次Ontology -> Object -> Graph -> Evolution/Merge`主链路；
- 验证两个不同`--root`可同时启动两个不同daemon/endpoint/token并并发操作，绝不交叉访问；
- 验证stale lock、wrong endpoint、wrong token、daemon crash/restart、concurrent auto-start、version mismatch；
- 验证Graph streaming partial stdout/error/cancel仍与Phase 05行为一致；
- 在 macOS arm64/x64 与 Linux glibc arm64/x64 对应 runner 真实启动 native package 并加载 Lithograph + Provider，不用 cross-compile 产物存在代替运行证据；
- Review确认TS CLI没有业务语义复制、SDK没有local Runtime职责、Go daemon没有重新引入client-specific逻辑。

## 7. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | SDK contract | Ontology/Object/Graph/Evolution完整映射现有HTTP logical contract；Node/browser type/build成立；无local Runtime dependency |
| B | CLI parity | Phase 00–07已开放的CLI成功/失败行为、stdin/file、JSON/raw/stream、i18n、exit保持等价；`install`仅以`init`替换 |
| C | Explicit root | Instance命令缺`--root`失败；所有持久/运行状态只来自指定root；无`KG_HOME/KG_TOKEN`fallback |
| D | Instance isolation | 两个root有独立config/auth/db/lock/daemon/endpoint；并行操作无cross-instance状态 |
| E | Auth + locator | endpoint来自同root lock、token来自同root auth；stale/wrong endpoint不能误操作其它Instance |
| F | Dynamic runtime | CLI-managed daemon使用loopback动态port；同root只有一个active owner；CLI不依赖native lock inspector，concurrent start由daemon lock收敛 |
| G | npm runtime | CLI→SDK exact version、public package/bin/optionalDependencies/os/cpu/libc/target/version/hash metadata正确；无install-time binary下载脚本；packed kgosd可执行；CLI选择当前package，SDK mismatch或unsupported/omitted target fail closed |
| H | Runtime artifact ownership | official native path不持久化到config；startup后connection不依赖npm cache源；official → Provider → caller extra加载顺序固定，extra extension仍用通用resolver |
| I | Lazy bootstrap | `init`不创建auth/db或启动daemon；第一次业务命令完成create/bootstrap并继续原始请求 |
| J | Migration cleanup | TS parity通过后Go CLI与旧env/install/fixed-port compatibility code删除，无双实现长期存在 |
| K | Delivery gates | targeted、full validation、fresh-source/packed-package、四平台native matrix、final review全部通过 |

## 8. 关键失败路径

至少覆盖：

1. Instance命令省略`--root`；
2. `--root`指向普通文件、不可写父目录或非法已有Instance；
3. `doctor`面对不存在root保持零副作用；
4. `init`部分参数缺失的TTY/non-TTY行为与当前完整显式配置原则一致；
5. 同root并发`init`不能产生半写config；
6. lock不存在、stale、正在启动、running、crashed/unreachable；
7. 两个不同root同时启动且OS分配不同endpoint；
8. root A lock错误指向root B daemon时A token认证失败，不fallback B；
9. `auth.json`缺失/非法/权限错误、首次secure create与restart复用；
10. 当前CLI版本与active daemon/runtime version不兼容；
11. native optional package缺失、错误platform/arch、manifest缺file/hash mismatch；
12. npm cache/package源在daemon startup后不可用，新SQLite connection仍使用Instance-fixed artifact；
13. extra third-party extension与official Runtime extension加载顺序/失败保持fail closed；
14. SDK non-2xx error、malformed response、socket EOF、AbortSignal取消；
15. Graph stream在首event前失败、partial rows后daemon error、没有terminal event的transport failure；
16. Object body/YAML multi-document与Patch stdin/file语义迁移后不漂移；
17. Merge resolution strict JSON、explicit null/absence、pagination/revision error保持；
18. 删除Go CLI后build/package/test没有隐式引用`cmd/kg`；
19. 旧Phase文档/历史commit证据不被新设计改写成当前TS实现已完成；
20. packed `@kgos/cli` 从repo外执行时不依赖workspace路径或未声明dev dependency。

## 9. 验证计划

### Targeted

- `packages/sdk`：HTTP request/error/stream/types/browser-safe dependency tests；
- `packages/cli`：parser、`--root`、init/doctor、stdin/file、format/exit、Runtime resolver tests；
- `internal/runtimeprofile` / `cmd/kgosd`：`--root` paths、auth、lock、dynamic bind、official Runtime artifact discovery；
- npm runtime package builder：target metadata、manifest、hash、package contents。

### Integration

- 真实daemon + SDK：每个公共能力至少一条成功和关键错误路径；
- 真实CLI + daemon：Phase 00–07 CLI parity E2E；
- 双root：独立daemon/endpoint/token/database与wrong-endpoint认证隔离；
- packed npm package：repo 外 local tarball + `npm exec` / `npx --yes` 模拟真实入口，并验证首次 package acquisition 不会要求 KG OS 额外交互；
- native matrix：macOS arm64/x64 + Linux glibc arm64/x64真实extension load与首次bootstrap；musl不在本Phase支持矩阵。

### Repository gates

- 受影响TS/Go targeted tests；
- `pnpm check:quick`；
- `pnpm validate`；
- Go statement coverage继续满足仓库门禁，删除Go CLI后按实际Go production surface重新计算；
- TS coverage/type-coverage/lint/knip/package exports/npm audit/license gates保持；
- 独立fresh-source `pnpm run setup && pnpm validate`；
- packed npm packages从workspace外验证；
- `git diff --check`、Markdown links、untracked/generation hygiene；
- Phase要求的四平台native CI matrix真实成功后才可`done`。

`@kgos` npm scope 的实际registry ownership/permission属于发布前置，不要求Phase 08执行真实publish；Phase 08必须把package manifests与packed artifacts准备到可发布状态，但没有registry权限证据时不得声称已经发布。

## 10. Review 重点

- SDK是否真正成为唯一TypeScript HTTP client，而CLI/Web没有复制transport；
- CLI本机职责是否没有泄漏进browser-safe SDK；
- `--root`是否是唯一Instance定位，不存在隐藏HOME/token/default profile；
- endpoint与token是否始终来自同一root且wrong endpoint fail closed；
- per-root daemon是否真正独立，dynamic port与single-instance lock是否消除多库冲突；
- CLI是否错误增加了Node native flock依赖，或绕过daemon lock自行判定owner；
- npm package path是否没有进入持久config/State，official artifact是否在startup固定；
- Runtime package是否只包含daemon/native dependencies，没有恢复native `kg`；
- TypeScript迁移是否保持Graph streaming/cancellation与CLI partial-output语义；
- Go CLI是否只在parity证明后删除，不保留永久兼容层；
- 是否意外扩大到Web UI设计、Skill、远程multi-user server、TLS、Windows或新的数据库能力。

发现finding后执行“修复 → targeted复验 → 必要范围扩大验证 → 再Review”；没有新finding时停止重复验证。

## 11. 完成条件

Phase 08只有同时满足以下条件才能进入`done`：

1. 08.1–08.8全部真实实现；
2. A–K Acceptance取得当前提交/工作树真实证据；
3. `@kgos/sdk`、`@kgos/cli`与Go `kgosd`使用同一公共HTTP合同；
4. Go CLI已在parity证据后删除，当前产品只剩一套正式CLI；
5. `KG_HOME`、`KG_TOKEN`、`kg install`、fixed local port与official npm path persistence从当前实现删除；
6. 双root isolation、auth/endpoint mismatch、concurrent startup与lazy bootstrap通过E2E；
7. packed npm package在workspace外可执行，四个平台native package真实运行通过；
8. Phase Review findings全部关闭；
9. 主工作树完整validation与独立fresh-source/packed-package validation成功；
10. 最终diff、docs、links、package contents、license/audit与仓库卫生通过；
11. README、设计状态导航、开发路线与Phase状态同步到真实实现。

实际npm registry publish、Git tag、dist-tag、release announcement不因本Phase代码完成自动发生；只有用户明确授权并取得外部registry证据后单独记录。

## 12. 当前状态

2026-09-25：状态为`done`。08.1–08.8实现、阶段验收、Review与远端矩阵均已闭环：

- `@kgos/sdk` 已实现完整公共HTTP client、错误映射与Graph async streaming；
- `@kgos/cli` 已迁移 doctor/init/Ontology/Object/Graph/Evolution/Merge 并复用SDK；
- `KG_HOME` / `KG_TOKEN` / `kg install` / fixed server config 已从当前实现删除，Instance统一使用显式 `--root`；
- `kgosd --root` 使用dynamic loopback endpoint并在lock发布 `pid/endpoint/version`；
- 四个平台Runtime package metadata和当前平台builder/manifest/hash验证已实现；
- repo外packed npm candidate smoke已验证init/doctor、并发lazy-start、双root隔离、wrong-endpoint auth fail-closed、Ontology/Object/Graph/Evolution/Merge与daemon restart；
- Go `cmd/kg` 已在TypeScript parity证据后删除；当前只保留一套正式CLI；
- 主工作树完整 `pnpm validate` 已成功：Go statement coverage **90.0%**，TypeScript statements/lines/functions **100%**，type coverage **99.70%**，jscpd **0 clones**，race、govulncheck、Playwright **2/2**、真实 Lithograph native、publint/packed package、license、audit与diff gate全部通过；
- 独立 fresh-source 快照在不复用主工作树 `node_modules` / build artifact / cache 的前提下完成 `pnpm run setup && pnpm validate`，同样全链路通过；
- final defect-first review已复核SDK browser-safe边界、旧Go CLI/KG_HOME/KG_TOKEN残留、per-root endpoint/token、Runtime package contents、npm path不持久化、CI package matrix与仓库卫生，没有剩余task-affecting finding；
- 实现提交 `aaf249a1f4862887e1fd16bfc44f47cebd6fb5e6` 已推送到 `main`；GitHub Actions run `36103842748` 成功，Validate job `107971924426` 用时 4m2s；
- 同一 run 的四个平台 native/package jobs 全部成功：macOS x64 `107971924614`（5m35s）、Linux arm64 `107971924657`（2m38s）、macOS arm64 `107971924688`（2m45s）、Linux x64 `107971924773`（1m50s）；每个平台都完成 target verification、Runtime package build、真实 Lithograph suite、repo 外 packed npm smoke 与 candidate upload；
- 因此 A–K Acceptance、11 项完成条件与 Phase 08 要求的远端门禁全部满足。

本Phase没有执行npm registry publish、Git tag、dist-tag或release announcement；这些动作继续需要独立授权与外部registry/release证据。
