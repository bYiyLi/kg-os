# KG OS 项目协作规范

<!-- cspell:words Buildx -->

## 当前来源与权限

- 涉及本地事实时，直接检查当前工作区 `/Users/yi/Code/KGOS`；后续回合重新核对当前文件、Git 与命令结果。项目简介和历史聊天不能代替当前仓库事实。
- 首次进入项目读 [README](README.md) 和 [设计入口](docs/design.md)，再按任务定位 owner；继续主题时核对该文件与当前版本，未变化的已读内容可复用。实现还须核对[开发计划](docs/development/README.md)的相关阶段与完成条件，不全量加载历史。来源不可读则说明未知，不用旧结论补齐。
- `README.md` 负责产品定义；`docs/design.md` 负责设计导航与职责索引；`docs/design/*.md` 按 `docs/design.md` 的 ownership 表分别维护技术与数据设计唯一真源；`docs/development/README.md` 负责开发路线、状态和共同完成条件，`docs/development/phases/*.md` 负责单阶段范围、Feature、Acceptance、Review 与证据；`docs/guide/*.md` 负责可执行操作步骤，不维护阶段状态；本文件负责协作规则。背景、研究与 Noven 只作参考，不自动成为 KG OS 决定。
- 讨论、评审默认只读。记录设计、改文件、实现、提交、推送均须有适用于本次动作的明确授权；一次请求可授权多项。延续同一已授权任务不因换回合重新批准，历史授权不自动扩展到新任务；核对授权不等于再次索取。
- 已授权工作持续到所需修改、验证和汇报，Skill 结束不等于任务结束。现有设计、标准及证据能裁决的工程取舍直接推进；只有无法裁决且改变产品合同的新设计才提交具体分歧与建议供用户确认，确认后先记入真源再实现依赖部分。明确要求事前审阅或即时批准时仍须遵守；只暂停依赖该批准的动作。

## 设计评审与下一步建议

提出设计缺口或下一步之前，先把该主题与设计真源及用户最新明确决定对照。在回复中指出支撑结论的章节或文件位置，而不是只声称“已经看过”。

| 核对结果 | 应采取的动作 |
| --- | --- |
| 已有决定，当前没有冲突 | 沿用并解释，不重新要求用户设计 |
| 只是缺代码、物理编码或索引 | 作为工程待办给出最小实现方案；本次已授权实现时继续执行，涉及须批准的新设计决定时除外 |
| 所属章节已明确 logical state / ownership / identity / lifecycle，只剩 transport、serialization、wire encoding 或 compiler mapping | 视为合同编码或工程待办；沿用已确认设计，不把“具体字段名 / 字符串编码 / envelope 尚未冻结”误判为“Object 模型尚未设计”，也不重新询问已确认的逻辑字段、身份或生命周期 |
| 有具体输入会产生两种不同结果 | 说明分歧、受影响规则和推荐方案，不把整个主题退回未设计 |
| 用户新决定与旧文档冲突 | 标出具体差异；获准写入时同步受影响规则，不静默改写无关决定 |
| 只有外部产品有某能力 | 不据此认定 KG OS 缺失，先说明它解决的当前需求 |

判断工程缺口时，把 [Implementation](docs/design/implementation.md) 与对应 owner 一起读。logical state、ownership、identity/lifecycle 已确定的 transport、serialization、wire、pagination、error/adapter/compiler mapping 属于工程合同，不据缺少字段编码反推产品模型未设计。授权覆盖设计写入时按已有语义与底层公开合同选最小方案并验证；涉及产品语义、能力边界、数据归属、身份/生命周期或兼容承诺且现有依据无法裁决的分歧，按上面的新设计确认规则处理。

评审图模型时，必须同时检查 Lithograph Schema 中的图结构、KG OS 上层语义和实际 Knowledge graph data，不能只检查 JSON/YAML 字段表。区分 Schema identifying name、数据库 element identity、业务唯一键与关系结构/约束；当前边界以 `docs/design/ontology.md` 的“使用模型”“公共可编辑格式”与持久化章节，以及 `docs/design/graph.md` 的“Knowledge 数据访问”为准。分别检查公共 aggregate 与底层存储：不得把“不持久化第二份 Schema”误读成“公共格式不能表达 type/required/unique/from/to”，也不得由底层 standalone ownership 推导必须提供独立 CRUD。

用户纠正后，先修正被指出的那一项，再检查它影响的既有规则。助手自行补出的示例、公式、ID 选择和默认行为仍是提案，不能因紧接在用户纠正后就写成已确认设计。反过来，有明确依据的用户决定也不能再次变成提问。

用户要求评价时，先给所检查范围内的结论，不为继续对话强行制造新设计点。没有完整证据时，不使用“只剩一个问题”“全部闭合”“可以直接冻结”等覆盖整个系统的判断。

## 评审反例

| 错误推断 | 正确检查 |
| --- | --- |
| 公共 `from/to` 字段等于重复持久化一份关系 Schema | 检查逻辑字段到真实图结构的 compiler/decoder；表示、持久化与执行责任分别判断 |
| 存在一条业务边，所以所有同名边自动受该类型限制 | 检查上层指定的定义与执行合同，不能由一个实例推导规则 |
| 底层资源拆成多个 owner，所以 AI 必须逐个操作它们 | 先检查 Ontology mutation aggregate；资源拆分、引用维护和去重由 KG OS compiler 处理 |
| Schema 身份、边标签、端点身份和业务唯一键是一回事 | 先说明正在定位哪种对象、比较哪些数据，禁止未经确认相互替换 |
| `unique` 与 `cardinality` 可以互相替代 | 分别检查业务键重复和关系数量，不因调整一项而隐式修改另一项 |
| 用户指出理解错误，就顺带确认一套新的实现公式 | 只记录用户明确决定；其余标明解释或待核对边界 |

这些检查防止重复误读，不禁止发现有证据的新问题。

## 开发、CI 与 Release 分工

- **MCP OAuth 出站规则**：按 [MCP OAuth 设计](docs/design/mcp.md#host-neutral-mcp-oauth)与 [D128](docs/design/decisions.md#d128-oauth-metadata-no-ssrf-ip-filter) 实现 CIMD/JWKS 读取，不增加 SSRF 目的地址黑名单或 DNS/IP 网段过滤；代理 Fake-IP、保留地址与私网解析结果不因 IP 类型直接拒绝。继续保留 HTTPS/TLS 证书校验、禁止重定向、客户端声明与回调精确校验、请求超时和大小限制。不能把此决定扩展为取消 OAuth 身份验证或其他接口认证。

- **Mac 工作树是源码真源，不是 Docker 测试机**：日常编码、Go/TypeScript/native 定向测试、`pnpm validate` 与 Review 在 Mac 进行；**不在 Mac 运行 Docker、Compose 或 Buildx**，也不要求 Mac 配置 Docker Engine/Context。Mac 缺少 Docker 不是开发阻塞项。
- **OpenClaw 负责开发阶段 Docker 实测**：通过 `ssh openclaw` 访问现有 Linux amd64 主机，在 `/data/apps/KgosDev` 用现有受控入口执行镜像构建、隔离容器/临时 Volume 的完整 MCP/SDK/重启测试。长期 Dev Instance 不接受破坏性写入。Mac 可以远程触发 OpenClaw 的测试，但 Docker 命令实际在 OpenClaw 执行。
- **私有源码、公开 CI/CD**：`kg-os` 与 `distribution/` 是唯一真源，公开 `kg-releases` 没有独立编辑源。私有 Actions 仅 `sync-kg-releases.yml`，同步精确 SHA/Ref，不运行质量门禁或发布；公开 Ubuntu Validate 与 Docker 两 Job 验证同一 revision。正式 Tag 经完整 CI、镜像 Smoke、平台/revision/digest 与匿名拉取核验后发布；普通 main 不推 GHCR，不恢复旧 native/npm matrix。发布许可门禁 `KGOS_BINARY_DISTRIBUTION_APPROVED=true` 仍须满足；具体流程见 [D108](docs/design/decisions.md#d108-private-source-public-releases) 和[分发维护](docs/guide/distribution-maintenance.md)，配置存在不等于 CI 通过。
- **状态与权限分离**：OpenClaw Dev 部署、Git Commit、Push、Tag、GHCR 发布和生产部署是不同动作，各需相应授权；Phase 按自身要求的本地质量、OpenClaw Dev、**远程 Docker CI**、真实 ChatGPT 和 Review 判断，不能以在 Mac 上没有 Docker 为由跳过 Docker CI，也不能把旧 Phase 15 镜像证据充当 Phase 16。见 [D94](docs/design/decisions.md#d94-openclaw-docker-development-and-ci)、[Dev Runbook](docs/guide/dev-environment.md)。

## 写入与验证

- KG OS 的开发 Docker 测试只位于 OpenClaw，按 [远程开发环境](docs/guide/dev-environment.md) 执行：Mac 仓库是源码真源，`/data/apps/KgosDev` 是独立部署。优先使用仓库现有远程管理入口，不手工覆盖数据库、配置、Token 或备份；`rsync --delete` 只能针对专用 `src/KGOS` 源码镜像。部署后的 `check` 必须只读，镜像回退不等于数据库回滚。**GitHub Actions CI 是另一个独立的远程 Docker 构建/测试环境**，两边实际验证记录与 Commit/Push/Release 分别报告、分别授权。
- 获准整理设计时，保留已确认规则及其适用范围，区分新增决定、表达澄清与待核对解释。新格式必须与文字和图示一起核对，不能让示例成为唯一的规则来源。
- 先更新规则所属真源，再同步受影响的入口与引用。本项目协作规则只在本文件维护；其他项目文档只引用本文件，不重复维护这些规则。
- 检查现状 → 判断最小范围 → 修改 → 验证 → 检查 diff → 汇报。不得覆盖用户已有改动或为整理文档顺带引入代码、依赖、存储层和新公共接口。
- 文档变更后重新读取修改结果，检查 Git diff、新增文件、Markdown 本地链接、JSON 示例与前后语义；运行 `git diff --check`，新增未跟踪文件另行检查。只把实际成功的检查报告为通过。检查针对本次修改和必要依赖；通过后不无故扩大或重复检查。
- 汇报区分已确认、已修改、已验证、已提交与已推送；文字检查不证明引擎已经实现，也不保证模型今后不会误读。
