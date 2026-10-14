# ChatGPT MCP Apps / Entrypoint 调研（2026-10-14）

<!-- cspell:words mcpserver mcpsandbox -->

本文件只记录外部规范证据与当前仓库的可行性检查；**KG OS 产品合同以 [Web](../design/web.md#chatgpt-内嵌-webmcp-apps)、[MCP](../design/mcp.md#chatgpt-mcp-apps-ui-合同)、[D96](../design/decisions.md#d96-chatgpt-mcp-apps-web) 为准**。外部平台变动应重新核对，不把此文件当第二套设计。

## 已核对的官方来源

| 来源 | 可据此采用的能力 | 不得推断的结论 |
| --- | --- | --- |
| [OpenAI Plugin Extensions](https://developers.openai.com/plugins/build/extensions) | Sidebar `global`、会话侧边内容标签 `thread` 使用 MCP App Tool 的 `_meta["openai/ui"].entrypoints` 声明 | 所有 ChatGPT 网页版与账户均已开放 |
| [OpenAI MCP Extensions Spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) | 两种入口可声明在同一 Tool；打开时调用 `{}`；手动入口忽略一般 UI visibility；global fullscreen、thread 为会话内独立 UI 实例；Tool 标题/图标指导；预期平台矩阵 | 保证与聊天窗口固定左右分栏，或跨 global/thread 自动共享页面状态 |
| [OpenAI ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui) | 标准 `_meta.ui.resourceUri`、`text/html;profile=mcp-app`、MCP Apps Bridge `ui/*` / `tools/call`，UI 构建产物可作为 Resource 返回，减少非必要宿主专属实现 | 可以跳过已有 OAuth、由 iframe 直接获取用户 Token |
| [OpenAI MCP Server + UI Quickstart](https://developers.openai.com/plugins/build/app-quickstart) | Resource + Tool + `/mcp` 一体化示例；真实 ChatGPT 开发接入需要可访问的 HTTPS MCP endpoint | 必须另建 Node/Python MCP Server |
| [OpenAI Plugin UI Reference](https://developers.openai.com/plugins/reference) | `_meta.ui.visibility` 可选 `model/app`；`_meta.ui.csp` 的 `connectDomains/resourceDomains/frameDomains`；资源版本更新应变更 URI | 普通网页 iframe 不受 CSP/跨站会话限制 |
| [MCP Apps Authorization](https://apps.extensions.modelcontextprotocol.io/api/documents/authorization.html) | 私有资源和工具可以按现有服务整体强制 OAuth/Bearer，宿主负责连接认证后调用 | `resources/read` 或 iframe 内容自动拥有 HTTP API 权限 |

平台特别说明：OpenAI MCP Extensions Spec 的支持表将 Web 明确限定为 **ChatGPT Work 浏览器（不是 classic ChatGPT）**；OpenAI Extensions 文档说明部分网页端入口仍在分批推出。两者共同意味着：**协议可设计，真实 UI 可用性必须在目标账户/宿主验收，不能承诺所有普通 ChatGPT 网页用户都能看到两种入口**。首阶段不以不受控的平台发布节奏创造登录回退或另建网页 iframe。

## 当前仓库可行性证据

- `go.mod`：`github.com/modelcontextprotocol/go-sdk v1.8.0`；在 Yi Mac 对当前模块执行 `go doc` 确认 `mcp.Server.AddResource`、`mcp.Tool.Meta`、`mcp.ResourceContents.Meta` 与图标字段存在。可由当前 Go MCP Server 输出 Resource 和扩展元数据，**未进行 ChatGPT UI 真实运行验证**。
- `internal/mcpserver/server.go`：当前 `toolServer()` 注册四个业务 Tool，外层 `/mcp` 对每次请求校验已存在的 Instance / OAuth Bearer；Phase 18 只加 app-only UI Tool/Resource。
- `internal/mcpsandbox/bootstrap.go`、`internal/mcpserver/real_mcp_integration_test.go`：已有 `kgos_read` 可执行 `const v=await evolution.overview();return v` 的只读脚本，适合首次 Bridge 实数读取验证，无需新增 Backend API。
- `packages/web/src/app/app.tsx`：现有 `AppShell` 和 Web 强制认证/连接授权弹窗仍组合在一个根组件内，需要**最小抽取可共享展示 Shell**，MCP App 不可直接复用这个要求 Cookie/Token 的根入口。
- `internal/webui/webui.go`：现有普通 Web 构建后静态嵌入；MCP Resource 需要另一个自包含 UI HTML 构建物，仍编入同一个 Go/OCI 产物。
- `docs/development/phases/14-web.md`：业务页面与草稿存储仍 `deferred`；不能以 Phase 18 接通 UI 宿主证明查询、图谱、编辑、版本等业务完成。

## 需要实现时验证的外部条件

1. 目标 ChatGPT Desktop / Work 账号是否已开放 `global` 与 `thread`，Private Plugin 重新加载 metadata 后是否同时显示；实际 Tool 列表能否保留四个模型可见业务工具并隐藏 app-only UI Tool。
2. 当前 Go SDK 的 `resources/list`、`resources/read`、`tools/list`、`tools/call` 与 MCP Apps host 的真实序列化兼容；Resource 的 `_meta.ui.csp`、UI resource cache / MIME 与一份 HTML 中内联 JS/CSS 的实际加载表现。
3. ChatGPT Bridge 中 `kgos_read` 的已授权 `tools/call`、真实返回、失败与撤销路径；不能用单纯源码单测代替用户当前目标客户端的端到端证据。
4. Web / MCP App 双产物打包后的同进程交付、安全隔离、页面键盘焦点、两语言、深浅主题及 320px 小屏表现。

**验证结论**：技术合同和最小实现路径成立；截至本次文档编写，KG OS 仓库尚未实现 MCP Apps 双入口，也没有实际的 Sidebar / Thread UI 端到端成功证据。
