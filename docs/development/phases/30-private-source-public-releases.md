# Phase 30 — Private KG OS Source & Generated Public Releases

## Design inputs

- [D108：私有 KG OS 真源与自动生成的公开 kg-releases](../../design/decisions.md#d108-private-source-public-releases)
- [Client：Docker-only 发布架构](../../design/client.md#私有源码与公开分发仓库)
- [公开发布模板与密钥配置真源](../../../distribution/MAINTAINING.md)

## 当前状态

`in_progress`。生成器、自动同步与公开 CI/Release 模板已写入唯一 KG OS 真源，两个仓库的可见性和两把 Deploy Key 已实际验证。公开 CI 已开始运行，源→公开自动更新与正式 GHCR 发布尚待独立验收；旧私有 CI/Release 暂时保留。

## Scope

1. **仓库分离**：现有 `bYiyLi/kg-os` 变为 Private，创建公开 `bYiyLi/kg-releases`；保留本地和远端源代码历史、旧公开 Fork 事实、原工作树中无关未提交修改；Lithograph 不变。
2. **单一真源**：KG OS 的 `distribution/` 保存公开仓库模板，`scripts/render-kg-releases.mjs` 只复制白名单文件并创建包含私有确切 SHA/ref 的 `source.json`。公开仓库只能由 KG OS 工作流维护，不复制源码、仓库历史、Secret、私有日志或覆盖无关本地修改。
3. **自动同步**：私有 `main` 与获授权 `v*` Tag Push 启动源仓库的最小 Sync 工作流；两个不同 Deploy Key 分别授予源→公开写权限与公开 CI→源只读权限。重复推送/Tag 重跑保持幂等，不强推公开 Tag。
4. **公开完整 CI/CD**：公开 `main` Push 自动执行原两项 Linux amd64 门禁；公开 Tag 触发 Release，先通过相同完整 CI，再对精确 Tag 源码构建/Smoke、推送 GHCR、验证可匿名拉取和 digest，最后发布 GitHub Release；普通 Push 不发布镜像。
5. **安全和合规**：明确公开日志、fork、历史 AGPL 与双授权边界；正式二进制发布由公共仓库 `KGOS_BINARY_DISTRIBUTION_APPROVED` 门禁控制，在授权未解决前不能声明可发布。旧私有 CI/Release 保留至公开全流程验证后再退役。

## Acceptance

- [x] 本地源代码生成器提供有界白名单、可信 ref/SHA 校验、确定性输出、危险目标目录与不受控文件拒绝；有独立测试。
- [x] 同步 workflow 与公开 CI/Release workflow 均由私有 KG OS 仓库保存，公开目录由同一套模板生成，不再独立编辑。
- [x] 公开模板的 YAML/内嵌 Shell 完成基础语法检查，源仓库生成器与相关文档本地链接完成定向验证。
- [x] GitHub 核实源仓库 Private、公开仓库存在且为 Public、均具管理员权限；源仓库当前 Fork count 为 0，仍承认历史公开副本和许可不能撤销。
- [ ] 两个独立 Deploy Key 实际配置并验证源→公开自动 Push、公开→源只读 Checkout。
- [ ] 对实际私有 `main` 提交验证公开 `Validate` 与 `Docker` 两 Job 均通过，且公开没有源码、敏感日志或构建 Artifact。
- [ ] 合法分发许可与公开 GHCR 权限确认后，获独立授权的真实 Tag 端到端通过版本、同源 revision、镜像平台/digest/匿名拉取及公开 GitHub Release。
- [ ] 旧私有 `ci.yml`/`release.yml` 停用；新仓库实际使用证据与相关指南同步，最终 diff、Review 和 Git 状态核对。

## 首次远端验证记录（2026-10-21）

- [私有提交 `deb97547`](https://github.com/bYiyLi/kg-os/commit/deb97547dc0d3a7f51954f951767e4122989f185) 仅包含本阶段 15 个文件；工作区其它未提交功能代码未混入。生成器测试 4/4、ESLint、格式、YAML/Shell 检查通过。本地整仓 Git Hook 因其它尚未提交的 Web E2E ESLint 问题失败，不把它视为本阶段质量通过。
- [私有首次同步 Run](https://github.com/bYiyLi/kg-os/actions/runs/39566453140) 通过了生成器和私有/公开双检出，但因生成公开工作流时所用 Deploy Key 的 OAuth 关联凭证缺 `workflow` 权限，Push 被拒绝；在公开内容已通过一次性 Mac SSH 初始化后，同一 Run 重试成功（无新 Push），不等于自动更新已验证。
- [公开初始化提交 `f0eb781`](https://github.com/bYiyLi/kg-releases/commit/f0eb781b426cf86b372a211611fb0e6cc5835188) 由 KG OS 生成器生成并使用 Mac SSH 首次推送；实际公开 Git 只有 7 个白名单文件（含固定私有 SHA 的 `source.json`），没有源码、历史镜像或上传的测试 Artifact。
- [公开 CI Run](https://github.com/bYiyLi/kg-releases/actions/runs/39566932778) 已触发并成功完成公开 Manifest 校验、私有仓库 SSH 检出和 main 祖先校验；完整 Validate/Docker 结果仍需按实际 Run 更新状态。后续须再次通过私有 `main` Push 验证不修改 Workflow 的自动同步路径，并解决未来 Workflow 模板更新所需的专用 GitHub 权限。

## Review / Constraints

- 只构建发布基础设施，不变动 KG OS Kernel/Web/MCP 的业务实现，也不改变 Lithograph。
- 禁止把完整代码推入公开 Git 历史或通过公开 Artifact、缓存、日志间接公开；公开日志不能假设天然保密。
- Tag、Commit、Push、GHCR、Dev/正式部署是独立权限和验收。任何未执行的远端操作不得写成已完成；只完成本地模板仍保持 `in_progress`。
