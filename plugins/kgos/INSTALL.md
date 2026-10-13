# KG OS 私人 Plugin · AI 安装手册

<!-- cspell:words Streamable asdk -->

本文件面向**帮助用户安装 KG OS 私人 ChatGPT Plugin 的 AI**，是一次性安装 Runbook，不是日常知识库操作 Skill。目标是让用户通过自己已部署的 KG OS MCP 连接，安装并验证一个**私人** Plugin。官方 MCP 只交付 Linux amd64 Docker；不要替用户选择 Tunnel / 反向代理 / 自有 HTTPS、Workspace、认证供应商或安装到个人 / Workspace 的目标位置。

**状态**：`plugins/kgos/` 是可复用模板，**不是预先绑定用户 MCP 的成品**。Phase 16 新版只有一个 `kgosd` 进程承载 Web/API/MCP；已在隔离测试验证 Go MCP，但尚无新版真实 ChatGPT OAuth / 私人 Plugin 安装证据，也未正式发布新 Linux amd64 镜像。2026-10-12 用户的真实 ChatGPT OAuth / 四 Tool 测试属于旧 Phase 15，不等于新版验收。当前公开的 KG OS `v0.2.1` 也不包含新服务端镜像。

## 0. 权限与完成条件

- 只在用户明确授权的 Workspace、ChatGPT 账户和安装目标内操作。AI 能通过已授权的文件/命令工具或 Plugin Creator 完成的步骤可以代办；无法访问的 ChatGPT 页面、组织授权、Tunnel 控制台、认证交互与服务部署，给用户**当前一步**的明确操作，不假装已经完成。
- **不要索要用户将 Token、OAuth Secret、Runtime API Key、`.kgos/auth.json` 或私钥粘贴到聊天**。由用户在受信任的配置文件、密钥管理器、环境变量或 ChatGPT 正式认证流程中完成输入。不得把凭证写入 Plugin 包、示例、公开仓库、输出日志或 MCP URL。
- 初次安装**只执行读取测试**。`kgos_run` 可修改/删除知识，除非用户另外授权具体写入及目标 Branch，不得用真实知识写入当成安装探针。
- 完成标准分层：① MCP 服务实际运行；② **ChatGPT 自身**通过用户选定的远程地址/通道完成支持的认证、发现四个 Tool 并读取成功；③ 私人 Plugin 在目标账户/Workspace 已安装，**新的会话**能选择并调用。只有满足全部适用条件才能报告“Plugin 安装成功”；Skill 启用另行验证，不和安装完成混为一谈。

## 1. 识别现状：避免重复部署

只获取推进当前任务必要的信息，按下表从已经完成的位置继续：

| 用户已具备 | AI 下一步 |
| --- | --- |
| 已注册并安装私人 KG OS Plugin | 跳到[安装后验收](#5-安装后验收)，不要重复创建 |
| 已在 ChatGPT 注册 KG OS MCP Connection，但 Plugin 尚未安装 | 先核对该连接的认证及四个 Tool，再按[注册并安装](#3-在-chatgpt-注册并安装基础私人-plugin)中的安装步骤启用已有 Plugin；**不再重复注册**，私人包仅按需创建 |
| 已有可从 ChatGPT 使用的 HTTPS MCP 地址或 Tunnel | 跳到[认证与远端连通](#2-认证与远端连通) |
| 只有运行中的本机 MCP 或已有 KG OS Instance | 指向[通用 MCP 安装指南](../../docs/guide/mcp.md)，请用户确定自己的网络接入方式；不强制 Tunnel |
| 尚未部署 KG OS | 先按[KG OS MCP 部署合同](../../docs/design/mcp.md#部署交付与运行合同)与[通用 MCP 安装指南](../../docs/guide/mcp.md)进行 Linux amd64 Docker 部署；不要编造未发布的镜像名称、版本或不能运行的 CLI 参数 |

MCP 服务绑定一个明确的 Workspace Root，Docker 是包含 `kgosd` 的完整部署单元；新版只有**一个** Go `kgosd` 主进程，Web / API / MCP 共用 listener，无需宿主机额外启动 daemon。完整部署参数和初始化合同归属 MCP 指南与设计文件，**不要在本 Plugin 手册维护第二份服务器配置表**。统一 listener 可能同时暴露 Web/API/MCP，但各路由保持独立认证边界，不能因为同时开放就把内部 Instance Token 交给 ChatGPT。

AI 在继续前确认：用户所选 Instance 已初始化、MCP 服务实际监听、真实 URL（包含已配置的 HTTP path，通常 `/mcp`）或 Tunnel ID 已取得，且目标 ChatGPT 账户/Workspace 允许添加自定义 MCP Server。`localhost`、容器内部 IP、本地 `doctor ready` 都不是云端已连通的证据。

## 2. 认证与远端连通

**此阶段验证 OAuth 认证，不把本地协议模拟等同于真实 ChatGPT 联通。**

1. Go `kgosd` 的 MCP 要求独立的 `KGOS_MCP_TOKEN`（或 Token 文件）；它与 `.kgos/auth.json` 不同。为了连接 ChatGPT，用户在 `kgosd` 启动参数中额外提供 **`--mcp-oauth-issuer <public-HTTPS-origin>`**，或设置 `KGOS_MCP_OAUTH_ISSUER`。例如公共 MCP URL 是 `https://kgos.example.com/mcp`，issuer 就是 `https://kgos.example.com`（不是完整 `/mcp` URL）；必须与用户实际 HTTPS 入口一致。未配置 OAuth 时仅支持独立的静态 Bearer。
2. 核对用户的公网 HTTPS 入口确实能转发原路径、POST 与 Authorization header；分别检查 `/.well-known/oauth-protected-resource`、`/.well-known/oauth-authorization-server`、`/oauth/authorize` 与 `/oauth/token` 的行为，以及 MCP 未授权 401 中的 resource metadata challenge。OAuth 采用 ChatGPT CIMD + PKCE S256 + `none` public-client 模式，不要求用户创建 Client Secret，也不需要额外 OAuth 服务。
3. 在 ChatGPT 连接配置中选择 **OAuth**。真正发生登录时，向用户展示 KG OS 的可信 HTTPS 管理员页面，在页面内输入 MCP 管理员 Token（**不是在对话、Plugin Manifest 或 ChatGPT API Key 栏位粘贴**），授权后 ChatGPT 保存短效 OAuth Token。现有普通 MCP 客户端仍可使用固定 Bearer。
4. 网络与 TLS / Tunnel / 反向代理由用户自行决定和配置；MCP OAuth 只解决身份认证，不自动使本地端口可公网访问。此前本地自动化 OAuth 验证不是 ChatGPT Web/Desktop 真实联通证据。无法完成真实 OAuth 授权时记录 `BLOCKED_AUTH_COMPATIBILITY` 或具体网络/代理错误，禁止通过“无认证”绕过安全边界。
5. MCP 工具应当**恰好**为 `kgos_preview`、`state_ancestry`、`kgos_read`、`kgos_run`。如果工具缺失、显示其他 Instance、认证失败、证书失败、协议不兼容或连接来源不可信，先停止注册并修复对应层，不能用伪造示例替代结果。

## 3. 在 ChatGPT 注册并安装基础私人 Plugin

完成上一节的**实际 ChatGPT 认证兼容性检查**后：

1. 进入 [ChatGPT Plugins](https://chatgpt.com)，选择 `+` → **Add custom MCP server**。如客户端文字、权限与官方说明不同，以当前正式 UI 为准；Workspace 策略不允许时让用户联系管理员，不绕过。
2. 填写便于用户识别的连接名称（如 `KG OS`）。选择 **Server URL** 并提供真实完整的 HTTPS MCP URL，或选择 **Tunnel** 并使用已经授权且可用的真实 `tunnel_id`；不选择或创建用户未授权的远程接入方式。
3. 选择客户端**实际支持且与服务器一致**的认证，按正式交互完成登录 / 授权；必须在发现工具之前解决任何认证不兼容。阅读风险提示，交由用户确认 **I understand and want to continue**，再选择 **Create as a plugin**。
4. 检查 ChatGPT 返回的真实连接及 Tool 元数据；确认四个工具的名称、读写标记与预期 Instance，检查 `kgos_run` 是写入工具。若工具列表未刷新，使用连接管理页的 **Refresh**，并开启新会话重新验证。
5. 在所属的**个人或 Workspace Plugins** 页面找到刚创建的 Plugin，实际执行 **Install / Enable**。安装完成后才能在新对话输入 `@` 并选择该 Plugin；**Create as a plugin 本身不代表已经在会话启用**。

这条流程已能创建一个**MCP-only 基础私人 Plugin**，不需要先打包官方 Skill、重复注册 MCP，也不需要发布到公共目录。用户仅需要知识库工具时，直接进入验收即可。

## 4. 按需绑定私人 Plugin 包

只有用户希望将本仓库的 Plugin 模板与**已有官方 Skill** 一起安装为**自己的私人产物**，才执行本节；不因为 MCP-only Plugin 已成功就自动再建一个重复的 Plugin。

1. 从 ChatGPT 当前已注册的 MCP 页面复制**实际技术连接 ID**。官方例子以 `plugin_asdk_app...` 开头，通常位于该连接的浏览器 URL 中；不要将普通 Plugin ID、Workspace Root、Tunnel ID 或 KG OS Commit Ref 冒充 MCP 连接 ID。
2. 将 `plugins/kgos/` 复制到用户控制的**私人工作目录**。根目录的 `plugin.json` 是可移植 Manifest；`extensions.com.openai.apps` 指向 `./.app.json`，但本仓库只有 `.app.json.example`，**模板不带真实连接，不能直接视为可安装成品**。
3. 在私人副本中把 `.app.json.example` 复制成 `.app.json`，将 `REPLACE_WITH_YOUR_REGISTERED_MCP_APP_ID` 替换为刚才取得的真实 ID。检查 JSON 格式、名称映射、插件权限及实际客户端的兼容性；**只写入连接引用，不写 URL、Bearer、OAuth Secret 或个人文件系统路径**。不得将私人 `.app.json` 提交回公开仓库。
4. 如已连接 Plugin Creator，可在得到用户明确安装授权后，让它使用经检查的**私人 Plugin 归档**创建/更新；也可使用 ChatGPT Work 中的 `@plugin-creator` 创建私人本地插件/目录入口。工具不可用时指导用户按[当前插件打包规范](https://developers.openai.com/plugins/build/plugins)完成私人导入，不伪称存在自动创建权限，不把私人包提交公开 Marketplace。
5. **随私人包一起保留 `skills/kgos/SKILL.md`**。当前可移植 Agent Plugins 格式从根目录 `skills/` 自动发现 Skill，根 `plugin.json` 不要求重复声明 `skills`；使用兼容版 `.codex-plugin/plugin.json` 时按对应格式写入 `"skills": "./skills/"`。安装时核对私人包确实包含 Skill，安装后在新会话用实际知识图任务测试 Skill 能否被发现和选择；**目录存在、Manifest 有效或 MCP-only Plugin 能用均不能推断 Skill 已激活**。不将服务器 Token 或用户的动态 Connection ID 写进 Skill。

生成的私人包与 `plugin_asdk_app...` 引用只绑定用户当前真实连接。若重新注册 Server 而 ID 改变，先在私人副本中更新引用，再验证；不要在正式提交中维护一份所有用户共享的动态连接 ID。

## 5. 安装后验收

在安装目标的 ChatGPT **新会话**中 `@` 选择私人 KG OS Plugin，并记录实际结果：

| 检查 | 必须看到 |
| --- | --- |
| 安装 | Plugin 显示在当前用户/Workspace，已启用且会话可选择 |
| 认证 | 从当前会话经真实远程地址或 Tunnel 完成认证，无重复/循环授权 |
| 工具 | 四个 Tool 均可发现，读写权限标注与实际一致 |
| Preview | `kgos_preview` 返回真实 Branch / Head / Ontology（非示例文字） |
| SDK | `kgos_read` 使用 `return await evolution.overview();` 能取得当前 Instance 的真实数据 |
| 写能力 | `kgos_run` 被识别为可能写入；**只有用户明确授权具体测试写入时**才运行并核对 State，否则标记“未执行写入测试” |
| Skill（可选） | 仅在确实打包并安装 Skill 后检验激活，不能由目录存在推断成功 |

不能从 Preview 内容独立证明宿主 Workspace 路径；应把返回的数据库/Branch 实际特征与用户预期比对。任何写入都由真实数据库合同决定；脚本错误不表示此前写入全部回滚。MCP 本地 Inspector 通过、静态 Manifest 解析成功、Plugin 出现在目录里，均不能替代这次**ChatGPT 实际调用**。

## 6. 故障处理与报告

| 表现 | AI 处理 |
| --- | --- |
| MCP 尚未发布/不可启动 | 使用当前源码构建 Linux amd64 Docker 镜像或真实可用的 OCI 产物验证；不能编造已经发布的 Docker Image |
| 本机可读，ChatGPT 不可访问 | 分别检查 HTTPS / Tunnel、实际 path、证书、网络和目标 Workspace 权限 |
| ChatGPT OAuth 连接失败 | 检查 `--mcp-oauth-issuer` 是否与实际 HTTPS origin 一致，metadata 是否可达、是否选择 OAuth、代理是否透传 OAuth 路径与 Header；失败不得切换无认证 |
| 连接已创建但没有四 Tool | 检查 MCP `tools/list`、服务端返回与 ChatGPT 连接 **Refresh** |
| 有连接 ID 但私有包失败 | 核对 ID 来自实际连接、`.app.json` 真实生成、Manifest 指向正确文件和当前 schema |
| Plugin 安装但调用错误 Instance | 停止写入，回到 MCP Workspace 绑定及认证核对；不要自动更换目标 Root |
| 只读成功、写入不确定 | 先读 Branch/State/History 核实，不重放有副作用的命令 |

向用户报告时按以下**状态**，只写真实完成项：

```text
KG OS Instance       已确认 / 待部署 / 未知
MCP runtime          已运行 / 未运行 / 未验收
Remote route         HTTPS / Tunnel / 未提供
ChatGPT auth         已验证 / BLOCKED_AUTH_COMPATIBILITY / 待验证
ChatGPT connection   已注册（真实 ID）/ 未注册
Private Plugin       已安装并启用 / 仅模板 / 未完成
4 Tools              已发现 / 不完整 / 未验证
Read smoke           已成功 / 失败 / 未运行
Write smoke          已授权并成功 / 未授权未运行 / 结果待核实
下一步                最小必要操作或准确阻塞原因
```

不得在报告里输出 Token / Secret；不能因遇到账户授权或网络阻塞而将状态标记为“完成”。需要继续时只询问用户**当前缺少的一项必要信息或操作**。

## 规范来源

- [KG OS MCP 设计与部署合同](../../docs/design/mcp.md)
- [KG OS MCP 安装与本地使用指南](../../docs/guide/mcp.md)
- [OpenAI：Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI：Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [OpenAI：Authentication](https://developers.openai.com/plugins/build/auth)
- [OpenAI：Package your plugin](https://developers.openai.com/plugins/build/plugins)
