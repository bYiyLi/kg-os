# Phase 03：Installation & Runtime Onboarding

**状态：`ready`**

## 1. 目标与范围

在 Phase 02 已完成 Ontology 业务闭环之后，补齐 KG OS 本地首次使用入口，使普通用户不需要理解或手工管理 daemon、`auth.json`、Lithograph extension path 或首次 Knowledge Base bootstrap。

本 Phase 完成后，fresh installation 的公开使用流程固定为：

```text
kg doctor
  → 只读诊断当前环境

kg install
  → 完整配置当前 KG_HOME

kg ontology --at branch/main
  → CLI 自动确保 kgosd 已运行
  → fresh profile 自动创建 auth.json / kgos.db
  → KG OS bootstrap
  → 执行原始 Ontology request
```

本 Phase 交付：

- `kg doctor` side-effect-free 环境诊断；
- `kg install` 交互式 + 参数化统一 installer；
- 完整显式 `config.toml` 合同，不再依赖缺失字段默认值；
- `[fulltext]` / `[embedding]` 初始化配置提示；
- English / 中文 CLI 人类文案，默认 English；
- 本机 `KG_TOKEN -> auth.json` credential resolution；
- 业务 CLI Runtime ensure / auto-start；
- 从 public CLI 移除 `kg daemon start/status/stop/restart`；
- fresh-install / packaged-layout / concurrent auto-start 的真实集成验收。

本 Phase **不实现普通 Knowledge Object、Graph、Evolution、完整 SDK/Web/Skill 业务能力**，不新增配置历史、profile registry、credential manager、OS service installation 或配置迁移系统。

## 2. Design Inputs

- [CLI：Doctor / Install / Runtime target](../../design/cli.md)；
- [Runtime：config / authentication / daemon lifecycle](../../design/runtime.md)；
- [Architecture：v1 Runtime](../../design/architecture.md#v1-运行时与技术分层)；
- [D72 Local install / Runtime onboarding](../../design/decisions.md#d72-local-install-runtime-onboarding)；
- [工程映射](../../design/implementation.md)；
- [Phase 00 Engineering Foundation](00-engineering-foundation.md)；
- [Phase 01 Runtime & Lithograph Host Foundation](01-runtime-lithograph-host.md)；
- [Phase 02 Ontology](02-ontology.md)。

本计划只拆分实现和验收，不重新定义安装、配置、认证或 lifecycle 产品语义。

## 3. 依赖与当前基线

### 3.1 前置依赖

- Phase 00 / 01 / 02 均为 `done`；
- 当前 Go CLI / daemon、`KG_HOME` path resolution、runtime directories、config parser、extension resolver、single-instance lock、foreground `kgosd`、graceful shutdown、Bearer middleware、Knowledge Base bootstrap 与 `kg ontology` 已有真实实现；
- 当前代码仍保留旧基线：config 部分字段有 implicit defaults、CLI 只接受 `KG_TOKEN`、业务命令不 auto-start daemon、`kg daemon ...` 尚未实现。Phase 03 必须按 D72 直接替换这些旧预期，不为未发布 surface 建兼容层。

Design Inputs、前置依赖、工作顺序和 Acceptance 已齐全，因此当前 Phase 状态为 `ready`。

### 3.2 Lithograph baseline

继续使用 Phase 01 / 02 已冻结的 Lithograph v0.3.0、storage format 3、`CY25-2026.08` 与 SQLite 3.45.0+ SQL-only integration。

本 Phase 不修改 Lithograph 仓库、不新增数据库 capability，也不改变：

- extension resolver 的 public source / archive / hash / entrypoint 合同；
- SQL execution / streaming / cancellation；
- explicit transaction；
- Provider ABI / Provider-owned cache；
- Ontology Schema / bootstrap；
- Commit / Branch / State 语义。

## 4. Phase 边界

### 4.1 本 Phase 拥有

```text
Complete startup config contract
  -> installer-managed required artifacts
  -> locale / i18n messages
  -> kg install
  -> kg doctor
  -> local credential resolution
  -> business-command Runtime ensure
  -> CLI help / command-tree cleanup
  -> fresh-install E2E
```

### 4.2 明确不属于本 Phase

- Knowledge Node / Relationship 公共 CRUD；
- `kg object ...`；
- `kg graph ...`；
- `kg evolution ...`；
- SDK / Web / Skill 完整业务 surface；
- Web 页面交互设计；
- token rotation、login/logout、OAuth、Keychain / Credential Manager；
- 多 profile registry / selector；
- `kg config ...`、`kg setup`；
- public `kg daemon ...`；
- OS 开机自启动/service installer；
- config fingerprint、历史值快照、修改检测、自动 migration；
- Full-text / Embedding 配置升级工作流；
- 新 package manager / plugin registry。

## 5. Feature 顺序

```text
03.1 Complete configuration + packaged artifact discovery
 -> 03.2 CLI locale / i18n
 -> 03.3 kg install
 -> 03.4 kg doctor
 -> 03.5 Local credential resolution
 -> 03.6 Business Runtime ensure / auto-start
 -> 03.7 CLI surface cleanup
 -> 03.8 Integration hardening / review closure
```

### Feature 03.1 Complete Configuration 与 Runtime Artifact Discovery

- 调整 runtime config parser，使正式配置必须显式包含：
  - `server.host`；
  - `server.port`；
  - `cache.path`；
  - `cache.max_size_mb`；
  - 至少 KG OS distribution 要求的 `sqlite.extensions`；
  - `fulltext.analyzer`；
  - `embedding.base_url`；
  - `embedding.model`；
  - `embedding.dimensions`；
  - `embedding.similarity`；
  - `embedding.api_key_env` 字段。
- 删除 runtime parser 对 server / cache / fulltext / embedding 的缺失字段默认行为；推荐值只属于 installer prompt。
- `cache.enabled` 从 KG OS startup config surface 删除；Provider cache 固定 enabled=true。
- `embedding.api_key_env=""` 是显式的 no-auth endpoint 配置；字段缺失仍是 invalid config。
- 保留 extension entry 的条件字段语义：archive 才要求 `library`，remote 才要求 `sha256`，local `sha256` 可显式提供；这些条件值不被错误解释成“配置没填完整”。
- 定义并实现 release/package layout 下 `kg`、`kgosd`、Lithograph 与 OpenAI-compatible Provider required artifact 的确定性 discovery；installer 把真实 absolute source 与 entrypoint 写入 config，不要求普通用户输入官方 library path。
- 扩展当前 `pack-release.mjs` 的 kg/kgosd-only artifact：package 增加 `extensions/`，包含当前平台 Lithograph 与 OpenAI-compatible Provider library；manifest 同时记录两个 binary 与两个 native library 的 SHA-256。
- `kg install` 从自身 canonical executable directory 定位 sibling `kgosd` 与 `extensions/`，不使用 cwd 或 PATH 中另一份 daemon；官方 package 的 install path 不需要联网解析 Lithograph release。
- install 在发布 config 前验证 required distribution files 与 manifest hash；doctor只读复用同一 integrity check。官方 extension entries写入 canonical source、manifest SHA-256和固定 entrypoint，再交给既有 resolver处理。
- packaged artifact smoke 必须从 distribution 目录外执行，防止实现意外依赖 repository cwd / `.cache/lithograph`。
- 不为 artifact discovery 增加在线 plugin registry、latest resolver 或第二套 extension loader。

### Feature 03.2 CLI Locale / i18n

- 建立最小 Go CLI message catalog，只覆盖当前真实 human-facing 文案，不引入第三方 i18n framework。
- 支持 `en` / `zh`；默认 `en`。
- locale 解析按 `LC_ALL -> LC_MESSAGES -> LANG` 的第一个非空值；中文 locale 映射 `zh`，其它和 unknown 映射 `en`。
- 命令名、flag、JSON field、error code、config key、Ref、enum 保持英文稳定 identifier。
- `--help`、doctor human view、install prompt / warning 与本地 human diagnostics 使用 catalog。
- 同一 message key 的中英文必须表达同一行为，不允许翻译改变配置可选性、错误级别或 command semantics。

### Feature 03.3 `kg install`

- 增加正式 `kg install` dispatch / help。
- 支持设计冻结的 scalar flags：
  - `--server-host`；
  - `--server-port`；
  - `--cache-path`；
  - `--cache-max-size-mb`；
  - `--fulltext-analyzer`；
  - `--embedding-base-url`；
  - `--embedding-model`；
  - `--embedding-dimensions`；
  - `--embedding-similarity`；
  - `--embedding-api-key-env`。
- 每个已提供 flag 直接进入 resolved install input，不重复 prompt。
- 缺失字段且 stdin/stdout 可交互时，按 catalog 一个一个询问；有推荐值的 prompt 允许 Enter 明确采用推荐值。
- prompt 推荐值固定为：`127.0.0.1`、`4765`、`cache/openai-compatible.db`、`4096`、`unicode61`、`https://api.openai.com/v1`、`text-embedding-3-small`、`1536`、`cosine`、`OPENAI_API_KEY`，分别对应设计中的十个用户配置 key；推荐值不能回流成 runtime 缺失字段 default。
- 缺失字段且不可交互时，不等待 stdin，返回 `INSTALL_CONFIGURATION_INCOMPLETE` 与稳定 missing config keys。
- 参数全部提供时，即使 TTY 存在也零 prompt，适合 AI / CI。
- 交互流程进入 `[fulltext]` / `[embedding]` 前只显示一次：
  - zh：`以下配置初始化后禁止修改。`
  - en：`The following settings must not be changed after initialization.`
- 不增加第二段责任/迁移/兼容性说明。
- 全部值与 installer-derived extension entries 先统一 validate，再原子发布完整 `config.toml`；失败不得留下 partial config。
- 创建 `KG_HOME` 与必要 runtime-owned directories，但不启动 daemon、不生成 `auth.json`、不创建 `kgos.db`、不执行 Lithograph/KG OS bootstrap。
- 目标 config 已存在、没有 config-setting flags 且配置合法时 idempotent success，不覆盖、不重复 wizard；已存在但非法时只返回当前配置错误，不自动重写；已存在且又传入任一 config-setting flag时返回 `INVALID_ARGUMENT` / exit 2，不静默忽略参数、不比较新旧值。
- `INSTALL_CONFIGURATION_INCOMPLETE` 使用 exit 2，`details.missing` 按 canonical config key 排序。
- 交互安装成功输出本地化短文本；全部参数已给全的零交互成功输出稳定 JSON `status=installed`，existing valid config 的零交互成功输出 `status=already_installed`。

### Feature 03.4 `kg doctor`

- 增加 `kg doctor [--json]`。
- doctor 必须 side-effect-free：不创建目录/文件、不写 config、不下载/缓存 artifact、不启动 daemon、不生成 auth、不创建/打开用于初始化的 database、不 bootstrap。
- 检查：
  - effective `KG_HOME`；
  - install / config presence；
  - config completeness / static validation；
  - installer-managed executable / native artifact presence；
  - local configured extension source / cached artifact 的可确定状态；
  - embedding `api_key_env` 非空时对应环境变量是否存在且非空；
  - lock ownership与 `stopped/starting/running/unavailable`；
  - 能在不产生副作用前提下确定的 readiness。
- `stopped` 不阻塞 overall ready；它必须说明业务命令会自动启动 Runtime。
- TTY 默认输出本地化 human view；`--json` 使用稳定 machine schema，至少包含 `ready` 与 `checks[].id/status/blocking`，missing config 使用 canonical key。
- `checks[].status` 只使用 `ok/info/error`；daemon state 放在 `details.state` 并使用 `stopped/starting/running/unavailable`。诊断过程本身成功时 exit 0，环境是否 ready 由 result 表达。
- doctor 不比较历史配置、不判断初始化配置是否曾被修改。

### Feature 03.5 Local Credential Resolution

- 抽取 CLI credential resolver：
  1. 非空 `KG_TOKEN`；
  2. 否则当前 `$KG_HOME/auth.json`；
  3. 都不可用则本地 `AUTHENTICATION_FAILED`。
- 显式 `KG_TOKEN` 存在但 daemon 返回 authentication failure时，不 fallback 到 auth file。
- 复用 runtimeprofile 的 strict auth JSON / permission semantics，不复制一个宽松 parser。
- token 不进入 CLI arguments、stdout/stderr、doctor JSON、logs 或 lock。
- SDK / Web 不获得自动读取本地 auth file 的新行为。

### Feature 03.6 Business Runtime Ensure / Auto-start

- 所有需要 daemon 的现有/后续业务命令在 HTTP dispatch 前共享一个 Runtime ensure primitive。
- 状态行为：
  - `running`：直接使用 active lock endpoint；
  - `stopped`：确定性定位配套 `kgosd`，detached/background spawn，等待 lock owner 发布 endpoint；
  - `starting`：不 spawn 第二个进程，等待 existing owner ready；
  - `unavailable`：明确失败，不 PID kill、不替换 owner。
- 并发 auto-start 依赖现有 OS lock实现 single winner；loser caller等待 winner ready。
- auto-start 不通过未认证 data API探测 ready；endpoint publication继续是本地 ready signal。
- fresh Runtime ready 后再执行 credential resolution与原始业务 request。
- 业务命令不因为磁盘 `config.toml` 变化比较 digest、hot reload或自动 restart。
- direct `kgosd` 继续保持 foreground语义，signal cleanup与 Phase 01 shutdown不退化。

### Feature 03.7 CLI Surface Cleanup

- `kg --help` 正式显示 `doctor`、`install` 与当前已实现业务 namespace。
- 不实现、也不保留 placeholder `kg daemon start/status/stop/restart`。
- 删除文档/测试/错误文本以及 Web dev proxy 中残留的 public daemon-control / `/control` 旧假设。
- Phase 02 Ontology 命令业务输出、StateRef、Patch 与 exit-code合同保持不变；Runtime ensure只包围 transport前置，不改变 Ontology request。
- 机器 identifier不因 locale变化。

### Feature 03.8 Integration Hardening / Review Closure

- 为 fresh temporary `KG_HOME` 建立 installer / doctor / auto-start E2E。
- 使用真实 Lithograph v0.3.0 与 OpenAI-compatible Provider extension artifact，不用 mock 代替核心启动链路。
- 覆盖 concurrent business-command auto-start、startup failure、wrong explicit token、missing env、stale lock、starting owner、unavailable owner。
- 覆盖中英文 TTY transcript 与全参数 non-interactive path。
- 清理旧 daemon command、config default 与 env-only credential相关历史实现；不保留未发布兼容层。
- 最终执行 targeted tests、完整质量门禁、fresh-source validation、Phase review、diff检查和仓库要求的远端 CI。

## 6. Phase Acceptance

### A. Fresh doctor 无副作用

对不存在的 temporary `KG_HOME` 执行 `kg doctor --json`：

- 返回 not-installed / config-missing 等稳定 check；
- overall `ready=false`；
- 命令结束后目标 `KG_HOME` 仍不存在；
- 没有 daemon、auth、db、cache、extension artifact 或 lock 被创建。

### B. Human interactive install

在真实 TTY/PTY 中执行无配置参数的 `kg install`：

- en locale 使用英文，zh locale 使用中文；
- 每个缺失用户配置逐项询问；
- 对 prompt 接受推荐值时最终 config 仍显式写出值；
- 进入 Full-text / Embedding 配置前只出现一次初始化后禁止修改提示；
- 所有字段完成后 config通过与 daemon相同的 parser/validator；
- 安装结束没有 active daemon、`auth.json` 或 `kgos.db`。

### C. Fully parameterized AI install

在 non-interactive 环境用全部 flags 执行 `kg install`：

- 没有读取 stdin或 prompt；
- 成功生成与相同输入的交互安装语义等价的完整 config；
- `cache.enabled` 不存在，Provider cache在 compiler映射中固定 true；
- 官方 required extensions使用真实 installer-derived paths；
- official extension config携带与 distribution manifest一致的 SHA-256；
- stdout 为稳定 JSON `status=installed`；error envelope 可以由 automation稳定消费。

### D. Partial parameter input

- TTY：只询问缺失字段，已经传入的每个字段不重复询问；
- non-TTY：返回 `INSTALL_CONFIGURATION_INCOMPLETE` 和准确 missing keys，config 不写入；
- invalid supplied value直接返回对应 config error，不用 prompt把错误值偷偷替换成推荐值。

### E. Existing install

- 已存在合法 config 时再次 `kg install` idempotent success，文件 bytes 不改变；
- 已存在非法 config 时 installer不覆盖，返回当前 validation error；
- 已存在 config 且调用方带任一 config-setting flag时返回 `INVALID_ARGUMENT` / exit 2，不修改文件；
- 不增加 `setup` / `config` namespace。

### F. Doctor ready + stopped

安装完成但 daemon 从未启动：

- `kg doctor` / `--json` 把 daemon报告为 stopped；
- stopped不阻塞 overall ready；
- `doctor --json` 中 runtime check 使用 `status=info, blocking=false, details.state=stopped`；
- 诊断完成时 exit 0；
- doctor不启动 daemon；
- init-only配置没有历史比较或修改检测。

### G. First business command auto-start

fresh installed profile、无 `KG_TOKEN`：

```bash
kg ontology --at branch/main
```

必须：

- 自动定位并启动配套 `kgosd`；
- daemon一次性生成 `auth.json`；
- 创建并初始化 `kgos.db`；
- 完成现有 Phase 02 KG OS bootstrap；
- CLI使用本地 auth file发送 Bearer request；
- 返回正常 Ontology结果；
- 用户不执行 daemon/token搬运命令。

### H. Explicit credential precedence

- running daemon + correct `KG_TOKEN` 成功；
- running daemon + wrong non-empty `KG_TOKEN` 返回 `AUTHENTICATION_FAILED`，即使本地 `auth.json` 正确也不得 fallback；
- 未设置 `KG_TOKEN` 时本地 auth成功；
- token从不进入输出或日志。

### I. Concurrent auto-start

两个或更多业务 CLI 同时对 stopped profile发起请求：

- 最多一个 daemon取得 OS lock并完成 startup；
- 其它 caller等待 winner ready并复用同一 endpoint；
- 不出现第二 database/bootstrap daemon或端口 fallback；
- 每个 caller最终得到自身业务结果或准确 startup failure。

### J. Runtime failure

覆盖 invalid config、missing required artifact、bind conflict、child提前退出、startup timeout、active unavailable owner：

- 原始业务 request在 daemon未 ready时不发送；
- CLI返回准确本地 lifecycle/transport error；
- 不 force kill active owner、不创建第二 daemon、不直接打开 SQLite绕过。

### K. CLI surface 与 i18n

- `kg --help` 有 `doctor/install/ontology`，无 public `daemon`；
- help / doctor human / install prompt在 zh/en下语义一致；
- unknown locale回退英文；
- command / flag / JSON field / error code / config key 在不同 locale 下完全一致。

### L. Regression / quality gates

- Phase 00/01/02 既有 targeted 与 integration tests继续通过；
- `kg ontology` 的业务输出、Patch与认证服务端合同不退化；
- Go format / vet / Staticcheck / test / race / coverage / govulncheck 和仓库统一 `pnpm validate` 按当前工程基线通过；
- fresh-source setup + validation通过；
- `git diff --check`、Markdown链接和最终 diff review通过；
- Phase要求的 Ubuntu 24.04 x64 GitHub Actions Validate取得真实成功结果后才可标 `done`。

## 7. Review

Phase Review 至少检查：

1. installer、runtime parser 与最终 config字段是否只有一套真源，没有 prompt defaults与runtime defaults漂移；
2. fully parameterized invocation 是否真正零交互；
3. doctor 是否有任何文件、网络下载、daemon或database副作用；
4. 初始化后禁止修改提示是否只出现一次且没有多余责任文案；
5. 中文/英文是否只改变 human text，不改变 machine contract；
6. local auth fallback是否泄露 secret或掩盖错误显式 `KG_TOKEN`；
7. auto-start是否在 concurrency / stale lock / unavailable owner 下保持 single-instance；
8. Runtime ensure 是否只包围 transport，不改变 Ontology业务语义；
9. 是否残留 public daemon commands、implicit config defaults、cache disable、env-only CLI auth旧实现；
10. 是否引入了超出当前需求的 service manager、profile registry、配置 migration、credential manager 或新 dependency。

Review发现问题后修复并重跑受影响验证；没有新改动或新finding时停止重复验证。

## 8. 完成条件与证据

Phase 03 只有同时满足以下条件才能从 `ready/in_progress` 进入 `done`：

1. 03.1–03.8 全部真实实现；
2. A–L Acceptance 全部取得当前工作树/提交的真实证据；
3. fresh install 从 `doctor -> install -> ontology` 闭环，不需要用户管理 daemon或搬运 token；
4. 中文 / 英文与 AI fully-parameterized path 都有自动测试；
5. Phase Review finding 全部关闭；
6. README、Design、Development、Guide 与 vlog按各自职责同步到实际实现状态；
7. 完整本地门禁、fresh-source validation 与 Phase要求的远端 CI真实通过；
8. 没有临时 config、secret、database fixture、extension cache、build artifact 或 unrelated改动进入提交。

当前只完成了设计与计划，尚未实现 Phase 03，因此没有实现/验证/CI/commit证据可记录。
