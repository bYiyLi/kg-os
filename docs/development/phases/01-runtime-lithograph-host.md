# Phase 01：Runtime & Lithograph Host Foundation

**状态：`planned`**

## 1. 目标与范围

在当前 Go Engineering Foundation 完成后，建立 KG OS v1 的真实本地 Runtime / Database Host foundation：解析唯一 `KG_HOME` profile、验证 startup config、管理 credential 与 single-instance ownership、解析并加载 SQLite extensions、打开唯一 `kgos.db`、验证 Lithograph v0.3.0 public SQL capability，并提供 read/write execution、true streaming / cancellation 与 SQL explicit transaction primitive。

本 Phase 不建立 KG OS reserved Schema / semantic graph / Binding，不实现 Ontology / Object projection、Object Patch compiler、公共 Graph HTTP API、Evolution / Merge 或正式 Web 管理交互。需要严格区分：

```text
Lithograph initialization
!=
KG OS Knowledge Base bootstrap
```

Phase 01 可以对新数据库执行 `lithograph_init()` 并验证 Root / `main`；第一个 KG OS-valid State 仍由后续 bootstrap 阶段建立。

## 2. Design Inputs

- [D65 Go runtime](../../design/decisions.md#d65-go-runtime)；
- [D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](../../design/decisions.md#d66-lithograph-v030-sql-only)；
- [KG_HOME runtime profile](../../design/runtime.md#kg_home-runtime-profile)；
- [SQLite Extension source resolver](../../design/runtime.md#sqlite-extension-source-resolver)；
- [Lithograph 调用入口](../../design/runtime.md#lithograph-调用入口)；
- [Daemon lifecycle](../../design/runtime.md#daemon-lifecycle)；
- [Go 运行时与数据库接入](../../design/implementation.md#go-运行时与数据库接入)。

## 3. 依赖与集成基线

### 3.1 前置依赖

- 当前 [Phase 00](00-engineering-foundation.md) 必须先达到 `done`；因此本 Phase 当前为 `planned`。
- Go / CGO / `database/sql` + `go-sqlite3`、TypeScript client / Web、统一质量和 CI 入口由 Phase 00 提供。
- Phase 01 不依赖尚未建立的 Ontology / Object / Graph / Evolution 业务实现。

### 3.2 Lithograph baseline

当前真实集成目标：

- Lithograph **v0.3.0** release artifact；
- SQLite loadable extension；
- storage format `3`；
- Cypher profile `CY25-2026.08`；
- SQLite runtime `3.45.0+`；
- application-facing execution **SQL-only**；
- 完整结果：`lithograph()`；
- true streaming：`lithograph_rows()` 的 `ordinal,event,data` / `columns -> row* -> summary`；
- validation：`lithograph_validate()`；
- explicit transaction：`lithograph_tx_begin()` → 普通 `lithograph()` / `lithograph_rows()` → `lithograph_tx_commit()` / `lithograph_tx_abort()`；
- **没有** `lithograph_tx_execute()`，**没有** application Native query ABI。

旧 Phase 00 v0.1.1 和旧 Phase 01 文档/未提交代码中的 v0.2.1、format4、Native ABI、Core embedding cache 只属于历史开发输入，不能作为本 Phase acceptance。

### 3.3 SQLite host 约束

Phase 00 冻结的 Go SQLite host 在本 Phase必须证明：

- target runtime使用 `go-sqlite3` bundled SQLite，CGO build显式启用 `sqlite_fts5`、禁用 `libsqlite3` / `sqlite_omit_load_extension`，并实际证明 SQLite >= 3.45、FTS5、loadable extension可用；
- 每个物理 connection只在 initialization window启用 extension loading，按固定 artifact顺序和每项 required explicit `entrypoint`逐项加载，完成后关闭任意加载入口；
- read-only / read-write connection、参数、错误、row iteration、connection close 真实可用；
- `context.Context` cancellation 能中断真实 Lithograph/SQLite长执行并保持 transaction 语义；
- 不建立第二套 private SQLite runtime，不要求 driver 暴露 `sqlite3*`、不绑定已删除的 Native query symbols；
- active Lithograph explicit transaction 固定同一独占 `*sql.Conn`，不能被 pool 换到其它 connection。

## 4. Feature 顺序

```text
01.1 KG_HOME/config/credential
 -> 01.2 SQLite Extension resolver
 -> 01.3 Go SQLite connection construction
 -> 01.4 Lithograph v0.3.0 provisioning/activation/capability
 -> 01.5 SQL execution/stream/cancellation
 -> 01.6 SQL explicit transaction
 -> 01.7 runtime lock/shutdown
 -> 01.8 integration hardening/review closure
```

### Feature 01.1 KG_HOME、startup config 与 credential

- 默认 `KG_HOME=~/.kgosd`，显式值统一解析为 absolute path。
- 建立 `config.toml`、`auth.json`、`kgosd.lock`、`kgos.db`、`cache/`、`extensions/`、`logs/` 的当前职责。
- 解析 `server`、`cache`、`sqlite.extensions`、`fulltext`、`embedding`；`[cache].path`省略时解析到 `$KG_HOME/cache/openai-compatible.db`，relative path 相对 effective KG_HOME，写入 providerConfig 前转 absolute。
- `auth.json` 使用至少 256-bit CSPRNG token 原子创建；POSIX `0600`；malformed/unreadable/empty fail closed 且不静默 rotate。
- startup 只做本地 config / credential 检查，不发送 sample embedding / remote health request。

### Feature 01.2 SQLite Extension Resolver

- 实现 local/HTTPS source、remote mandatory SHA-256、direct library/archive、exact `library`、required non-empty `entrypoint`、HTTPS-only bounded redirect、safe extraction 与 content-addressed cache。
- archive 拒绝 absolute/`..` traversal、symlink/hardlink/device/special entry、越界 library 并执行资源上限。
- daemon startup 一次解析为immutable local artifact set；connection checkout 热路径不下载、不重新解析 source。

### Feature 01.3 Go SQLite Connection Construction

- 使用 Phase 00已验收的 `database/sql` + go-sqlite3 bundled SQLite建立物理 connection constructor；使用 process-private driver / connection hook保证每个新物理 connection都执行 initialization。
- 每个物理 connection按 config order和 explicit entrypoint加载同一 artifact set；任一 extension失败则 connection不可用。constructor只做 host-level probe：SQLite >=3.45、FTS5、extension load与 `lithograph_version()` callable，不在未初始化新库上提前做 Semantic staged create或要求完整 graph capability。
- 为 `$KG_HOME/kgos.db` 先取得**一个独占 read-write bootstrap connection**；read-only pool / normal write pool不能在 Lithograph provisioning完成前开放给 runtime。
- request context / checkout / Branch context不得跨请求泄漏；无法证明安全复用的 connection丢弃。
- Phase 01只实现满足单 profile需求的最小 connection管理，不提前构建通用多数据库/pool框架。

### Feature 01.4 Lithograph Provisioning、Activation 与 Capability Validation

- 在 bootstrap connection真实执行 `lithograph_version()`；`databaseId/storageFormat.current`均为 null表示干净未初始化库，此时执行 `lithograph_init()`；已有库按 version结果验证兼容性。初始化/迁移完成后验证 Root / main，并冻结本次 startup的 databaseId/storage-format/Cypher profile baseline；close/reopen后再次验证。
- 要求 v0.3.0、format 3、CY25 profile与当前 SQL function/virtual table capability；不探测 Native ABI。
- 在已初始化 bootstrap connection验证 `lithograph()`、`lithograph_rows()`、`lithograph_validate()`、`lithograph_tx_begin/commit/abort`和当前 Full-text analyzer。
- Provider readiness只走公开 SQL local validation：在同一个已初始化 bootstrap write connection内 `tx_begin`，用随机 probe index/label/property执行 staged `db.index.semantic.createNodeIndex`和当前 `[embedding]` / `[cache]`编译结果，成功后 `tx_abort`；验证没有 Commit/Schema/Index/ref残留，且全程不触发 `embedBatch` / network。missing provider或 config validation failure使 startup失败。
- bootstrap完成后才激活正常 read-write/read-only connection set。每个新物理 connection必须重新加载同一 artifacts、通过 host probe，并用 `lithograph_version()`证明 databaseId/storage-format/profile与 frozen baseline一致；每个 usable connection验证当前 Full-text analyzer。read-only connection不重复 staged Provider write probe。
- `[cache]`不再调用 Lithograph maintenance procedure；验证 compiler / runtime能形成 OpenAI-compatible `providerConfig.cache` default、父目录安全可用，并覆盖 current `[cache]`只影响未来 create/replace、不改写既有 versioned config的边界。

### Feature 01.5 SQL Execution、True Streaming 与 Cancellation

- buffered execution使用 `lithograph()`。
- Graph `query`在独占 read-only connection先用 `lithograph.commit.get(StateRef)`解析 exact Commit，再以 `options.at=<commit>`执行原始 Cypher；Graph `execute`在独占 read-write connection的 autocommit状态先完整 `branch.checkout(requestedBranch)`，随后不附加 `options.branch`执行原始 Cypher。覆盖 Branch/Tag/Merge/version procedure，不允许 procedure-name特例表。
- streaming使用 `SELECT ordinal,event,data FROM lithograph_rows(...)`逐 event消费，覆盖 zero-row、columns、rows、summary、底层 mid-stream error与 early close；内部测试 sink按 pull顺序消费，不允许把完整结果预收集后冒充 stream。
- read-only connection执行合法 read/Semantic；write query由实际 SQLite/Lithograph boundary拒绝，不自动换 read-write重试。read-write connection覆盖普通 mutation和`CALL ... IN TRANSACTIONS`等底层支持能力。
- `context.Context`取消和 rows early-close测试必须真实触发 SQLite interrupt / cursor cleanup。HTTP terminal `error` framing、socket backpressure和 client disconnect属于后续公共 Graph HTTP surface验收，不纳入本 Phase completion。
- transaction subquery已 durable batch、普通未提交 write、summary前 / 后的可观察语义完全遵守 Lithograph v0.3.0，不自动重放结果未知 write。

### Feature 01.6 SQL Explicit Transaction

同一独占 connection：

```text
lithograph_tx_begin(options)
  -> lithograph(...) / lithograph_rows(...) *
  -> lithograph_tx_commit() | lithograph_tx_abort() | fail-closed auto-abort
```

至少验证：

- 多次 mutation最终只产生一个 Commit；
- staged execution看得到前序 staged write；
- pure-read / empty-delta 行为遵守底层合同；
- expectedHead mismatch 不自动retry / merge；
- 任一 execution error/cancel/incomplete stream 使整个active tx fail closed；
- abort/connection close 无durable mutation；
- 不存在 `tx_execute` adapter，也不另套外层 SQLite `BEGIN/COMMIT`。

### Feature 01.7 Runtime Ownership、Lock 与 Shutdown

- `$KG_HOME/kgosd.lock` 持有OS-level exclusive lock；file 存在本身不表示running。
- second owner 失败；crash/stale content 后OS ownership 可恢复。
- startup 任一步失败释放 lock、rows/transaction/connection。
- shutdown 通过context 取消active work，关闭connection 后未提交transaction 不得durable；endpoint 只在正式readiness 后发布。

### Feature 01.8 Integration Hardening 与 Review Closure

组合 disposable KG_HOME 真实验收：config/auth/lock/resolver/read-write connections/v0.3.0 init+reopen/stream+cancel/explicit tx/Provider cache default/失败清理/离线 artifact cache，并证明 Phase 00 统一质量与package / Web gates不退化。

## 5. Acceptance Matrix

| ID | 验收场景 | 判定 | 当前状态 |
| --- | --- | --- | --- |
| P1-01 | Go SQLite Host | 真实 Go process / bundled CGO SQLite以 `sqlite_fts5` + loadable-extension profile加载 Lithograph v0.3.0，version/FTS5/explicit entrypoint/read-write/cancel符合 Design | 未验收 |
| P1-02 | KG_HOME profile | 默认 / 显式 path、cache / extensions / logs / db目录职责与 profile隔离正确 | 未验收 |
| P1-03 | Config / Auth | 当前config / default / cache path fail-closed；credential 原子创建/权限 / 复用 / secret hygiene通过 | 未验收 |
| P1-04 | Extension Resolver | local/HTTPS/SHA/archive/redirect/content cache、required explicit entrypoint与攻击路径通过 | 未验收 |
| P1-05 | Provisioning / Connection Activation | bootstrap RW connection先 init/verify并冻结 database baseline；之后才激活 read/write connections；每个 connection加载相同 artifacts、baseline/FTS probe一致，staged Provider readiness零 durable side effect | 未验收 |
| P1-06 | Lithograph Capability / Reopen | uninitialized version→init、Root/main/reopen、v0.3.0 / format 3 / CY25 / SQL-only capability通过；无 Native / cache.configure假设 | 未验收 |
| P1-07 | SQL Context / Stream / Cancel | query StateRef pin、execute checkout/no-branch-option、lithograph/rows true stream、read-only/write/external I/O/transaction subquery/context cancel/early-close通过；不冒充 HTTP surface验收 | 未验收 |
| P1-08 | Explicit Transaction | single Commit、staged visibility、expectedHead、abort / failure / incomplete stream与misuse 通过 | 未验收 |
| P1-09 | Lock / Shutdown / Fresh Regression | single owner、startup failure / shutdown cleanup、fresh setup / full validation通过 | 未验收 |
| P1-10 | CI / Review Closure | 当前 Phase最终 SHA的 Ubuntu 24.04 x64 native CGO CI成功，本地 macOS arm64 native regression通过，finding / docs / final diff闭环 | 未验收 |

## 6. 关键失败路径

- Config/Auth：missing/malformed config、非法cache path / size、missing env credential、auth create/permission failure。
- Resolver/Connection：HTTP/downgrade/hash/archive/path traversal、corrupt cache、missing/invalid explicit entrypoint、ordered load、bootstrap-before-read-pool顺序、uninitialized/ incompatible database、per-connection baseline mismatch、FTS failure、Provider missing/config validation failure，以及 readiness probe abort/cleanup。
- SQL execution：StateRef resolve/pin、execute checkout reset、rows encoding/mid-stream error、read-only write、context cancel/early close、transaction subquery partial durability、connection discard；不在本 Phase 用 mock HTTP 壳层冒充正式 Graph streaming。
- Explicit tx：nested/missing lifecycle、expected-head conflict、staged success 后 failure、auto-abort 后误继续、commit/abort misuse。
- Provider cache：default path与`kgos.db`冲突应由配置/Provider fail closed；cache file I/O 错误保持底层公开分类，不能写 Lithograph main。
- Lock/Shutdown：second owner、stale file、startup 中途失败、active query / tx 停止与资源释放。

## 7. 验证计划

Phase 00 统一 validation + 本 Phase targeted Go integration：

```text
targeted profile/config/auth/resolver tests
targeted Go SQLite + Lithograph v0.3.0 real-load tests
targeted lithograph()/lithograph_rows() streaming + context cancel
targeted Provider readiness / read-only main + provider cache
targeted explicit transaction
targeted lock/shutdown cleanup
        ↓
Phase 00 full repository validation
fresh-source setup + validation
forced pre-commit
Ubuntu 24.04 x64 GitHub CI + local macOS arm64 native regression
git diff --check
```

## 8. Review 重点

- 是否仍把 Lithograph initialization 误报为 KG OS bootstrap；
- 是否保留 v0.2.1/format4/Native ABI/`tx_execute`/Lithograph Core cache旧假设；
- 是否固定 bundled SQLite + `sqlite_fts5` + explicit-entrypoint ordered loading，并让 Go driver直接证明 extension load与 context cancellation，而不是引入 FFI / native handle旁路；是否严格先用 bootstrap RW connection完成 Lithograph init/baseline，再开放 normal read/write connections；Provider readiness是否只在已初始化库上用 staged create + abort公共 SQL且不联网、不留下 Schema/Commit；
- read-only main 是否因Provider cache 错误升级为read-write；
- Provider cache path / default 是否稳定、absolute compile、与 main 隔离，KG OS 是否越权读写Provider 内部 DB；
- SQL streaming是否真正逐 event pull而非完整 buffer；HTTP terminal error/backpressure是否被明确留给后续 Graph HTTP surface而没有被本 Phase mock冒充完成；
- transaction subquery / explicit tx / 普通 write的durability 是否被上层错误统一；
- startup / shutdown 是否释放 lock / cursor / transaction / connection；
- 是否为了一个库提前引入多库 registry / generic storage backend。

## 9. 完成条件

P1-01–P1-10 全部取得真实证据、Phase 00 依赖已`done`、review finding闭环、文档同步、final diff 通过且最终推送 SHA的 Ubuntu 24.04 x64 native CGO CI成功且本地 macOS arm64 native regression通过后，Phase 01 才标记`done`。Commit/push/release/deploy继续分别授权。

## 10. 当前工作树说明

2026-09-21 本计划更新时，仓库存在尚未提交的旧 Phase 01 TypeScript / `ffi-rs` / bundled SQLite / Lithograph v0.2.1实现尝试。它们解决的是D65 / D66 之前的旧合同，本计划不把它们视为当前实现或验收证据；本次用户只授权设计与开发计划维护，因此没有删除、重写或提交这些代码。后续实施Phase 00 / 01 时按当前设计最小化迁移并保留无关用户修改。
