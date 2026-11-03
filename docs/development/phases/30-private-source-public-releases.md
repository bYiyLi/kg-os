# Phase 30 — Private KG OS Source & Generated Public Releases

<!-- cspell:words opencontainers -->

## Design inputs

- [D108：私有 KG OS 真源与自动生成的公开 kg-releases](../../design/decisions.md#d108-private-source-public-releases)
- [Client：Docker-only 发布架构](../../design/client.md#私有源码与公开分发仓库)
- [公开发布模板与密钥配置真源](../../guide/distribution-maintenance.md)

## 当前状态

`in_progress`（2026-11-03，D123 候选推广增量）。新实现需通过本地合同检查、实际公开 Linux 候选/交接及独立 Review，尚未发行新版。以下首发验收为历史基线。

历史基线 `done`（2026-10-22）。私有源码 → 自动生成的公开分发仓库 → 双 Job CI → 正式 Linux amd64 Docker/GHCR → Plugin ZIP/GitHub Release 的端到端分发链已通过实际验收。公开版本为 **v0.3.0**，固定私有源 SHA `cbae2b9db4022b96bc4847fcd352ac1e674e5be6`。官网由 Phase 31 独立验收，真实用户 Agent 的环境权限、登录和客户端连接仍须在各自安装环境进行检查，不视为本阶段自动化测试已覆盖。

## Scope

1. **仓库分离**：现有 `bYiyLi/kg-os` 变为 Private，创建公开 `bYiyLi/kg-releases`；保留本地和远端源代码历史、旧公开 Fork 事实、原工作树中无关未提交修改；Lithograph 不变。
2. **单一真源**：KG OS 的 `distribution/` 保存公开主页和 CI/CD 模板，`plugins/kgos/INSTALL.md` 是唯一安装指南真源；`scripts/render-kg-releases.mjs` 按受限白名单复制根安装指南、Plugin Manifest、无凭证配置样例、当前四个官方 Skill 与 Markdown 参考资源、许可证及私有确切 SHA/ref 的 `source.json`。公开仓库不能独立编辑，也不复制完整应用源码、仓库历史、Secret、私有日志或本地状态；历史通用 `kgos` 已按 [Phase 28](28-official-skill-roster.md) 从私有源码清理，不进入当前公开包。
3. **自动同步**：私有 `main` 与获授权 `v*` Tag Push 启动源仓库的最小 Sync 工作流；两个不同 Deploy Key 分别授予源→公开写权限与公开 CI→源只读权限。重复推送/Tag 重跑保持幂等，不强推公开 Tag。
4. **公开完整 CI/CD**：按 D123 对候选执行完整质量、分发及 Linux amd64 OCI 回载 Smoke，封存并下载核验同一候选；Tag 只核验和推广原产物。普通 Push 不推送 GHCR，只有许可门禁已满足时可上传不含源码的受控候选二进制。Plugin 当前四 Skill，与三份手册、校验和及 provenance 一起追溯。
5. **安全和合规**：明确公开日志、fork、历史 AGPL 与双授权边界；正式二进制发布由公共仓库 `KGOS_BINARY_DISTRIBUTION_APPROVED` 门禁控制，在授权未解决前不能声明可发布。按用户最新决定，私有 GitHub Actions 只允许同步，不保留并行 CI/Release；公开失败由公开 CI/CD 处理。

## Acceptance

- [x] 本地源代码生成器提供有界白名单、可信 ref/SHA 校验、确定性输出、危险目标目录与不受控文件拒绝；有独立测试。
- [x] 同步 workflow 与公开 CI/Release workflow 均由私有 KG OS 仓库保存，公开目录由同一套模板生成，不再独立编辑。
- [x] 私有安装文档唯一真源；根 `INSTALL.md` 自动生成，公开版不出现第二个安装指南；准确七个完整 Skill/Plugin Manifest/连接样例及许可证均通过导出测试，旧通用 Skill 与实际用户连接配置被排除。
- [x] 正式 Release 工作流已定义同版本 Plugin ZIP 与 Docker 绑定、公开 CI 专门检查 Plugin 导出；真实 GHCR、Plugin Release 已按下列发布证据验收。用户实际客户端安装依赖其环境和授权，单独验证。
- [x] 公开模板的 YAML/内嵌 Shell 完成基础语法检查，源仓库生成器与相关文档本地链接完成定向验证。
- [x] GitHub 核实源仓库 Private、公开仓库存在且为 Public、均具管理员权限；源仓库当前 Fork count 为 0，仍承认历史公开副本和许可不能撤销。
- [x] 两个独立 Deploy Key 实际配置并验证源→公开自动 Push、公开→源只读 Checkout。
- [x] 对实际私有 `main` 提交验证公开 `Validate` 与 `Docker` 两 Job 均通过，且公开没有源码、敏感日志或构建 Artifact。
- [x] 经仓库所有者明确确认二进制分发授权并设置门禁后，获授权的真实 Tag 端到端通过版本、同源 revision、镜像平台/digest/匿名拉取及公开 GitHub Release。
- [x] 旧私有 `ci.yml`/`release.yml` 停用，私有 Sync 不执行生成器测试或任何源码/容器质量门禁。
- [x] 公开 CI、正式 Release、版本与来源校验、GHCR 公开匿名访问、Plugin ZIP 完整性均有实际验证记录；已检查执行后 Git 状态与范围。

## 首次远端验证记录（2026-10-21）

- [私有提交 `deb97547`](https://github.com/bYiyLi/kg-os/commit/deb97547dc0d3a7f51954f951767e4122989f185) 仅包含本阶段 15 个文件；工作区其它未提交功能代码未混入。生成器测试 4/4、ESLint、格式、YAML/Shell 检查通过。本地整仓 Git Hook 因其它尚未提交的 Web E2E ESLint 问题失败，不把它视为本阶段质量通过。
- [私有首次同步 Run](https://github.com/bYiyLi/kg-os/actions/runs/39566453140) 通过了生成器和私有/公开双检出，但因生成公开工作流时所用 Deploy Key 的 OAuth 关联凭证缺 `workflow` 权限，Push 被拒绝；在公开内容已通过一次性 Mac SSH 初始化后，同一 Run 重试成功（无新 Push），不等于自动更新已验证。
- [公开初始化提交 `f0eb781`](https://github.com/bYiyLi/kg-releases/commit/f0eb781b426cf86b372a211611fb0e6cc5835188) 由 KG OS 生成器生成并使用 Mac SSH 首次推送；实际公开 Git 只有 7 个白名单文件（含固定私有 SHA 的 `source.json`），没有源码、历史镜像或上传的测试 Artifact。
- [公开 CI Run](https://github.com/bYiyLi/kg-releases/actions/runs/39566932778) 已触发并成功完成公开 Manifest 校验、私有仓库 SSH 检出和 main 祖先校验；完整 Validate/Docker 结果仍需按实际 Run 更新状态。后续须再次通过私有 `main` Push 验证不修改 Workflow 的自动同步路径，并解决未来 Workflow 模板更新所需的专用 GitHub 权限。
- [私有 Sync Run #39568102787](https://github.com/bYiyLi/kg-os/actions/runs/39568102787) 已通过 `02fa17892d9b84f8178525fe8a1db1aa04284bea` 实际 Push 成功更新公开 `main`，并自动触发 [公开 CI Run #39568151894](https://github.com/bYiyLi/kg-releases/actions/runs/39568151894)。公开仓库完整工作流确实触发，但两次公开 Validate 均失败、Docker 因 `needs: validate` 跳过；这不影响仓库同步已成功的事实。
- 用户进一步确认：**私有仓库不运行 CI / Docker / Release 或生成器单测，只负责向公开仓库同步。** 旧私有 `ci.yml` / `release.yml` 已在 GitHub Disabled，当前源码删除这两个工作流；正式所有质量门禁与发布归 `kg-releases`。既有历史 Run 继续保留为历史证据。

## 2026-10-22 发布前真实 CI 验收

- 私有 `main@e0544ac60140502df86a62c68b4ceffb15c26592` 完成 v0.3.0 版本号、Docker-only 运行时组合、Plugin、唯一安装文档、七个 Skill 和产品官网的提交与推送。真实源→公开 [Sync Run 39631960094](https://github.com/bYiyLi/kg-os/actions/runs/39631960094) 因新增 `.github/workflows/pages.yml` 触发旧同步凭证缺 `workflow` scope 问题；使用具备权限的 GitHub 连接对一致的生成工作流做一次性公开初始化，自动同步 attempt 2 **success**。需要在后续 workflow 内容变更前解决同步凭证的持久权限，不把一次性初始化称为权限问题永久修复。
- 对应公开 [CI Run 39632399914](https://github.com/bYiyLi/kg-releases/actions/runs/39632399914) 在绑定相同私有 SHA 的真实 GitHub Runner 上完成 `Validate private source=success` 和 `Docker Linux amd64 integration=success`；后者从该源码构建并隔离 Smoke，而不是仓库主机上运行的旧镜像。
- 公开根目录经 GitHub API 回读，仅有受限安装/Plugin/Skill/站点/工作流/许可资源及 `source.json`；本次 CI `artifacts.total_count=0`，未公开私有完整源码、测试产物或构建日志。官网另由 Phase 31 独立验收，不能替代镜像发布。
- `KGOS_BINARY_DISTRIBUTION_APPROVED` 当前不存在；未创建新 `v0.3.0` Tag、未触发正式 Release workflow、未推送 GHCR，也没有正式 Release。发布前必须取得版权/许可授权证明并由仓库所有者允许开启该门禁，再按原有 Tag 工作流完成 GHCR digest/platform/revision/匿名拉取及 Plugin ZIP 验证。

## 2026-10-22 首个正式 Docker Release

- **发行授权与版本**：仓库所有者在本次会话明确确认 KG OS v0.3.0 与打包依赖公开二进制分发授权，并要求发布首个可用 Docker 版本；据此设置公共仓库 Actions 变量 `KGOS_BINARY_DISTRIBUTION_APPROVED=true`，读回确认。此为所有者授权声明，不等于独立法律审计。私有代码仍保持 Private，不镜像到公开仓库。
- **不可变来源**：私有 `v0.3.0` annotated Tag 已推送，解引用为 `cbae2b9db4022b96bc4847fcd352ac1e674e5be6`；私有同步自动创建公共 `v0.3.0` Tag，公共 `source.json` 的 `ref=refs/tags/v0.3.0` 和 `revision` 与私有 Tag 一致。私有 Git 无强推、未移动 Tag。
- **正式 Run**：[Release #39636695605](https://github.com/bYiyLi/kg-releases/actions/runs/39636695605) 三个 Job 全部 **success**：`Full release validation / Validate private source`、`Full release validation / Docker Linux amd64 integration`、`Publish tested Linux amd64 image`。镜像发布前对将推送的同一镜像执行真实 Smoke；发布后工作流核对匿名拉取、平台、源码 revision 和 digest。
- **镜像与 Registry 独立复验**：`ghcr.io/byiyli/kgos:v0.3.0`，不可变镜像引用 `ghcr.io/byiyli/kgos@sha256:f5a3a9c7a343bd073584f82cb4abac25aab916455509f8d9474c188f919e654b`。在 GitHub Actions 之外，通过**匿名 GHCR Bearer Token** 获取 Manifest 与 config，证明 Registry 可公开读取，镜像配置为 `linux/amd64`，标签 `org.opencontainers.image.version=v0.3.0`、`org.opencontainers.image.revision=cbae2b9db4022b96bc4847fcd352ac1e674e5be6`，返回 digest 与正式 Release 一致。
- **公开发行物**：[GitHub Release v0.3.0](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.0) 已发布（非 draft/prerelease），资产 `kgos-plugin-v0.3.0.zip` 可公开下载。实际下载 ZIP 后**不解压执行**，检查根 `plugin.json`、唯一 `INSTALL.md`、精确七个官方 `skills/<name>/SKILL.md`，确认没有 `.app.json` 或额外嵌套 Plugin 根。Release 说明已根据首发情况完善为中英文，并保留完整镜像 digest、Tag 和私有来源 SHA。
- **状态与边界**：首个正式 Docker + Plugin 分发已完成；没有同时部署生产 KG OS Instance，也没有修改 OpenClaw 长期 Dev 的数据。安装方应由有权限的外部 Agent 阅读公开 INSTALL，验证 Docker Linux amd64 环境、具体 MCP 连接及用户授予的权限；公开 CI/Smoke 不代表任何第三方主机已安装成功。

## 2026-10-25 v0.3.1 补丁发行复核

- **来源与前置 CI**：私有 `main@d670b9009dc4b41b0b474a1bb572b3f62e0583ce` 提交并推送；[公开 CI #40173974145](https://github.com/bYiyLi/kg-releases/actions/runs/40173974145) 的源码 Validate 与 Linux amd64 Docker 集成均成功。本机另有 Go race、455 个 Web 单元测试、56 个浏览器 E2E 和分发专项 12/12 通过；本地整仓 `pnpm validate` 曾在覆盖率阶段触及单次执行超时，不冒充本地整仓验收完成。
- **不可变 Tag / 分发同步**：私有 annotated `v0.3.1` Tag 解引用为上述源码 SHA，已推送；[私有 Tag Sync #40174860416](https://github.com/bYiyLi/kg-os/actions/runs/40174860416) 成功同步公开同名 Tag。公开该 Tag 下的 `source.json` 为 `ref=refs/tags/v0.3.1`，`revision=d670b9009dc4b41b0b474a1bb572b3f62e0583ce`。
- **正式发行**：[公开 Release #40174882319](https://github.com/bYiyLi/kg-releases/actions/runs/40174882319) 的源码 Validate、Docker Linux amd64 集成、实际镜像发布三个 Job 均 success；发布前对精确镜像完成 Smoke，发布后核对匿名拉取、镜像平台、Tag、来源 SHA 和 digest。另在 GitHub Actions 之外以匿名 GHCR Token 读取 Manifest，独立确认 `v0.3.1` 的 digest 一致。正式镜像 `ghcr.io/byiyli/kgos:v0.3.1`，digest 为 `sha256:ea11a7d8ffcd352f237248d9221733d8c580a0cd5354abe7c5c153be9ebaa3b2`。
- **发行物复核**：[GitHub Release v0.3.1](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.1) 已公开发布（非草稿/预发布），含官方 Plugin ZIP、中文版、英文版、AI 安装指南及 SHA256 校验文件共五个资产。独立下载后验证三份指南校验通过、ZIP 内 `INSTALL.md` 与 AI 发行指南字节相同、Manifest 版本为 `0.3.1`、恰好七个官方 Skill 且无私有连接配置。
- **官网版本归档**：将上述已验证的三份 Release 指南保留为 `distribution/site/src/content/service-installation/v0.3.1/` 不可变快照，官网 catalog 的最新版本升为 `v0.3.1` 且保留 `v0.3.0`；编辑模板和公开 README 对齐到新版本。归档本地校验与公开 Pages 实际部署属于独立验收，不从 Release 结论推断网站已上线。
- **边界**：没有移动旧版 Tag、重写旧 Release 或修改 Lithograph，也未部署或升级任何运行中的 KG OS 用户实例。

## Review / Constraints

- 只构建发布基础设施，不变动 KG OS Kernel/Web/MCP 的业务实现，也不改变 Lithograph。
- 禁止把完整代码推入公开 Git 历史或通过公开 Artifact、缓存、日志间接公开；公开日志不能假设天然保密。
- Tag、Commit、Push、GHCR、Dev/正式部署是独立权限和验收。任何未执行的远端操作不得写成已完成；只完成本地模板仍保持 `in_progress`。

## 2026-11-02 v0.3.13 发布准备

在已审核合并的 `90f38737ab7cc6f1ff9a4d4f492c0bd88868b3ab` 上准备补丁发行，核对私公 Tag 均未占用。产品、SDK、CLI、Web、Go buildinfo、Plugin 与当前 AI 安装模板统一到 0.3.13，版本断言及 workspace lock 同步；四份 Skill 仍由导出器注入同包版本，不维护独立版本。现有分发许可变量只读核对为 `true`，不修改许可、密钥或权限。

教程兼容性 Review：相对 v0.3.12 的源差异不改变配置、初始化、认证或升级/恢复的运行时合同；新改动在 Skill 规范、原文导航和旧模型库退出。保留现有服务操作流程，在可编辑中英文模板说明原文导航的外部读取条件，并对齐英文四 Skill 名称。旧快照及 catalog 在真实发行物验真前保持不变；模板自身的版本/旧 digest 由既有发行渲染器按最终验证镜像替换，不冒充新镜像已存在。

本次正式发布获准运行现有完整 Validate 与 Linux amd64 Docker Smoke；不沿用此前规范 Review 的禁案例范围跳过发布门禁，仍不运行额外模型评测/API。提交推送、不可变 Tag、CI/GHCR/Release 及官网快照的实际结果在后续核验后记录，不以准备完成宣称发布成功；不部署服务或更新账户 Plugin。

发布前本地完整 Validate 首次在图谱拖拽 E2E 停止（80/81）：第二次拖动后未观察到目标位移。同项定向复查重现，等待位置稳定的试改未解决，已撤回；根因尚未确认，不将运行波动假设写成事实。此前安装、类型/lint、构建、Go 检查/race、Go 覆盖率 90.3%、漏洞检查及前端 811 项测试均通过，但完整 Validate 未通过，后续许可/依赖安全步骤尚未由该次运行执行。保留失败证据并用同一源码的正式 Linux CI 进一步核对，不修改图谱业务、放宽断言或跳过发布门禁。

后续隔离复现确认 `90f38737ab7cc6f1ff9a4d4f492c0bd88868b3ab` 在同一 Mac 也失败。事件取证两次均命中可拖动节点，但第二次没有拖拽开始事件；固定 G6 5.1.1 的 Canvas 配置要求在移动事件中同时超过 100ms 与 10px。补测浏览器原生事件时间后，原 6 步手势的末次移动为按下后 83.7ms、松手为 101.7ms；移动事件未越过时间门槛，不能用松手时刻替代识别条件。将该手势改为与第一次相同的 16 步后，隔离原断言连续 3/3 通过；不调整运行时、门槛、位移/邻居/固定/关系断言。该本地失败由无效测试输入造成，不据此宣称业务已修复。仓库原断言下完整 E2E 已通过 81/81；类型检查、ESLint、Prettier 和 diff 检查通过。初次完整 Validate 中止后的许可、安全和 diff 步骤已另外成功执行，安全门禁没有 high 级问题（仍报告 3 low、8 moderate）；不把分段结果冒称完整命令通过。准备提交 `c499c47818f42b2af7dd223899d7e211572436fb` 的公开 CI [41454994976](https://github.com/bYiyLi/kg-releases/actions/runs/41454994976) 为 Docker success、Validate failure；公开日志仅披露 Validate 失败，不能声称与本地同因已证实。修复提交仍须通过新的完整正式 CI，随后精确 Tag 的发布门禁另行验收。

## 2026-11-03 v0.3.13 固定源码诊断

- **来源与前置门禁**：修复提交 `306908a75e0b38e1edd601026f0aa287829bf0d6` 的 Mac 完整 `pnpm validate` 通过；[公开 main CI 41459029156](https://github.com/bYiyLi/kg-releases/actions/runs/41459029156) 的 Validate 和 Linux amd64 Docker 集成均成功。私有 annotated `v0.3.13` 对象为 `5db410f16d45ff16327118fb1497b501c7c52593`，解引用为该源码；公开 Tag 为 `627bfa5dc2f48683b6cdf10980888dd017f945a1`，其 `source.json` 同时固定该 revision 与 `refs/tags/v0.3.13`。没有移动 Tag。
- **保留失败事实**：[正式 Release 41461293545](https://github.com/bYiyLi/kg-releases/actions/runs/41461293545) 的三次 Validate 均在第 10/17 阶段 `test:coverage` 失败，摘要均为 84 个文件、811 个用例通过；三次 Docker 成功、Publish 跳过。第三次为 2026-11-03 02:39 UTC 根据下述已通过对照发起的一次完整正式重跑，Validate Job 为 `125692218654`。公开日志、Job 注解及该次完整日志归档均只保留受控错误与退出码 1；原 Runner 的具体异常和覆盖率明细没有持久化，不能把单测通过或私有对照成功当作旧失败原因已经解释。不继续盲目重跑正式发布。
- **一次私有诊断例外**：获准仅在专用临时分支运行 Ubuntu 私有 Actions，固定检查 `306908a75e0b38e1edd601026f0aa287829bf0d6`，复用正式 Node/pnpm/Go/Rust 工具链和完整 Validate 次序，不使用发布密钥。[私有完整诊断 41562921506](https://github.com/bYiyLi/kg-os/actions/runs/41562921506) 于 02:18:43 UTC 成功：Go 覆盖率 90.3%，前端 811/811，E2E 81/81，全部 Validate 门禁通过。前端分支覆盖为 3518/3905（90.08%）；77 个含未覆盖分支的文件与 Mac 明细完全一致。
- **有界差异复查**：[私有覆盖率对照 41566411448](https://github.com/bYiyLi/kg-os/actions/runs/41566411448) 在同一源码、Node v24.15.0、实际 2 CPU Runner 上完成四次检查：默认配置、3 个测试 worker / 4 路覆盖率处理，以及两次为子进程设置原发布 Tag、Workflow、仓库和提交上下文字段的同并发对照。四次均为 811/811、3518/3905；未改阈值、断言或测试集，也没有复现旧失败。该对照不是对公开 Runner 硬件和完整运行环境的复制，不证明原错误由并发导致。
- **I/O 与检出结构对照**：[私有执行对照 41569715567](https://github.com/bYiyLi/kg-os/actions/runs/41569715567) 只复查前端覆盖率，分别使用正式输出重定向，以及固定公开 Tag 检出目录下的固定私有源码。两次均使用 3 个测试 worker、4 路覆盖率处理和发布 Tag 子进程上下文，实际退出码均为 0，811/811、3518/3905。该结果排除了这两个单独对照中的稳定失败，不能代替原公开 Runner 的错误证据，也不证明完整准备过程的组合必然通过。
- **完整组合对照**：[私有完整执行对照 41571767321](https://github.com/bYiyLi/kg-os/actions/runs/41571767321) 固定相同公开 Tag 与私有 revision，逐项复用正式检出、工具链、安装和完整 Validate shell，保留原日志重定向；仅移除私库内无需使用的私有源码 Deploy Key，并显式设置 3 个 Vitest worker。Job 于 03:42:22 UTC 成功结束，耗时 20 分 18 秒：完整 Validate 通过，Go 90.3%、811/811、E2E 81/81，前端覆盖率 94.37% statements / 90.08% branches / 95.33% functions / 96.99% lines，分支仍为 3518/3905。实际私有 Runner 为 2 CPU，覆盖率处理仍采用该 Runner 默认值，因此不声称物理资源或全部 GitHub 上下文完全相同。该完整组合也未复现公开失败，不将新成功记录解释为旧错误已修复。
- **隔离与交付边界**：详细日志仅保留在私有 Actions 和本机受限临时文件。临时分支及其 workflow 未合入 main；在完整组合取证后再次清理远端与本地临时分支，四次诊断提交的恢复补丁保留。私有 main 仍只维护同步 workflow。没有修改源码、测试断言或质量阈值，没有移动 Tag；未取得 v0.3.13 镜像、Release 资产或官网归档的通过证据，稳定官网仍为 v0.3.12。旧失败根因仍为未知；继续处理需要取得真实公开 Runner 的受控失败信息，不能以重复私有成功或无依据的第四次正式重跑代替诊断。

## 2026-11-03 候选产物推广改造

- **授权与顺序**：用户要求停止旧版本反复诊断，先优化再发布新版本。旧诊断 Run 均已完成，无新增公开诊断或旧 Release 重跑；v0.3.13 私公 Tag 不移动。使用隔离 `feat/release-candidate-reuse` 工作树，原工作区未提交诊断证据保留。
- **本增量范围**：D123、Client、维护指南与候选 CI/Release 模板；源与公开导出工具、OCI/候选/恢复合同、允许清单安全错误及回归检查。不改应用业务、覆盖率/安全门槛、生产、Dev 数据、已安装 Plugin 或持久凭证。
- **验收合同**：证明完整 Validate 只在候选执行，镜像只构建一次，OCI 全内容及平台/标签、真实导出/回载 Smoke、保留摘要复制、Plugin/三手册字节一致、不可变 artifact 上传下载、来源/锁/工作流/工具/Run/attempt 核验；拒绝篡改、异平台/多 manifest、错误来源或失败候选。验证已完成发布只读复验、部分发布仅补缺失且不覆盖异内容，以及 artifact 过期/Registry 状态未知的阻塞路径。官网归档必须走受限差异专项，不跳过产品变化。
- **当前实现与证据**：候选、推广、摘要工具和模板已实现。Mac 正常 native/Web build、20 项分发/候选专项、Go/type/lint/811 单测的 `pnpm check:quick`、ESLint、actionlint 1.7.12 和拼写检查通过。新工作树初次 quick 因尚未生成嵌入 Web 而有两项 Setup 404；执行标准 build 后通过，未改业务或断言。提交钩子与最终 diff/格式检查按实际结果在 MR 汇报，真实 Run 仍待核。本地合成 OCI/HTTP/Run 用于确定性合同回归，不冒充 Docker/Registry 或跨 GitHub artifact 的实际运行。新工作流尚未激活，实际 Linux/Artifact/GHCR 门禁仍待验证；尚未创建新版本 Tag。
- **外部配置限制**：GitHub 管理接口此前报告 403，本轮不换接口/认证路径或修改协作者/Key。仅协作者交互限制的 Issue/评论范围及到期机制已核官方文档；真实设置仍未完成，不以工作流过滤外部 PR 冒充平台禁止创建 PR。

## 2026-11-03 v0.3.14 主分支发布准备

用户取消临时合成试验，改为合入 main 后以正常新版发行验证 D123。PR #3 已经正常合并为 `94d177f02c25f132157a27d98037a676aa2e915d`，未提交 GitHub APPROVE 评审或绕过门禁；没有创建临时试验分支、Run、镜像、Tag 或草稿 Release。原 `v0.3.13` 私公 Tag 保持不变。用户确认下一版为 `v0.3.14`，私公同名 Tag 均未占用；产品/SDK/CLI/Web/Go/Plugin 与当前 AI 模板按补丁版本统一，历史快照和官网 latest 仍为 v0.3.12。运行时接口、数据、初始化、认证和升级合同相对 v0.3.13 准备未改变；新增 provenance 资产及候选推广流程由本阶段核验，不要求用户升级已安装服务或 Plugin。

主分支 [Sync 41586367665](https://github.com/bYiyLi/kg-os/actions/runs/41586367665) 在公开仓库推送 `.github/workflows/ci.yml` 时被 GitHub 拒绝，原文为 OAuth App 缺少 workflow scope。公开 main 仍为 `627bfa5dc2f48683b6cdf10980888dd017f945a1`，manifest 仍指向旧源码 `306908a75e0b38e1edd601026f0aa287829bf0d6` 和 v0.3.13；新候选 CI 尚未触发。公库现有可写 Deploy Key 元数据已只读核实，未读取私钥、扩大权限或重配凭据；未断言 runner 具体认证来源已经定位，未用其他凭据或预先写入工作流绕过拒绝。版本准备先留本地，待正规同步写入权限/身份修复后再推进相应已授权动作。

按用户清理意图核对 PR #2 已合并、其 head `737827d182f4301e95e3994d9ce0f84b401354d4` 属 main 祖先、无打开 PR 或 worktree 依赖，并核对 GitHub 关闭 PR 的正常分支恢复机制后，删除旧远端 `feat/ontology-source-pack-review`。当前功能分支保留到验证完成；公库仅 main。没有永久删除镜像、资产、Release、Tag 或仓库。

## 2026-11-03 v0.3.15 草稿恢复修复与发布

用户批准保留 v0.3.14，修复后发布 v0.3.15。此前在明确例外授权下，Mac 仅初始化两份与私库逐字节一致的公开工作流（公开提交 `c3d45e1ae3196cb611227441b3de15149fd6e511`），没有推送私库历史、改凭据或旧 Tag；随后 [Sync 41593193024](https://github.com/bYiyLi/kg-os/actions/runs/41593193024) 成功，96 个公开文件与白名单生成结果一致。本次例外不代表同步身份永久获得 workflow scope。

[候选 CI 41593236941](https://github.com/bYiyLi/kg-releases/actions/runs/41593236941) 的完整 17 阶段 Validate、Docker/OCI 回载 Smoke 与不可变 artifact 上传下载通过；前端覆盖率 94.37% / 90.08% / 95.33% / 96.99%。Tag v0.3.14 固定源码 `a484038751f2c268d21ca9759e6632a1bd456eb7`。跨 Run 下载同一 artifact 的摘要核验成功，但 [Release 41596986439](https://github.com/bYiyLi/kg-releases/actions/runs/41596986439) 在草稿资产回读失败；一次受控续跑又失败。实际保留草稿 `432390817`（六份资产）、`432395044`（空）及镜像 `sha256:5f72142ea38ef65c977eeccd1d29530ef8595ecaf2359f0947d5192842d977a0`，未删除、发布草稿或改写 Tag。

根因是错误地用仅返回已发布 Release 的 by-tag API 发现/回读草稿，造成 404 误判及重复创建。修复为按权限分页发现所有同 Tag Release，发现重复立即拒绝；上传后按确定的 Release ID 回读并核验身份。真实草稿的 browser URL 使用 `untagged-…`，草稿资产改为校验并使用限定仓库的资产 ID API，正式资产仍核对同版公开 URL。回归覆盖草稿、已发布、缺失、跨页重复、权限拒绝及 ID/Tag 不匹配，原有来源、摘要、资产冲突和质量门禁保留。

Mac 曾额外下载完整候选用于重复复核；这不是发布合同必需，用户指出后已停止（退出 130），未恢复。完整 OCI 与跨 Run artifact 验真留在 GitHub；Mac 只读核对小型资产、provenance 和匿名 Registry 元数据，不运行 Docker。v0.3.15 的真实候选、推广与官网归档按后续实际结果记录，不用 v0.3.14 的成功候选代替新源码验收。
