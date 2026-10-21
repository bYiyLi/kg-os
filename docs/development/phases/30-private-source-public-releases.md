# Phase 30 — Private KG OS Source & Generated Public Releases

## Design inputs

- [D108：私有 KG OS 真源与自动生成的公开 kg-releases](../../design/decisions.md#d108-private-source-public-releases)
- [Client：Docker-only 发布架构](../../design/client.md#私有源码与公开分发仓库)
- [公开发布模板与密钥配置真源](../../guide/distribution-maintenance.md)

## 当前状态

`in_progress`。源→公开自动同步和公开 `Validate` + `Docker Linux amd64` 两项 CI 均已完成真实成功验收。两把 Deploy Key 可用；`kg-os` 的 Actions 只负责同步，所有产品质量门禁归公开仓库。**正式 v0.3.0 GHCR 镜像、Plugin 归档和 GitHub Release 仍未发布**：公共仓库没有 `KGOS_BINARY_DISTRIBUTION_APPROVED` 变量，法律分发授权及发布后的镜像可匿名拉取性尚未验证，因此阶段继续保持 `in_progress`。

## Scope

1. **仓库分离**：现有 `bYiyLi/kg-os` 变为 Private，创建公开 `bYiyLi/kg-releases`；保留本地和远端源代码历史、旧公开 Fork 事实、原工作树中无关未提交修改；Lithograph 不变。
2. **单一真源**：KG OS 的 `distribution/` 保存公开主页和 CI/CD 模板，`plugins/kgos/INSTALL.md` 是唯一安装指南真源；`scripts/render-kg-releases.mjs` 按受限白名单复制根安装指南、Plugin Manifest、无凭证配置样例、七个 Skill 与 Markdown 参考资源、许可证及私有确切 SHA/ref 的 `source.json`。公开仓库不能独立编辑，也不复制完整应用源码、仓库历史、Secret、私有日志或本地状态；历史通用 `kgos` 已按 [Phase 28](28-official-skill-roster.md) 从私有源码清理，不作为第八项公开。
3. **自动同步**：私有 `main` 与获授权 `v*` Tag Push 启动源仓库的最小 Sync 工作流；两个不同 Deploy Key 分别授予源→公开写权限与公开 CI→源只读权限。重复推送/Tag 重跑保持幂等，不强推公开 Tag。
4. **公开完整 CI/CD**：公开 `main` Push 自动执行源代码质量、单安装指南/Plugin/Skill 完整性验证与 Linux amd64 Docker 隔离 Smoke；公开 Tag 触发 Release，先通过同一完整 CI，再对精确 Tag 源码构建/Smoke、推送 GHCR、验证匿名拉取和 digest，最后随 GitHub Release 提供版本一致的 Plugin ZIP（包含唯一安装指南与全部七 Skill）。普通 Push 不发布镜像/正式 Plugin Release。
5. **安全和合规**：明确公开日志、fork、历史 AGPL 与双授权边界；正式二进制发布由公共仓库 `KGOS_BINARY_DISTRIBUTION_APPROVED` 门禁控制，在授权未解决前不能声明可发布。按用户最新决定，私有 GitHub Actions 只允许同步，不保留并行 CI/Release；公开失败由公开 CI/CD 处理。

## Acceptance

- [x] 本地源代码生成器提供有界白名单、可信 ref/SHA 校验、确定性输出、危险目标目录与不受控文件拒绝；有独立测试。
- [x] 同步 workflow 与公开 CI/Release workflow 均由私有 KG OS 仓库保存，公开目录由同一套模板生成，不再独立编辑。
- [x] 私有安装文档唯一真源；根 `INSTALL.md` 自动生成，公开版不出现第二个安装指南；准确七个完整 Skill/Plugin Manifest/连接样例及许可证均通过导出测试，旧通用 Skill 与实际用户连接配置被排除。
- [x] 正式 Release 工作流已定义同版本 Plugin ZIP 与 Docker 绑定、公开 CI 专门检查 Plugin 导出；真实 GHCR/Plugin Release 和客户端安装仍按下列未完成项验证。
- [x] 公开模板的 YAML/内嵌 Shell 完成基础语法检查，源仓库生成器与相关文档本地链接完成定向验证。
- [x] GitHub 核实源仓库 Private、公开仓库存在且为 Public、均具管理员权限；源仓库当前 Fork count 为 0，仍承认历史公开副本和许可不能撤销。
- [x] 两个独立 Deploy Key 实际配置并验证源→公开自动 Push、公开→源只读 Checkout。
- [x] 对实际私有 `main` 提交验证公开 `Validate` 与 `Docker` 两 Job 均通过，且公开没有源码、敏感日志或构建 Artifact。
- [ ] 合法分发许可与公开 GHCR 权限确认后，获独立授权的真实 Tag 端到端通过版本、同源 revision、镜像平台/digest/匿名拉取及公开 GitHub Release。
- [x] 旧私有 `ci.yml`/`release.yml` 停用，私有 Sync 不执行生成器测试或任何源码/容器质量门禁。
- [ ] 公开 CI 已完成成功验收；进一步验证正式 Release、合法发行授权和公开 GHCR 权限，闭合最终验收。

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

## Review / Constraints

- 只构建发布基础设施，不变动 KG OS Kernel/Web/MCP 的业务实现，也不改变 Lithograph。
- 禁止把完整代码推入公开 Git 历史或通过公开 Artifact、缓存、日志间接公开；公开日志不能假设天然保密。
- Tag、Commit、Push、GHCR、Dev/正式部署是独立权限和验收。任何未执行的远端操作不得写成已完成；只完成本地模板仍保持 `in_progress`。
