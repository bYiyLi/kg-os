# Phase 30 — Private KG OS Source & Generated Public Releases

## Design inputs

- [D108：私有 KG OS 真源与自动生成的公开 kg-releases](../../design/decisions.md#d108-private-source-public-releases)
- [Client：Docker-only 发布架构](../../design/client.md#私有源码与公开分发仓库)
- [公开发布模板与密钥配置真源](../../../distribution/MAINTAINING.md)

## 当前状态

`in_progress`。生成器与自动同步/公开 CI/Release 配置已写入 KG OS；两仓库的 GitHub 可见性、公开远端创建、两把 Deploy Key、真实 Actions 与 GHCR 尚未完成远端验收。旧私有 CI 和 Release 在切换验证完成前保留。

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
- [ ] GitHub 核实源仓库 Private、公开仓库存在且为 Public，权限及旧 Fork 风险核对。
- [ ] 两个独立 Deploy Key 实际配置并验证源→公开自动 Push、公开→源只读 Checkout。
- [ ] 对实际私有 `main` 提交验证公开 `Validate` 与 `Docker` 两 Job 均通过，且公开没有源码、敏感日志或构建 Artifact。
- [ ] 合法分发许可与公开 GHCR 权限确认后，获独立授权的真实 Tag 端到端通过版本、同源 revision、镜像平台/digest/匿名拉取及公开 GitHub Release。
- [ ] 旧私有 `ci.yml`/`release.yml` 停用；新仓库实际使用证据与相关指南同步，最终 diff、Review 和 Git 状态核对。

## Review / Constraints

- 只构建发布基础设施，不变动 KG OS Kernel/Web/MCP 的业务实现，也不改变 Lithograph。
- 禁止把完整代码推入公开 Git 历史或通过公开 Artifact、缓存、日志间接公开；公开日志不能假设天然保密。
- Tag、Commit、Push、GHCR、Dev/正式部署是独立权限和验收。任何未执行的远端操作不得写成已完成；只完成本地模板仍保持 `in_progress`。
