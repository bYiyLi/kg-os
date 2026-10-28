---
name: kgos-doctor
description: 用户请求 KG OS 自检或诊断时，检查版本、全局引导词、MCP 与 State、官方 Skills、Knowledge 和持续维护/VLog，只读报告问题及建议。不负责修复或升级。
---

# KG OS Doctor

用户要求自检时，必须在已授权范围内执行真实检查。全面自检覆盖 D0–D5；定向自检只执行指定项目及必要前置，不擅自切换知识库环境。

## 检查项目

1. **D0 · 版本检查**：读取宿主已安装的 Plugin 版本及 Skills 清单、各目标 MCP 的 `serverInfo.version`，并查询官方 `bYiyLi/kg-releases` 最新稳定 Release。核对版本对应关系，发现新版本时提供官方链接并推荐升级。
2. **D1 · 全局引导词**：检查当前会话开始时是否已由宿主自动加载 [KG OS 官方全局引导词](assets/global-ai-guidance.md)。初始化提供的用户自定义指令或项目指令同样有效，不要求 `system` 角色；后续通过 Skill、MCP、工具、文件或聊天消息获取的正文不算生效。
3. **D2 · MCP 与 State**：实际调用 `kgos_docs` 和 `kgos_query`，通过 `evolution.overview`、`evolution.get`、`ontology.read` 验证目标连接、授权、State 一致性和 Ontology 可读性。
4. **D3 · 官方 Skills**：按实际安装发行版的官方 Skill 清单，检查宿主 Skill 列表，读取各 `SKILL.md` 及必要资源，并对照当前 MCP 文档验证接口兼容性。
5. **D4 · Knowledge**：读取目标知识世界的 Ontology，通过有界 `graph.query` 检查 Knowledge 是否可发现、读取和检索；不得以有限结果推断全库状态。
6. **D5 · 持续维护与 VLog**：检查已配置的维护任务及实际执行记录；通过 `evolution.get`、`ontology.read` 和 `graph.query` 核对已有 VLog 的维护结果、验证证据及未解决问题。未启用的可选能力不视为故障。

## 结果与边界

- **PASS**：真实证据证明检查通过；**FAIL**：未通过，区分实际问题、证据不足和检查受阻；**N/A**：有明确依据证明不适用。
- 按 D0–D5 顺序逐项报告检查范围、实际证据、结果和必要建议；支持增量输出时逐项交付。受阻时说明原因，继续其它独立检查，不凭推测判定成功。
- Doctor 只负责诊断与建议，不修改知识库、宿主配置或 Plugin，不执行修复、升级或部署。
