# Phase 13：Init Wizard UX & Embedding Credential Boundary

## 目标与状态

`in_progress`。本阶段实现 [D84 Embedding credential / wizard boundary](../../design/decisions.md#d84-late-bound-embedding-credential)，修复 v0.2.0 真实 first-run 暴露的交互误导与 credential 过早校验问题；不增加新的 Knowledge / Ontology / Graph / Evolution 业务能力。

完成后的可观察结果：

```text
kg init
  → defaults clear
  → official Runtime capabilities need no user setup
  → optional custom SQLite extension branch is unambiguous
  → recoverable TTY input mistakes retry in place
  → api_key_env stores only an env name
  → init / daemon / ordinary KG OS commands do not require that secret yet
  → only Semantic Provider operations resolve the credential
```

当前公开版本仍为 **v0.2.0**。Phase 13 的代码实现、本地主工作树/fresh-source 门禁与 macOS arm64 repo-out packed / TTY 验收已完成；六平台远端 native/package CI 尚未执行，因此阶段保持 `in_progress`。本阶段不包含版本发布；只有全部 Acceptance 与六平台远端门禁实际完成后才能更新为 `done`。

## 设计输入

- [D84 Embedding credential / wizard boundary](../../design/decisions.md#d84-late-bound-embedding-credential)：credential Provider operation-time resolution、doctor 非阻塞诊断、TTY 原地重试与自定义 extension 信息边界。
- [CLI Doctor](../../design/cli.md#doctor) / [Init](../../design/cli.md#init)：wizard prompt、non-interactive adapter、Review、doctor 与业务 CLI preflight。
- [Runtime Embedding](../../design/runtime.md#embedding-配置与索引映射)：startup 静态 config validation、Provider mapping 与 operation-time credential ownership。
- [公共错误合同](../../design/contracts.md#公共错误合同)：Embedding config error 与实际 Semantic Provider request error 的边界。
- Lithograph 当前 OpenAI-compatible Provider 设计/实现作为下层集成证据：Provider `validate` 不要求 `api_key_env` 对应变量存在，真正 request 时才解析。KG OS 不复制该设计真源，也不修改 Lithograph。
- [Phase 12](12-first-run-cli-productization.md)：Workspace/Instance、complete init/recovery、official/additional extension ownership 与 six-platform fresh-user acceptance 基线。

## 范围

### P13-01 Shared interactive prompt metadata

- 保持现有 `INIT_FIELD_SPECS` 为 scalar init 字段的 default / label / help 单一元数据来源；wizard prompt 继续从它生成中英文 label 与 `[default]`，不得复制第二份默认值。字段合法性继续复用 config validation，不为交互路径建立第二套 schema。
- Cache / Embedding 的交互推荐值统一显示为 `[value]`；Enter 明确采用该值。
- `fulltext.analyzer=jieba` 继续作为自动产品默认，不重新增加 prompt。
- `embedding.api_key_env` 继续支持输入 `""` 表示 no-auth；Enter 使用 `[OPENAI_API_KEY]`，不读取 secret。

### P13-02 Custom SQLite extension wizard

- Human-facing 标题/问题明确说明这是**额外第三方 / 自定义 SQLite extension**，official Lithograph / OpenAI-compatible Provider / Jieba 已由 Runtime 自动提供。
- `source` prompt 给出 absolute local path / HTTPS URL 约束；`entrypoint` 标明 SQLite extension init symbol。
- archive 才询问 `library`，remote 才询问 `sha256`；多 entry 行为与现有 config contract保持。
- 不改变 `--extensions-file`、`--no-additional-extensions`、`[[sqlite.extensions]]` schema、official-entrypoint protection 或 resolver。

### P13-03 Recoverable TTY validation loop

- TTY wizard 中可由重新输入修复的错误在当前字段原地提示并重试，不退出整个 `init`：
  - scalar 显式输入的格式/范围错误；普通空 Enter 仍采用 `[default]`；
  - yes/no 非法输入；
  - extension 必填字段空值，以及 `source/entrypoint/library/sha256` 非法值。
- 复用现有 config/extension validators，避免 prompt 与最终 parser 出现两套合法性规则；必要时只增加把稳定 validation 结果映射成人类提示的薄层。
- 文件读取、Runtime package、extension materialization/download、daemon、database、bootstrap、authenticated readiness 等执行失败不属于输入重试，仍正常终止。
- non-interactive flags / `--extensions-file` 继续 fail-fast，错误 code/exit contract不变。

### P13-04 Remove CLI credential preflight

删除 TypeScript CLI 对 `embedding.api_key_env` **值是否存在**的全局 preflight，同时保留字段本身的静态校验：

- interactive Review 不检查 env value；
- fresh non-interactive init 不检查 env value；
- init resume / `already_initialized` 不检查 env value；
- Ontology / Object / Graph / Evolution command dispatch 不因 env missing 提前失败。

如果现有 `validateRequiredEnvironment()` 在移除这些调用后没有合法职责，直接删除函数及对应测试；不保留未使用的兼容层。

### P13-05 Runtime startup credential boundary

- Go `runtimeprofile.LoadConfig` 只解析/静态校验 `embedding.api_key_env` 名称，不调用 env-value validation。
- 如果 `ValidateEmbeddingEnvironment` 失去全部正式调用方，删除它及仅服务旧 startup gate 的测试。
- startup staged Semantic create + rollback probe 保留：它验证 Provider registration / static providerConfig，不发送远端请求；依据 Lithograph 当前合同，不能因为 credential env missing 失败。
- Semantic Index compiler 仍把非空 env **名称**写入 Provider `providerConfig`；空字符串继续省略 `api_key_env`。

### P13-06 Doctor non-blocking environment diagnostic

- `doctor` 保留现有 `environment` check identifier，只观察**本次 CLI invocation** 的环境：configured env 当前 set/non-empty → `status=ok, blocking=false`；missing/empty → `status=info, blocking=false`。
- 该检查不推断一个已经运行中的 daemon 是否继承了相同环境，env missing 也不得单独令已初始化 Instance `ready=false`。
- `api_key_env=""` → `status=ok, blocking=false`，明确报告 no authentication required。
- 人类输出和 `--json` 都不得包含 resolved secret value；不新增第二个 credential-env check。

### P13-07 Review / information quality

交互 Review 使用高密度分组，至少使用户能直接核对：

```text
Workspace / Instance
Cache
Custom SQLite extensions
Full-text
Embedding
  Base URL
  Model
  Dimensions
  Similarity
  Credential env name / no-auth
```

- 不显示 secret；
- 不把 official Runtime extensions伪装成用户配置；
- 只保留一次最终 Initialize 确认；
- 中英文结构与语义一致。

### P13-08 Regression and packaged first-run acceptance

围绕真实用户路径补充/调整测试与 packed smoke：

```text
OPENAI_API_KEY unset
→ fresh init with api_key_env=OPENAI_API_KEY
→ daemon ready
→ doctor ready (credential availability non-blocking)
→ ontology / object / evolution and non-Semantic graph operation usable
→ Semantic operation that actually needs Provider request
→ clear operation-time credential failure
```

同时覆盖自定义 extension wizard 输入重试与 existing Phase 12 init recovery / isolation 路径。

## 非目标

本阶段不实现：

- Embedding enable/disable 开关；
- credential store、Keychain、`.env` loader、secret registry 或 inline `api_key`；
- 新 Provider abstraction / registry；
- Runtime/Kernel 新业务能力；
- SQLite extension manager 或新的 extension config schema；
- 修改 Lithograph Provider；
- config mutation / migration / fingerprint；
- Web / Skill；
- npm 发布、Git tag、GitHub Release。

## 实现顺序与依赖

```text
P13-04 CLI credential gate + P13-05 Runtime startup boundary
    ↓
P13-06 doctor non-blocking diagnostic
    ↓
P13-01 shared prompt metadata
    ↓
P13-02 custom extension wording/fields
    ↓
P13-03 TTY retry loop
    ↓
P13-07 Review output
    ↓
P13-08 targeted + packed + six-platform acceptance
```

Credential boundary先收口，避免 wizard 改完后仍被 Go startup gate 阻塞。Prompt metadata先于 retry loop，避免为每个字段手写重复 validator/文案。Doctor 在 credential ownership稳定后再调整 readiness。最后用 packed fresh-user 路径证明不是只通过 unit test。

## Acceptance

### Wizard / UX

1. 中文与英文 TTY prompt 使用 `[default]` 表示 Enter 采用推荐值；Cache / Embedding默认值与 design一致，`fulltext.analyzer` 不新增 prompt。
2. 默认 extension 路径明确是“额外第三方/自定义 SQLite extension”，普通用户选择默认 `N` 不需要理解 official artifact path/entrypoint。
3. 选择添加后，`source/entrypoint` prompt 含足够格式信息；archive/remote 条件字段只在适用时出现。
4. TTY 输入非法 yes/no、空/非法 source、空 entrypoint、非法 library/SHA、scalar 范围/格式错误时原地重试；修正后同一次 `init` 能继续。
5. non-interactive invalid flags/file 仍 fail-fast，稳定 error/exit contract不因 TTY retry 改变。
6. Review 只展示 effective config、custom extension count/details与 credential env **名称/no-auth**，不显示 secret。

### Credential boundary

1. `OPENAI_API_KEY` 未设置、配置 `embedding.api_key_env="OPENAI_API_KEY"` 时，interactive 与 fully parameterized fresh `init` 都能完成。
2. 同一条件下 config-only recovery、resume 与 ready Instance重复 `init` 不因 env missing 失败。
3. `kgosd` 能在 env missing 时启动并达到 ready；startup staged Semantic config probe仍成功且不发网络请求。
4. Ontology / Object / Evolution 与不需要 Semantic Provider 的 Graph operation在 env missing 时正常工作。
5. 真正调用 OpenAI-compatible Provider 的 Semantic operation在 env missing/empty 时以 Lithograph `INVALID_ARGUMENT` 明确失败，KG OS 不改写为 `EMBEDDING_CONFIG_ERROR`；daemon保持可用。
6. `api_key_env=""` 继续表示 no-auth，不读取任何默认环境变量。
7. KG OS 不新增 secret persistence，任何日志、doctor、Review、error都不回显 resolved credential。

### Doctor

1. 本次 CLI invocation 中 configured env available时 environment check 为 `ok/non-blocking`；missing/empty时为 `info/non-blocking`；no-auth时为 `ok/non-blocking`。
2. env missing本身不使完整 Instance `ready=false`。
3. 诊断必须明确它观察的是当前 CLI process environment；已有 daemon 的实际 env 可能不同，不能把该检查写成 daemon credential readiness 证明。
4. invalid config field仍是 blocking config error；不得把“变量当前不存在”和“api_key_env字段非法”混为一类。
5. `doctor` 继续 side-effect-free，不启动 daemon、不写文件、不发 Provider请求。

### Regression / engineering gates

1. Phase 12 Workspace Root、`.kgos` layout、init completion receipt、recovery/idempotency、official/additional extension resolver与daemon lifecycle无回归。
2. Lithograph integration保持单一 Provider/extension owner；KG OS不新增HTTP client或Provider credential resolver。
3. Targeted TypeScript/Go tests覆盖 prompt retry、CLI dispatch、init fresh/resume/already-initialized、doctor与Runtime config/startup。
4. `pnpm validate` 与仓库现有 Go test/race/coverage/govulncheck、TypeScript coverage、package/license/audit/diff gates全部通过。
5. 独立 fresh-source `pnpm run setup && pnpm validate` 通过，无本地 cache/未跟踪文件依赖。
6. repo 外 packed CLI 至少验证 macOS arm64 的真实中文/英文 TTY first-run与 non-interactive no-key路径。
7. 六平台 native/package CI 的 packed fresh-Workspace smoke在默认 `OPENAI_API_KEY` 未注入时完成 `init -> doctor ready -> ontology --at branch/main`，并保留各平台原有 native Runtime / official extension load覆盖。
8. Final review同时检查 credential ownership、secret safety、TTY/non-TTY错误边界、extension信息设计与 Phase 12 recovery；所有 task-affecting finding关闭。

## Review Checklist

每轮 review 至少检查：

- 是否仍有 TypeScript/Go startup路径把 env-value existence 当成全局 prerequisite；
- 是否存在删除 CLI gate但 Go `LoadConfig` 仍阻塞的半修复；
- startup staged Provider probe是否仍保持 no-network/static-only；
- TTY retry是否复用最终 validator，而不是复制一套弱校验；
- prompt是否清楚区分 official Runtime extension 与 caller custom extension；
- doctor missing-env是否真的 non-blocking且不泄漏secret；
- non-interactive machine contract是否保持稳定；
- existing Phase 12 init recovery/receipt/legacy-layout语义是否未被顺手改写；
- 是否引入了不必要的 credential/config/provider abstraction。

Review发现问题后在同一阶段修复并重新执行受影响验证，不以一次绿测或文档自洽代替最终 review。

## 当前实现与验收证据

截至 2026-09-29，本工作树已经完成 P13-01–P13-08 的本地实现与验收，远端六平台 CI 除外：

- TypeScript CLI 已删除 init、resume/already-initialized 与业务命令入口的 credential env-value preflight；Go `runtimeprofile.LoadConfig` 同样只做静态配置校验，不再解析环境变量值。`api_key_env=""` 继续表示 no-auth，非空名称只在实际 Semantic Provider operation 中解析。
- `doctor` 的 `environment` check 只观察当前 CLI process：available 为 `ok/non-blocking`，missing/empty 为 `info/non-blocking`，no-auth 为 `ok/non-blocking`；JSON、Review 与错误路径均不回显 resolved secret。
- TTY wizard 使用共享 init schema / final config validators 做字段级原地重试；custom SQLite extension 分支明确区分 Runtime official Lithograph / OpenAI-compatible Provider / Jieba，并覆盖 source、entrypoint、archive library 与 remote SHA-256 的条件输入。
- 主工作树完整 `pnpm validate` 通过：Go statement coverage **90.0%**、race 与 govulncheck 通过；TypeScript 17 files / **103 tests** 通过，statements / lines / functions **100%**、type coverage **99.69%**；jscpd **0 clones**，Playwright、真实 Lithograph/Jieba native suite、packed package、license、audit 与 diff gates 全部通过。
- 独立 fresh clone 应用当前 task diff 后执行 `pnpm run setup && pnpm validate` 成功。首次 setup 下载 GitHub release asset 时发生一次外部 TLS connection reset，在确认没有不确定副作用后原样重试成功；后续完整 validate 全绿，不依赖主工作树 `node_modules`、`.cache` 或构建产物。
- repo 外安装当前 packed `@kgos/sdk` / `@kgos/cli` / macOS arm64 Runtime 后，英文和中文真实 PTY 默认 wizard 均在 `OPENAI_API_KEY` 未提供时完成 `init`；随后 `doctor --json` 为 `ready=true` 且 environment 为 `info/non-blocking`，`ontology --at branch/main` 正常工作。
- packed smoke 在 key 缺失时完成 init、doctor 与 Ontology/Object/Evolution/non-Semantic Graph 路径，并验证真实 Semantic request 以 Lithograph `INVALID_ARGUMENT` 失败；提供 credential 后重启 daemon，Semantic query 成功。
- final local review 已复查 credential ownership、secret safety、TTY/non-TTY error boundary、custom extension 信息设计与 Phase 12 recovery/idempotency，没有剩余本阶段 task-affecting finding。

尚未执行：Phase 13 revision 的 commit/push、六平台远端 native/package CI、npm publish、Git tag 或 GitHub Release。按照本计划完成条件，当前唯一阶段完成 blocker 是要求的六平台远端 CI 证据。

## 完成条件

只有 P13-01–P13-08 全部实现、Acceptance 取得真实证据、相关设计/计划/使用文档按职责同步、final diff/review无剩余本阶段 finding，并且本阶段要求的六平台远端 CI 实际成功后，Phase 13 才能从 `ready/in_progress` 更新为 `done`。

当前本地实现与验收已闭环，但六平台远端 CI 尚未执行；因此 Phase 13 保持 **`in_progress`**，不得提前标记 `done`。代码仍未提交/推送，本阶段也未执行任何发布动作。
