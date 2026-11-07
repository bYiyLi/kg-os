# Phase 34：MCP 对外健壮性与 OAuth 生命周期

## 2026-11-06 人工验收结项

**状态：`done`（用户明确表示手动验收通过，带保留项结项）。** 这是用户批准的阶段管理结项；以下原始 `in_progress`、失败、未执行记录反映当时实际情况，不代表所有原定验收已自动通过。本次只更新计划，未修改代码。

- **已交付**：MCP 统一结果与 OAuth 持久化、轮换和 24 小时 Token 合同已正式发行。
- **未实现或未完整交付**：未发现确定的当前核心实现缺项；跨重启丢失刷新响应或断网后消息送达本不在合同内。
- **未取得独立验收证据**：真实 Host 自然经过 24 小时续期、生产签名刷新及长期故障恢复矩阵无独立完整现场记录。

保留项不会因为 `done` 自动消失；后续工作另行定义范围与验收。

历史实施状态（2026-11-04）：`in_progress`

## 目标与设计输入

按 2026-11-04 用户批准的方案实施统一 MCP 结果、异常兜底与 OAuth 长期连接。设计归 [MCP](../../design/mcp.md#mcp-对外健壮性合同)、[Runtime](../../design/runtime.md)、[公共合同](../../design/contracts.md)和[可观测性](../../design/observability.md)。本阶段不修改 Lithograph，不增加账号、外部认证服务或连接管理 UI，不包含提交、推送、发布和生产部署。

## 实现与验收

| 范围 | 验收 |
| --- | --- |
| 统一结果 | 六个 Tool 成功、参数/业务/内部错误和 panic；code/data/message/retryable 合同、Schema、双份内容相等、4 MiB 总预算、同客户端错误后继续调用；内置 Web/脚本一次性迁移 |
| 执行恢复 | HTTP 超时完整失败 envelope，后续调用成功；慢正文、不读响应、keep-alive、HTTP/2 隔离；stream panic 安全收尾；中断写入不自动重放 |
| OAuth 持久化 | 同根凭证/issuer/resource 重启后授权可用，提前刷新、滚动 30 天、scope 保留、根凭证更换失效与撤销隔离 |
| 刷新容错 | 事务失败、并发、响应丢失、none 重放、签名/audience/assertion replay、JWKS/容量/数据库故障正确分类，缓存不能复活撤销授权 |
| 验证 | Mac 定向、race、完整质量门禁；OpenClaw 隔离 Docker MCP/SDK/重启；独立 Review 并修复；CI/真实 Host/部署分别取证 |

## 顺序与完成标准

先更新设计真源，再并行实现 MCP、OAuth、Sandbox 与消费者；完成集成测试、独立复审、必要修复和最终 diff。保留已有 Phase 30 修改，不改写旧 Phase 完成记录。所有验收和明确要求的远端门禁齐全才标记 done，缺项如实保留，不以局部通过关闭阶段。

首次升级无法恢复旧内存凭证，需要重新连接一次。内存幂等窗口不保证跨重启恢复已丢失的刷新响应；客户端主动断网后也不保证错误送达。

## 当前证据

- 2026-11-04：完成现状、Nexum 参考与设计选择核对，用户批准完整实施。六个 Tool 的统一 envelope、Schema、总预算、panic 收尾和消费者迁移已实现；OAuth 独立 SQLite 存储、事务轮换、签名客户端、短时幂等、撤销和故障分类已实现。HTTP API 与 TypeScript SDK 的业务合同保持现状。
- Mac 完整 `pnpm validate` 于 03:32–03:45 UTC 实际退出 0：Go 全量竞态与覆盖率检查通过（总覆盖率 90.1%），前端 86 个文件、849 个用例通过，浏览器 E2E 81/81，类型覆盖率 99.77%；格式、静态检查、许可、机密检查和安全门禁通过。依赖审计仍报告已有 3 low、8 moderate，未出现 high 级门禁失败。
- 复审及最终检查修复四个问题并补充回归：未知 JWKS kid 的重复拉取缺少冷却；数据库短时故障提前清除刷新重试标记；旧协议 SDK 隐藏客户端取消，导致工具继续占用名额；Overview/Ancestry 将底层上下文错误包装为公共错误后掩盖 TIMEOUT/CANCELLED。定向竞态检查覆盖两版 MCP 协议、HTTP/1 与 HTTP/2 的超时完整响应和客户端断开共八种组合，后续调用与名额释放均通过；最后的包装错误分类回归竞态通过（17.129 秒），正常业务错误和脚本 RESOURCE_ERROR 保留。
- 最后两处上下文分类修正后，使用 Go 1.27.3、CGO、原生 v0.3.4 fixture 与 `sqlite_fts5,lithograph_smoke`，完整 MCP 包 `go test -race` 通过（`-count=1`，63.504 秒）；最终 MCP `go vet`、`staticcheck`、gofmt 和 diff 空白检查通过。与前述完整 Validate 分开记录，未将整仓旧运行伪称在后续修正后重跑。
- OAuth 故障注入覆盖真实 SQLite 事务锁、失败后原刷新令牌可用、已提交刷新丢失响应后的短时恢复、过期 generation、缓存容量、签名与撤销。独立存储包竞态覆盖率 90.8%；Runtime 重启、关闭和损坏存储测试通过。原始 Token、assertion 和 panic 不进入诊断日志。
- OpenClaw 首次完整容器 Smoke 在 OAuth 端点遇到 503，尚未执行授权签发。同 Debian/UID/默认 umask 复现确认旧 fixture 的普通 mkdir 创建目录为 `0755`，不满足认证存储要求。修复 fixture 显式创建并断言 `0700`，保留生产权限拒绝逻辑；使用指南补充手工目录权限与重启恢复方法。
- 修复 fixture 后，OpenClaw Linux amd64 正式 Dockerfile 构建及完整隔离 Smoke 于 07:28:41 UTC 实际退出 0：非 root、无 Node、单进程 Web/API/MCP、五个 AI-facing Tool 与 workspace、真实 daemon 的 31/31 SDK、图数据跨重启持久化全部通过；OAuth 使用当前可信 CIMD 的 none/PKCE 签发，在容器重启后旧 Access 继续使用、旧 Refresh 成功轮换，并通过已消费旧 Refresh 撤销整个 family，重复撤销成功、已撤销 Access/Refresh 被拒绝、根 Bearer 独立可用。Smoke 自身清理与执行器主清理无错误；独立资源审计确认任务进程、挂载、桥接、路由、私有套接字与数据根无残留，长期 Dev 仍 healthy 且镜像未变，仅保留无凭证日志与验收记录。
- 该隔离构建源码快照为 1026 个文件，指纹 `bb8ddd829160d7595c4603388edf84227c0c59867649069103abac5f733541d4`，镜像 `sha256:8486bed1f6e6fe104cb8b44ef7f3329242034ad3853a3a64f4b3d242a38f71fe`。真实 CIMD 声明支持 none/private_key_jwt，JWKS URI 与现有可信规则匹配；没有跟随真实浏览器授权回调，也没有伪造 ChatGPT 私钥。签名客户端容错由本地受控密钥测试覆盖，不能据此宣称真实 Host 的签名刷新已验收。
- OpenClaw 原 Docker 存储已满且宿主直接 DNS 解析失败，本次使用独立的任务 Docker/containerd 数据目录与既有代理完成验证，没有清理原镜像或修改全局 DNS、网络配置。上述原有运维问题不在本次修复范围内。
- 现有长期 Dev 服务未升级。远程正式 CI、真实 Host 自然到期刷新、开发版本部署及生产验收尚未执行，本阶段继续保持 `in_progress`。未提交、未推送、未发布、未部署。

## 2026-11-04 Access Token 有效期调整

用户随后要求将 Access Token 硬有效期由最初的 1 小时改为 24 小时。新签发和刷新后的 Token 均报告 `expires_in=86340`，保留 1 分钟提前刷新余量；已签发 Token 沿用持久化的原到期时间。Refresh 滚动 30 天、JWKS 缓存及签名重试窗口保持原决定。设计真源、D124、使用指南和 Docker Smoke 预期同步更新。

本轮 OAuth、独立存储与 Runtime 相关竞态测试全部通过，三个包分别为 11.360、1.907、1.590 秒；三个包 `go vet`、gofmt、Node 语法、ESLint、Prettier 和拼写检查通过。新增真实 HTTP 回归验证首次签发和刷新都报告 86340，一小时后仍有效，24 小时前一纳秒有效、正边界返回 401 invalid_token；新增持久化重开回归确认旧一小时 Token 不被升级延长，新 Token 遵守 24 小时边界。

上文完整 Validate 和 Docker 镜像属于本次有效期调整前的快照。本轮按影响范围完成定向验证，未重跑完整门禁、Docker、远程 CI 或真实 Host 自然到期刷新；未提交、推送、发布或部署，阶段继续保持 `in_progress`。
