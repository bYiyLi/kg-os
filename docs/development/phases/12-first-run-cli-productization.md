# Phase 12：First-Run & CLI Productization

## 目标与状态

`ready`。本阶段把 Phase 00–11 已实现的 Kernel、Runtime、SDK 与 CLI 能力收敛成一个可完整初始化、可自发现、可恢复的 first-run 产品路径，不增加新的 Knowledge / Graph / Evolution 业务语义。

完成后的可观察结果：

```text
Workspace Root
  → <root>/.kgos Instance
  → complete init
  → extensions / credential / Knowledge Base / bootstrap ready
  → daemon running
  → doctor ready
  → existing Ontology / Object / Graph / Evolution commands usable
```

本阶段实现 [D81 Workspace Root](../../design/decisions.md#d81-workspace-root)、[D82 Init readiness](../../design/decisions.md#d82-init-readiness) 与 [D83 CLI progressive disclosure](../../design/decisions.md#d83-cli-progressive-disclosure)。公开 v0.1.1 仍是旧 root-is-Instance / lazy-bootstrap 实现；本计划不能作为新行为已经实现或已经发布的证据。

## 设计输入

- [CLI Global root / Help / Doctor / Init](../../design/cli.md)：`--root > KGOS_ROOT`、职责分层 help、交互信息质量、完整 setup 与 resume。
- [Runtime Workspace Root / Native Runtime / daemon lifecycle](../../design/runtime.md)：`<root>/.kgos`、official/additional extension resolver、credential、database、bootstrap、active locator。
- [Client](../../design/client.md)：npm/npx 分发、platform Runtime package、SDK 与本地 CLI 职责边界。
- [Architecture bootstrap](../../design/architecture.md#knowledge-base-bootstrap)：Lithograph init 与第一个 KG OS-valid State。
- [公共错误合同](../../design/contracts.md#公共错误合同)：认证、SQLite extension、Full-text、Embedding 与 CLI error mapping。
- [工程映射](../../design/implementation.md)：复用现有 Go Runtime / resolver / bootstrap primitive，不在 TypeScript CLI 复制第二套 native lifecycle。

## 范围

### P12-01 Workspace Root 与 Instance Directory

- CLI 统一解析 `--root <workspace-root>` > 非空 `KGOS_ROOT` > `INVALID_ARGUMENT`。
- 所有 Instance-local path 固定派生到 `<root>/.kgos`；Workspace 顶层不再创建 `config.toml/auth.json/kgos.db/kgosd.lock/cache/extensions/logs`。
- `kgosd --root` 参数改为 Workspace Root，并在 Go Runtime 内唯一派生 Instance Directory。
- 两个 Workspace 必须保持 config/token/lock/database/cache/extensions/logs/daemon 完全隔离。
- 检测可识别的 v0.1.x root-is-Instance legacy layout并明确诊断；本阶段不自动迁移、不双读。

### P12-02 Init configuration source

- 收敛一份可同时驱动 config validation、init flags、interactive prompts、help metadata 与 serialization 的初始化配置定义；不得再出现 config parser支持字段而init/help遗漏的状态。
- Cache、Full-text、Embedding 保持现有配置语义；`jieba` 保持官方默认。
- caller additional `sqlite.extensions` 进入正式 init surface。
- 非交互 additional extensions 使用 `--extensions-file <path>` 或 `--no-additional-extensions`；两者互斥，前者读取与 `[[sqlite.extensions]]` 同字段的 UTF-8 JSON array。

### P12-03 Progressive init wizard

交互 wizard 按以下职责顺序呈现：

```text
Workspace / Instance      display
Runtime                   automatic verification
Cache                     decision
Additional extensions     default none; expand only when selected
Full-text                 display built-in default / explicit override
Embedding                 decision
Review                    effective values only
Initialize                concise execution status
```

- 自动可确定的 Runtime target、official Lithograph / Provider / Jieba、`.kgos` 内部路径不变成用户问题。
- Human-facing prompt 使用阶段内的业务标签、单位与内联默认值，不直接显示 `--cache-path` / `--embedding-model` 等 CLI flag 名充当问题；flag 名只用于 non-interactive adapter/help。
- 初始化后不可变配置只提示一次。
- 高级 additional extension 字段只在用户选择添加时展开。
- 只有实际进入过 wizard 的调用在执行前做一次 Review 确认；完全参数化 / non-TTY 路径零 prompt。
- 人类输出遵守“有效、高信息密度、职责明确、渐进披露”；不使用逐内部步骤刷屏替代状态摘要。

### P12-04 Complete Init readiness

`init` 成功前必须完成：

1. 建立 `.kgos` 所需目录并原子发布完整 config；
2. 验证当前 native Runtime package / target / manifest；
3. 通过现有 daemon resolver materialize official 与 additional extensions；
4. 创建或读取稳定 `auth.json`；
5. 创建/打开 `kgos.db`，完成 Lithograph init；
6. 完成 KG OS bootstrap / consistency validation；
7. daemon 绑定 dynamic loopback endpoint并发布 locator；
8. CLI 使用同一 Instance token完成最小 authenticated readiness 验证；
9. daemon 保持 running。

TypeScript CLI 不复制 archive/hash/load/bootstrap 实现；它编排现有 `kgosd` startup path并判断最终 readiness。

### P12-05 Init recovery 与幂等

- ready Instance再次 `init` → `already_initialized`。
- config已发布但后续可恢复步骤失败 → 再次 `init` 复用合法config并继续缺失步骤，不重复询问配置。
- malformed/unreadable config/auth/database或不可安全恢复状态 → fail closed，不自动覆盖。
- 已存在config时携带任何配置/extension设置参数 → `INVALID_ARGUMENT`，避免把resume变成config mutation。
- 业务命令遇到从未完成init的Workspace必须明确失败；不得通过Runtime ensure隐式完成首次bootstrap。

### P12-06 Doctor 对齐

`doctor` 保持 side-effect-free，并按当前 Workspace 检查：

- Workspace Root 与 `.kgos` Instance Directory；
- config完整性；
- platform Runtime package；
- official/additional extension materialization/source状态；
- required environment；
- auth/database/bootstrap可确定状态；
- daemon locator/version/reachability/authentication；
- legacy layout。

人类输出优先显示 Workspace / Instance 与 blocking finding；machine `--json` 保留稳定identifier。已初始化Instance的daemon `stopped` 可以是非blocking；未完成init不能报告ready。

### P12-07 Responsibility-scoped Help

- root help：CLI作用、一级命令、`--root > KGOS_ROOT`、全局选项、少量入口示例。
- namespace help：能力职责、直接子命令、当前层级共享且必要的概念/示例。
- leaf help：完整usage、必要argument/option、范围/默认/互斥/输入输出约束，以及1..3个主路径示例。
- StateRef、pagination、stdin/file、streaming、write behavior只在当前命令适用时出现；不机械复制固定章节。
- help/version不读取 Workspace、Instance、credential、lock或daemon。
- 中英文 help 使用同一结构化命令 metadata，避免命令树/参数说明漂移。

### P12-08 Fresh-user acceptance

使用 repo 外 fresh Workspace 验证真实用户路径：

```text
npm package acquisition
→ root resolution
→ init
→ .kgos complete layout
→ official/additional extension materialization
→ daemon ready
→ doctor ready
→ ontology --at branch/main
→ representative Object / Graph / Evolution operation
```

macOS arm64/x64、Linux glibc arm64/x64、Windows arm64/x64 的 native/package CI 都必须使用 packed CLI 对 fresh Workspace 至少执行 `init -> doctor ready -> ontology --at branch/main` first-run smoke，并真实加载当前平台 native Runtime / official extensions；不能只检查 package 文件存在。Windows x64 与开发机 macOS arm64 另外执行 repo 外完整 fresh-user 端到端路径，覆盖交互 wizard 与 non-interactive setup。

## 非目标

本阶段不实现：

- Human-facing Web页面；
- KG OS Skill；
- 新的 Ontology / Object / Graph / Evolution capability；
- Knowledge Base registry、`base use`、多库daemon或cwd/父目录自动发现；
- v0.1.x Instance 自动迁移；
- daemon stop/restart公共命令；
- 配置热更新、`config set` 或初始化后配置迁移；
- 新的npm发布、Git tag或GitHub Release。后续若要发布包含该breaking change的版本，单独执行release授权与验收。

## 实现顺序与依赖

```text
P12-01 Workspace/Instance path primitive
    ↓
P12-02 shared init/config metadata
    ↓
P12-03 wizard + P12-07 help metadata
    ↓
P12-04 complete init orchestration
    ↓
P12-05 recovery/idempotency
    ↓
P12-06 doctor alignment
    ↓
P12-08 packed fresh-user / six-platform acceptance
```

Path primitive必须先统一，避免init/doctor/runtime各自拼接两套目录。Config metadata先于wizard/help，避免先复制字符串再补同步机制。Complete init复用Runtime primitive后再做resume，不能用测试mock替代真实daemon/bootstrap。

## Acceptance

### Root / layout

1. `--root X` 与 `KGOS_ROOT=Y` 同时存在时只使用 X；仅有有效 `KGOS_ROOT` 时使用 Y；两者缺失/空时在Instance I/O前以 `INVALID_ARGUMENT` / exit 2失败。
2. 相对root解析为absolute Workspace；不向cwd父目录搜索，不自动使用home。
3. fresh init只在 `<root>/.kgos` 创建内部状态；Workspace顶层无KG OS内部散落文件。
4. 两个Workspace并发使用时daemon/token/database/cache/extensions/logs完全隔离。
5. legacy v0.1.x root-is-Instance布局被 `doctor/init` 明确识别并停止，不创建 `<root>/.kgos` 嵌套Instance。

### Init / extensions

1. TTY wizard只询问需要用户决定的配置；Runtime target、official artifacts和内部路径只展示不询问。
2. 默认additional extensions路径只需一次none决策；选择添加后才逐项询问source/entrypoint/library/sha256，并支持多entry。
3. fulltext默认 `jieba` 不产生无意义确认问题；初始化后不可变提示只出现一次。
4. 完全参数化 non-interactive init 零 prompt；缺少必需 scalar 或 additional-extension 选择时返回稳定 `INIT_CONFIGURATION_INCOMPLETE`；非空 `embedding.api_key_env` 缺失/为空时在配置发布前明确失败且不询问/记录 secret。
5. `--extensions-file` 与 `--no-additional-extensions` 互斥；非法JSON/字段、HTTPS缺hash、official entrypoint冒充等在写入/启动前按现有错误合同失败。
6. init成功时 `config.toml`、`auth.json`、`kgos.db`、content-addressed official extensions、caller additional extensions（如有）、cache/logs目录与active locator全部存在/有效，Lithograph和KG OS bootstrap完成。
7. init成功后daemon保持running，紧接 `doctor` 为ready，并能执行 `ontology --at branch/main`。
8. 在config发布后注入可恢复失败，再次init不重新询问或改写config，只补齐缺失步骤；最终达到与一次成功init相同状态。
9. ready Instance重复init不产生新token、数据库或bootstrap Commit，返回 `already_initialized`。
10. 未完成首次init时直接业务命令不隐式创建credential/database/bootstrap。

### Help / information quality

1. root help只承担全局入口职责，明确 `--root > KGOS_ROOT` 和一级命令，不展开业务子系统细节。
2. 每个namespace help列出直接子命令并解释该namespace的使用职责；不复制所有leaf flags。
3. 每个leaf help可独立构造合法主路径调用：required项、重要optional项、必要范围/默认/互斥输入与1..3个示例齐全。
4. 只有需要的命令显示StateRef/pagination/stdin-file/streaming等专项说明；snapshot/review防止help退化为“一行usage”，也防止把设计文档整段复制进help。
5. 中英文help命令树、flags、默认/范围与示例语义一致；machine identifier不翻译。
6. `--help` / `--version` 在没有root、无config、无daemon环境中仍成功且无Instance副作用。

### Regression / engineering gates

1. 现有 Ontology / Object / Graph / Evolution logical contract与SDK HTTP surface无语义变化。
2. Runtime extension resolver继续只有一套；official→Provider→caller additional→official Jieba的per-connection load顺序与capability probes保持。
3. `pnpm validate`、Go test/race/coverage/govulncheck、TypeScript test/coverage、package/license/audit/diff gates与repo当前必需质量门禁全部通过。
4. 独立 fresh-source checkout完成setup + full validation；无本地cache/未跟踪文件依赖。
5. 六平台 native/package CI 都通过 packed fresh-Workspace first-run smoke；Windows x64 与 macOS arm64 的 repo 外完整 fresh-user 路径成功；测试结束后没有遗留 daemon 或临时 Instance。
6. Final review逐项检查“有效、高信息密度、职责明确、渐进披露”，以及root/path、init恢复、secret、extension trust boundary与历史v0.1.1状态是否被误写；所有task-affecting finding关闭。

## 完成条件

只有 P12-01–P12-08 全部实现、全部 Acceptance 取得真实证据、设计/计划/README/开发指南按各自职责同步、final diff/review无剩余本阶段finding，并且要求的远端六平台CI实际成功后，Phase 12 才能从 `ready` 更新为 `done`。

当前文件只定义计划与验收；尚未执行Phase 12代码实现、CI、发布、提交或推送。
