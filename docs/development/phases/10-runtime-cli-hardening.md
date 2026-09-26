# Phase 10：Runtime & CLI Hardening

## 1. 目标

在已经公开发布并完成真实用户主链验收的 KG OS v0.1.0 基线上，关闭本次实际使用暴露出的 **Runtime correctness / recovery、CLI discovery / presentation、默认中文 Full-text 与 Provider diagnostics** 缺口，使现有 Ontology / Object / Graph / Evolution 能力在并发、daemon 重启和公开 npm 使用路径下保持确定、可恢复、可发现。

本 Phase 不增加新的知识模型、Search DSL、Agent、Web 页面或数据库能力；它只 harden 已经存在的 v1 public surface 与 Runtime distribution。

完成后的目标路径：

```text
public npm CLI
   ↓
init（省略 --fulltext-analyzer）
   ↓
official jieba + complete config
   ↓
daemon auto-start / stale recovery
   ↓
Ontology / Object / Graph / Evolution
   ↓
deterministic pooled-connection behavior
   ↓
Chinese Full-text + real Semantic Provider
   ↓
discoverable help + consistent JSON presentation
```

## 2. 状态

`in_progress`

Phase 00–09 已为 `done`，v0.1.0 已公开发布。Phase 10 工作树candidate已实现，official Jieba 使用pinned upstream revision加最小 `cdylib` adapter；macOS arm64主工作树与独立fresh-source完整验证、repo外packed Ontology / Full-text / Semantic主链和真实外部Provider均已通过。macOS x64与Linux glibc arm64/x64目标runner尚未验证本次candidate，因此完整Phase acceptance未闭合。

公开发布新的 npm version、Git tag / GitHub Release与registry release closure **不属于本 Phase**；Phase 10 只产生经过完整本地 / fresh-source / packed / 四平台验证的 hardening candidate。后续正式 Release 继续作为独立发布动作和阶段关闭。

## 3. Design Inputs

- [Runtime：Cypher 执行连接](../../design/runtime.md#cypher-执行连接)
- [Runtime：SQLite Extension source resolver](../../design/runtime.md#sqlite-extension-source-resolver)
- [Runtime：Full-text 全局配置](../../design/runtime.md#full-text-全局配置)
- [Runtime：Daemon lifecycle](../../design/runtime.md#daemon-lifecycle)
- [Graph：公共调用合同](../../design/graph.md#graph-公共调用合同)
- [CLI：命令树 / Help / JSON-first / Init](../../design/cli.md)
- [Client：npm package topology / Node runtime baseline](../../design/client.md)
- [公共错误合同](../../design/contracts.md#公共错误合同)
- [D78 operation-scoped Branch](../../design/decisions.md#d78-operation-scoped-branch)
- [D79 stale daemon recovery](../../design/decisions.md#d79-stale-daemon-recovery)
- [D80 official Jieba](../../design/decisions.md#d80-official-jieba)
- [工程映射与集成验收](../../design/implementation.md)

Phase 计划只安排上述已确认合同的实现与验收，不复制成第二套产品设计。

## 4. 当前基线与已观察证据

2026-09-26 使用 public `@kgos/cli@0.1.0` 及其从 npm dependency graph 解析的 public macOS arm64 Runtime package，在 repo 外临时 Instance 做了真实用户验收，确认：

- `doctor -> init -> 首个业务命令 auto-start`、Ontology create/read/edit、Object batch read / patch、Graph query / execute / NDJSON stream、State / State Data / History / Diff、Branch / Tag / Merge Session主链可工作；
- OpenAI-compatible endpoint可真实执行外部 embedding model并返回4096维向量；KG OS real Semantic query成功，相关 credential只通过环境变量进入daemon，Instance持久文件未发现secret；
- `unicode61` 的英文Full-text可命中，但中文短语“知识图”在测试语料中无法提供期望中文分词体验；
- macOS本机系统Node 22执行 `@kgos/cli@0.1.0` 时npm报告engine-version incompatibility，Node 24路径可正常运行；当前package合同已要求 `>=24.15.0`。

同时复现以下 task-affecting findings：

1. 在 `feature` Branch 上 `graph execute` 后，即使已merge回main，`branch delete feature` 会因pooled write connection残留active Branch而失败；再执行一次 `graph execute --branch main` 后删除成功。当前write pool有多connection，因此并发下会进一步成为随机connection-dependent行为。
2. daemon收到SIGTERM并已退出后，旧 `kgosd.lock` locator仍可让CLI观察到unreachable endpoint；业务Runtime ensure需要按D79用daemon-held OS lock完成stale recovery。
3. `kg evolution branch/tag/merge --help` 当前只回显父级Evolution synopsis，无法逐层发现直接子命令。
4. `object patch --pretty` 当前被parser拒绝，与JSON-first通用presentation合同不一致。
5. invalid Provider credential的真实Semantic query返回 `IO_ERROR` + HTTP 401，但诊断尾部出现与HTTP response无关的文本；需按owner边界定位并修复。
6. public Runtime package当前不携带official Jieba，`init`仍把 `unicode61` 作为推荐值。

这些证据说明v0.1.0主链可用，但不能替代本 Phase 对并发、recovery、四平台Jieba和错误路径的新增验收。

## 5. 范围

### 5.1 本 Phase 包含

- pooled write connection 的 Branch / transaction state hygiene；
- stale daemon locator 的 lock-based automatic recovery；
- official Jieba Runtime artifact、manifest、四平台加载与new Instance默认；
- hierarchical CLI help；
- single-JSON-document command的 `--pretty` 一致性；
- OpenAI-compatible Provider HTTP failure诊断正确性；
- CLI Node >=24.15.0 前置条件的package/docs/validation一致性；
- repo外 packed/public-style真实用户回归；
- 受影响设计、开发计划、README / guide在实现完成时同步到真实状态。

### 5.2 不属于本 Phase

- 新 Ontology / Object / Graph / Evolution业务能力；
- Search DSL、`object search/list`、`graph search` convenience；
- Web页面设计或AI Skill；
- Windows、Linux musl / Alpine；
- per-Index Full-text analyzer；
- 自动迁移已有Instance的 `unicode61` config或历史IndexDefinition；
- 为兼容Node 22建立第二套CLI；
- daemon public stop/restart command；
- v0.1.1或其它版本的npm publish、Git tag、GitHub Release。

## 6. 前置依赖与跨仓边界

### 6.1 已满足

1. Phase 00–09全部 `done`，v0.1.0 public npm / GitHub Release已经有实际证据；
2. Lithograph v0.3.0已提供Branch checkout、Version Procedure、FTS5 tokenizer specification和OpenAI-compatible Provider公开合同；
3. KG OS现有Runtime resolver / manifest / four-platform build matrix可以承载新增official native artifact；
4. CLI / SDK / daemon真实packed E2E已经建立，可直接扩展验收而不发明第二套测试入口。

### 6.2 Provider diagnostics 的 owner dependency

如果HTTP 401/429/5xx诊断缺陷定位到 `lithograph-openai-compatible`，实现必须在 **Lithograph仓库对应owner** 修复并取得其测试 / release artifact，再让KG OS更新到通过验收的pinned artifact。KG OS不得按任意message substring猜测分类或改写Provider诊断；若污染来自KG OS所用driver的结构化附加字段，在KG OS adapter按该字段的确定格式剔除附加尾部。

该依赖只阻塞对应Provider Feature与依赖其结果的最终 Phase acceptance；其它工作可以独立推进。

### 6.3 Official Jieba 实现依赖

具体Jieba FTS5实现来源属于工程选择，但它会固定实际tokenization/dictionary语义和native distribution。可以先构建供四平台验证的测试Runtime package；正式接受为可分发实现前，必须通过 [Jieba tokenizer research](../../research/jieba-tokenizer.md) 的选择门：

- 可在KG OS当前许可证 / 分发模式下合法再分发，并完成必要NOTICE / attribution；
- 支持macOS arm64/x64、Linux glibc arm64/x64；
- 以SQLite FTS5 tokenizer方式注册固定 `jieba` 名称；
- tokenizer code与运行所需词典/数据可被Runtime artifact / manifest固定；
- 四平台使用同一逻辑 tokenizer / dictionary version；
- 不要求运行时联网下载或宿主预装可变资源。
- caller additional extension加载后，official artifact能够最后注册exact `jieba`并成为最终identity。

`sqlite-jieba-tokenizer 0.6.0` 的上游命令没有直接产出 `.dylib`；当前实现用 pinned Git revision `720b3fa794b3fe8163fba9088bb964b4c629aa33`、`jieba-rs 0.9.0` 和 `native/jieba/` adapter 产出可加载的official artifact。词典/停词输入hash、license、macOS arm64真实load/query及四平台待验证边界见[研究记录](../../research/jieba-tokenizer.md)。不以本地单平台通过替代本节四平台选择门。

## 7. Feature 顺序

```text
10.1 Write Connection State Isolation
   ├── 10.2 Stale Daemon Recovery
   └── 10.3 Official Jieba Runtime + Default
          ↓
10.4 CLI Discovery & JSON Presentation
          ↓
10.5 Provider Diagnostics + Node Prerequisite
          ↓
10.6 Real-user Regression + Phase Closure
```

10.1–10.3之间没有业务语义依赖，可以按工程方便并行推进；10.6必须消费前面全部最终结果。

## 8. Features

### 10.1 Write Connection State Isolation

- 建立统一 write-connection reusable-baseline helper，不让Graph和Version/ref路径各自实现不同cleanup规则；
- acquire后继续验证autocommit / 无active Lithograph explicit transaction；
- operation结束时，无论success、ordinary error、stream terminal error、context cancellation还是early-close，都在归还pool前验证/恢复：
  - SQLite autocommit；
  - no active Lithograph explicit transaction；
  - checkout `main`；
- request context已经取消时，cleanup使用独立有界内部context，不能直接跳过；
- 任一cleanup或验证失败时discard物理connection，不允许返回pool；
- Evolution branch/tag/state/merge等write path取得connection时必须依赖同一reusable baseline，而不是某个随机历史checkout；
- 保留用户Cypher在**当前operation内**合法checkout其它Branch的能力，不建立procedure allowlist或query rewrite。

必须增加回归覆盖：

- sequential `execute feature -> merge -> delete feature`；
- 多Branch、多write connection并发；
- execute业务错误；
- cancellation；
- streaming consumer early-close；
- stream terminal error；
- cleanup自身失败 / connection discard；
- cleanup后后续Graph / Evolution结果确定。

### 10.2 Stale Daemon Recovery

- 保留 `doctor` side-effect-free，不让doctor为了“更准确”直接spawn或清理lock；
- Runtime ensure看到unreachable locator时spawn当前版本contender；
- contender取得OS lock时按普通startup覆盖stale locator；
- contender取不到OS lock时不得kill owner或启动第二个daemon，有界等待winner/owner恢复endpoint；
- 多CLI并发recovery必须只有一个lock winner；
- PID不存在/存在都不作为ownership裁决；
- reachable wrong-Instance endpoint继续走Bearer失败，不回退；
- reachable version mismatch继续fail closed；
- graceful SIGTERM、abrupt process exit和机器重启后残留locator都覆盖。

### 10.3 Official Jieba Runtime + Default

- 确定满足6.3要求的Jieba FTS5实现，并记录版本、license、attribution与四平台构建输入；
- 把official Jieba加入四个Runtime package staging、manifest/hash、release candidate aggregation与package integrity检查；
- daemon resolver/load order实现为：
  1. Lithograph；
  2. OpenAI-compatible Provider；
  3. caller additional extensions；
  4. official Jieba（最后注册）；
- 每个实际SQLite connection都加载并probe同一official Jieba artifact；
- 增加duplicate-name回归：caller extension即使先注册 `jieba`，official最终注册后实际 `tokenize='jieba'` 仍使用KG OS固定实现；
- `init`省略 `--fulltext-analyzer` 时在TTY与non-TTY都直接解析 `jieba`，不prompt、不进入missing list，最终config显式写出；
- 显式 `--fulltext-analyzer unicode61` 等override继续可用；
- 不修改已有Instance config，不迁移历史IndexDefinition；
- 中文Full-text真实语料验收必须证明默认Jieba能对“知识图”等词提供预期命中；
- package测试不能只断言 `kgos-jieba.*` 文件存在，必须真实load / create index / query。

### 10.4 CLI Discovery & JSON Presentation

- command parser / help renderer按真实命令树逐层输出direct children；
- leaf `--help`输出完整usage、required/optional flag和输入互斥关系；
- help路径不能访问root、daemon、auth或database；
- 建立统一JSON presentation adapter：凡成功stdout是一个JSON document的mode都接受 `--pretty`；
- Object/Ontology Patch、Evolution mutation等当前遗漏命令纳入；
- Ontology Markdown/YAML、Object YAML raw body、Graph NDJSON stream保持非pretty边界；
- `--stream --pretty`等不合法组合继续明确拒绝；
- 中英文help同步同一command topology，机器identifier不翻译。

### 10.5 Provider Diagnostics + Node Prerequisite

Provider：

- 用真实或可控fixture覆盖HTTP 401/403/429/5xx、timeout / network failure；
- 保留Lithograph稳定public error category；
- message/details准确保留HTTP status和安全的bounded diagnostic；
- 禁止无关errno污染HTTP原因；
- credential/header/request secret不进入stdout/stderr/log；
- 根因属于Lithograph Provider时按6.2完成owner fix + KG OS artifact集成。

Node：

- `@kgos/cli.engines.node >=24.15.0` 与repo pinned Node、CI、package checker、README / guide保持一致；
- packed candidate用Node 24 canonical路径验收；
- 不新增Node 22兼容逻辑或fallback CLI；
- 不把 `@kgos/sdk` 浏览器/Web Platform边界错误收窄成Node-only。

### 10.6 Real-user Regression + Phase Closure

在repo外干净目录使用**packed candidate**，不从workspace直接执行CLI源码：

1. Node 24启动 `@kgos/cli`；
2. 未初始化root执行 `doctor`；
3. `init`不传 `--fulltext-analyzer`，验证config显式为 `jieba`；
4. 首个业务命令auto-start daemon并bootstrap；
5. 建立含Full-text + Semantic Index的Ontology；
6. 写入中英文Knowledge；
7. 中文Full-text查询命中；
8. 使用外部OpenAI-compatible test credential做真实Semantic query，credential仅通过进程环境提供；
9. Object batch read / Patch、Graph JSON / file / stream、Evolution State / History / Diff；
10. feature Branch写入、merge回main后**直接**delete feature；
11. error / cancel / stream early-close后重复Branch isolation检查；
12. kill测试daemon制造stale locator，下一业务命令自动恢复；
13. 并发多CLI recovery只产生一个daemon；
14. 从help树逐层发现branch / tag / merge leaf command；
15. JSON mutation `--pretty`成功；
16. secret scan确认Instance、log和artifact不包含测试credential。

真实外部Provider credential只用于临时验收环境，不写入仓库、fixture、Phase文档或CI artifact。

## 9. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | Sequential Branch isolation | 在feature执行Graph并merge后，不需要额外checkout main即可直接delete feature |
| B | Concurrent Branch isolation | 多connection并发在不同Branch执行后，Graph/Evolution结果不依赖pool随机connection |
| C | Error/cancel/stream cleanup | ordinary error、cancel、terminal stream error、early-close均不泄漏checkout/active tx |
| D | Unsafe connection discard | cleanup无法证明reusable baseline时物理connection被discard，后续新connection正常 |
| E | Stale locator recovery | owner进程已退出且locator残留时，下一业务命令自动由lock winner恢复daemon |
| F | Live owner fail-closed | endpoint不可用但owner仍持OS lock时，不启动第二daemon、不kill owner，最终明确unavailable |
| G | Concurrent daemon recovery | 多caller同时recovery只有一个lock winner，其余复用winner |
| H | Official Jieba package | exact source/dictionary/license已冻结；四平台Runtime manifest包含并校验official Jieba及所需运行数据，每个真实connection可load/probe，且caller同名registration不能改变最终 `jieba` identity |
| I | Jieba default | new Instance省略fulltext flag后config显式 `jieba`；TTY/non-TTY都不prompt该字段 |
| J | Analyzer override / existing instance | 显式unicode61仍可用；已有unicode61 Instance/历史定义不被自动改写 |
| K | Chinese Full-text | 默认Jieba下真实中文Knowledge对“知识图”等查询按预期命中 |
| L | Hierarchical help | namespace help列direct children，leaf help完整；全部help不触碰Instance |
| M | Pretty consistency | 所有single-JSON-document mode接受pretty；Markdown/YAML/NDJSON边界保持明确 |
| N | Provider diagnostics | 401/403/429/5xx/timeout诊断准确、category稳定、无无关errno与secret泄漏 |
| O | Node baseline | package engines、toolchain、CI、README/guide与Node >=24.15.0一致；packed Node24 smoke通过 |
| P | Real-user E2E | packed candidate完成init→Jieba Full-text→real Semantic→Object/Graph/Evolution→Branch/daemon recovery主链 |
| Q | Repository quality | targeted + full validation、race/security/coverage、fresh-source、four-platform native/package matrix与final review全部满足 |
| R | Status truth | Design / Development / README / guide只记录实际完成结果；Phase 10不冒充public release |

## 10. 关键失败路径

至少覆盖：

1. pooled connection返回时仍checkout非main；
2. cleanup运行时request context已经cancel；
3. `lithograph_rows()` stream被consumer early-close；
4. operation失败同时cleanup也失败；
5. connection仍有active explicit transaction；
6. 多Branch并发反复复用write pool；
7. stale locator PID已被其它进程复用；
8. 多CLI同时spawn stale-recovery contender；
9. endpoint不可用但真实owner仍持lock；
10. wrong endpoint可连接但token属于另一Instance；
11. Runtime package缺Jieba binary / dictionary / manifest entry或hash mismatch；
12. 某个平台能load artifact但没有注册 `jieba`；
13. caller extension在official之后覆盖 `jieba`，或四平台Jieba词典/语义漂移；
14. new init仍要求non-TTY显式提供fulltext analyzer；
15. explicit analyzer override被默认jieba覆盖；
16. 已有unicode61 Instance被自动迁移；
17. help子namespace只显示 `...` 而不列children；
18. JSON mutation拒绝 `--pretty` 或pretty改变逻辑value；
19. Provider 401被无关OS error污染；
20. Provider错误泄露Authorization/api key；
21. Node <24路径被误认为受支持并进入不可预测执行；
22. E2E误用workspace/local artifact而产生假阳性；
23. test credential进入repository、log或artifact。

## 11. 验证计划

### Targeted

- Go Host connection reusable-baseline / discard unit + integration tests；
- Graph sequential / concurrent Branch leakage regression；
- streaming/error/cancellation cleanup tests；
- Runtime ensure stale locator / live lock owner / concurrent contender tests；
- TypeScript CLI help snapshot / parser tests；
- `--pretty` mode matrix；
- init default/override/non-TTY missing-field tests；
- Runtime manifest/Jieba resolver/load tests，包括caller先注册同名 `jieba` 后official最终覆盖的回归；
- Provider error fixture / owner-repo tests；
- package Node engines/version checker。

### Native / integration

- 真实 bundled SQLite + FTS5 + Lithograph + Provider + Jieba；
- real `kgosd` packaged startup；
- default Jieba create/query中文语料；
- explicit unicode61 override；
- daemon SIGTERM / abrupt exit stale recovery；
- multiple CLI concurrent auto-start/recovery；
- Graph stream cancellation / early close；
- real OpenAI-compatible Semantic query with ephemeral credential；
- secret/log hygiene。

### Repository gates

- `pnpm check:quick`；
- `pnpm validate`；
- Go race / coverage / govulncheck；
- TypeScript coverage / typecheck / lint；
- license / NOTICE / dependency / audit gates，尤其新增Jieba dependency；
- `git diff --check`；
- Markdown links / spelling；
- final staged/unstaged/untracked/generated/secret hygiene。

### Fresh-source / platform

- 独立 fresh-source `pnpm run setup && pnpm validate`；
- macOS arm64/x64、Linux glibc arm64/x64 native Runtime build/load/package；
- 每个平台packed candidate从package执行Jieba load/query；
- repo外packed CLI real-user smoke。

Phase 10 不以“某个平台只有cross-build成功”替代真实目标runner的load/probe证据。

## 12. Review 重点

- 是否真正清理 pooled connection，还是只在下一Graph operation覆盖；
- cleanup失败是否错误把connection放回pool；
- cancellation / early-close是否绕过cleanup；
- Evolution Version/ref operation是否仍会观察hidden checkout；
- stale recovery是否错误信任PID、删除lock文件或force-kill；
- concurrent recovery是否可能产生两个daemon；
- official Jieba是否错误写进Lithograph产品或caller config；
- Jieba词典是否存在未versioned的宿主/网络依赖；
- default Jieba是否破坏显式analyzer override或改写已有Instance；
- help实现是否仍需要root/daemon；
- `--pretty`是否改变JSON内容而非纯whitespace；
- Provider fix是否位于真实owner；若污染来自KG OS driver，adapter是否仅依据结构化字段剔除确定的附加尾部；
- Node baseline是否误收窄SDK或引入Node 22兼容层；
- real-user smoke是否真正离开workspace且secret不落盘；
- 是否顺手扩大到Web/Skill/Windows/musl/new Search API。

发现task-affecting finding后执行“修复 → targeted复验 → 必要范围扩大验证 → 再Review”；没有新的具体 finding 时停止。

## 13. 完成条件

Phase 10 只有同时满足以下条件才能进入 `done`：

1. 10.1–10.6全部实现；
2. Acceptance A–R均取得当前worktree/revision绑定的真实证据；
3. D78的sequential + concurrent + failure/cancel/stream Branch isolation全部通过；
4. D79 stale recovery在dead owner / live owner / concurrent caller三类边界均通过；
5. official Jieba exact source/dictionary/license冻结，四个平台package、manifest、最终registration、load/probe和中文query均通过；
6. init默认Jieba与explicit override / existing-instance non-migration通过；
7. CLI hierarchical help与JSON pretty matrix通过；
8. Provider HTTP diagnostics owner修复与KG OS真实integration通过；
9. Node >=24.15.0 contract在package/docs/CI中一致；
10. 主工作树与fresh-source完整validation通过；
11. 四平台native/package matrix通过；
12. repo外packed real-user acceptance完成且secret hygiene通过；
13. Phase-level review没有剩余task-affecting finding；
14. README、Design status、Development roadmap、guide与vlog按各自职责同步；
15. final diff / links / license / audit / secret / generated-file hygiene通过。

Commit、push和public release不是本 Phase自动包含的动作。只有实际执行后才能另行记录为已提交、已推送或已发布。

## 14. 当前状态

2026-09-27：`in_progress`，工作树candidate，尚未提交/推送/发布。

- macOS arm64 targeted native：Graph/Evolution pooled-connection顺序与并发、错误/取消/stream early-close、unsafe connection discard；official Jieba真实load/query与caller同名覆盖回归；Provider 401/403/429/500、network/timeout fixture均通过。
- repo外 packed candidate：Node 24安装tarball、未初始化doctor、init默认Jieba与显式unicode61 override、并发auto-start、wrong-Instance Bearer拒绝、Graph/Object/Evolution、merge后直接delete Branch、层级help、pretty、SIGTERM stale恢复与四caller竞争、通过Ontology Patch建立Full-text + Semantic Index、中文Full-text、loopback OpenAI-compatible Semantic query和secret scan通过。
- Provider诊断根因是KG OS使用go-sqlite3 `Error()`时，该驱动把`sqlite3_system_errno`追加到Lithograph已返回的干净HTTP message后。KG OS adapter现在只根据驱动的结构化`SystemErrno`剔除这个精确附加尾部，保留`IO_ERROR`和SQLite code；当前证据不指向Lithograph Provider实现缺陷，因此没有跨仓修改或更换pinned Lithograph artifact。
- macOS arm64主工作树`pnpm validate`与独立fresh-source`pnpm run setup && pnpm validate`均通过：Go race、statement coverage 90.0%、govulncheck、TypeScript 16文件/89测试与覆盖率、Playwright、native、packed、Rust/npm/Go license、audit和diff门禁全绿。`pnpm check:quick`也已单独通过。
- repo外packed candidate用真实外部OpenAI-compatible endpoint、环境变量凭据和Ontology Patch完成中文Full-text与Semantic query，各命中一条Knowledge；临时Instance文件未发现credential。该endpoint在KG OS当前请求形状下返回4096维，用户提供的2048维与实际响应不一致，因此测试Index按实测4096维配置；未把credential值写入仓库、fixture、日志或文档。
- 仍待：macOS x64、Linux glibc arm64/x64三个目标runner对本次candidate的native/package build、load/probe、中文query与packed smoke。没有这些证据前不标记`done`，也不把本地candidate称为public release。
