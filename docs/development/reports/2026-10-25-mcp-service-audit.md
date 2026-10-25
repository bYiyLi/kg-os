# MCP 服务本体测试与修复报告（2026-10-25）

<!-- cspell:words keepalive mcpsandbox GOMAXPROCS qwen zod undici worktrees -->

## 结论与范围

本轮按“真实复现 → 最小修复 → 回归 → 独立复审 → 再验证”检查 MCP 服务本体。
已修复五类服务实现问题、三项高危依赖问题及两项开发测试入口问题；真实付费语义检索全流程通过。
所列服务场景、完整质量门禁分项和 Linux Docker 回归均已通过，
本轮覆盖范围内没有尚未修复的已知服务本体缺陷。具体失败、修复和验证边界如下。

测试时的源码基线为 `main@cdab276546db1e76702de1edbeed6f6747f32c7f` 加本轮修改；
后续独立提交及远程 CI 记录见下文。
测试期间主工作树另有并行 Web 业务与设计修改；这些修改原样保留，
不纳入本轮独立副本的整仓验收。Mac、Linux 所用的九个服务修改文件逐项 SHA-256 一致。
测试对象包含 MCP HTTP/JSON-RPC、Instance/OAuth 认证、五个 AI Tool、工作区 UI Resource、
QuickJS/wazero、31 个 SDK 方法及真实 Kernel/Lithograph v0.3.3。
本轮不改变工具清单、数据模型、公共 SDK 或既有写入非事务合同。
前一轮交付后的竞态稳定性续作单独记录于末节，不用较早的验收覆盖后续代码。

## 发现、修复和复验

| 编号 | 实际复现 | 修复与回归 |
| --- | --- | --- |
| F1 Origin 校验缺失 | 合法 Bearer 搭配不可信 Origin 的初始化返回 200；继续复审发现空 query/fragment 分隔符也能绕过同源判断 | 所有方法校验单个合法 Origin，保留原生无 Origin 客户端与已配置公网来源；非法来源返回 403。覆盖 GET/HEAD/OPTIONS/POST/DELETE、TLS 代理、空值/多值/null、空分隔符及浏览器 Fetch Metadata |
| F2 总超时未覆盖网络收发 | 声明 100 字节正文但不发送，20ms 限额后 200ms 仍占并发名额；拒绝请求也会卡在未读正文排空 | Handler 入口为网络读写绑定同一截止时间，覆盖认证、Origin、路径及并发拒绝。真实 TCP 验证慢正文、慢响应、拒绝正文，以及 HTTP/1 keepalive 和 HTTP/2 同连接复用 |
| F3 返回值检查有损且可被绕过 | 数组额外属性、对象隐藏字段被静默丢弃；继承的 toJSON 可替换结果；修改有限数检查可把 NaN 变成 null；修改数组迭代器可跳过字段检查 | 捕获可信检查函数，通过属性描述符快照生成 JSON 值，拒绝不能无损表示的值；不再次调用原始 getter/toJSON，不使用可被脚本替换的迭代器。普通 JSON、代理对象和非法值均有真实 QuickJS 回归 |
| F4 脚本可伪造公共数据库错误 | 自建 Error 携带 code/details 被当成 Kernel 错误；复审又发现可修改字符串截断函数伪造可信错误消息 | 私有 WeakMap 记录真实 Bridge 错误原始信息，捕获可信截断函数；脚本自己的异常固定 SCRIPT_ERROR，真实公共 code/message/details 保真且消息有界 |
| F5 Bearer scheme 大小写不兼容 | 同一正确凭证使用 bearer 或混合大小写 scheme 返回 401，而普通 API 可以使用 | MCP 与 OAuth Web 入口沿用现有 Fields/EqualFold 解析；Token 本身仍精确、常量时间比较。测试合法 scheme、空白、无效或超长 Header，以及 OAuth Token 的权限隔离 |
| F6 测试入口漏同步构建源码 | Dev 同步规则排除了整个 native 目录和 Cargo.lock，远端缺少正式 Dockerfile 所需的 Jieba 源码 | 允许真实 Jieba 源码与锁文件同步，继续排除构建输出；实际同步后确认所需文件存在，再使用正式 Dockerfile 构建临时测试镜像 |
| F7 浏览器测试入口早于真实就绪 | 四个 OAuth 用例最早的入口请求收到 302 到 /setup；trace 显示当时仍为 initializing，随后才 ready，授权参数因此未进入正常工作区 | 仅测试启动脚本在开放代理前等待真实 setup/status 的 ready；初始化错误、子进程退出和超时明确失败。保留产品逻辑和断言，完整浏览器用例复验 42/42 通过 |
| F8 高危依赖告警 | 生产 MCP Apps 的 Zod 及开发测试依赖 body-parser、undici 被现有安全门禁拒绝 | Zod 统一固定 4.6.6，body-parser 固定 2.4.0，undici 固定 8.12.2；更新锁文件和受影响客户端验证，未新增漏洞忽略项 |

依赖依据：[Zod 公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)、
[body-parser 公告](https://github.com/advisories/GHSA-27r3-jxmh-p828)、
[undici 公告](https://github.com/advisories/GHSA-xjj6-f33q-929c)。

F1、F2、F3、F4、F5 的新增回归均实际经历修复前失败、修复后通过。
独立复审补出的迭代器、字符串截断、空 Origin 分隔符及提前拒绝路径已并入对应问题，
没有把最初一轮绿灯当作最终结论。

相关实现和回归：

- [服务入口](../../../internal/mcpserver/server.go)、[Origin](../../../internal/mcpserver/origin.go)、[Origin 回归](../../../internal/mcpserver/origin_test.go)。
- [网络截止时间](../../../internal/mcpserver/request_deadline.go)、[真实网络回归](../../../internal/mcpserver/request_deadline_test.go)。
- [沙箱驱动](../../../internal/mcpsandbox/bootstrap.go)、[结果与错误回归](../../../internal/mcpsandbox/serialization_boundary_test.go)。
- [认证 Header 回归](../../../internal/mcpserver/auth_header_test.go)、[OAuth Web 认证](../../../internal/mcpserver/oauth_flow.go)。
- [现有 Dev 管理入口](../../../scripts/mcp-dev.mjs)。
- [浏览器测试启动](../../../scripts/serve-built-runtime.mjs)、[依赖固定](../../../package.json)及[锁文件](../../../pnpm-lock.yaml)。

## 验证矩阵

| 范围 | 环境与方法 | 实际结果 |
| --- | --- | --- |
| 协议、认证、Origin、网络期限 | 真实 HTTP/TCP、TLS、HTTP/2，定向 Go 测试及期限测试竞态检查 | 通过 |
| 沙箱、权限、输出与错误 | 真实 QuickJS/wazero，全部 mcpsandbox 测试及新增绕过回归 | 通过 |
| 整仓质量门禁 | 独立 Mac 验证副本，Node 24.15.0、Go 1.27.3；GOFLAGS=-p=1、GOMAXPROCS=4 执行完整检查并对后续修复分项补验 | 通过；Go 全量竞态、覆盖率 90.1%、客户端 292/292、浏览器 42/42、类型覆盖率 99.67%，以及静态、许可证和安全门禁完成 |
| Linux amd64 Docker | OpenClaw，正式 Dockerfile.unified、临时镜像、独立容器/Volume；完整 MCP/SDK/重启 Smoke 及新增协议/沙箱回归 | 通过，31/31 SDK、重启和清理成功 |
| 真实语义检索 | 修复后的 Mac Runtime，通过真实 MCP HTTP 与 SDK，独立临时 Workspace | 通过，详见下节 |
| 文档和差异 | 格式、本地链接、秘密扫描、git diff --check，包含新增文件 | 通过；报告的 13 个本地链接有效，新增文件空白检查通过 |

首次在主工作树执行的完整验证没有通过：并行 Dev 构建清理了其正在使用的原生库，
同时多个带竞态检测的 WASM 测试出现墙钟超时。没有将这些失败隐藏为成功。
随后使用基线相同、修改文件逐项 SHA-256 一致的独立工作树，串行执行 Go 包验证，
不改测试断言、服务超时或资源上限。
独立副本中的完整命令完成 Go 静态检查、全量竞态、Go 覆盖率 90.1%、
TypeScript 292/292、类型覆盖率 99.67% 等检查后，在浏览器阶段暴露 F7。
修复后完整浏览器 42/42 通过，后续安全门禁又暴露 F8；依赖修复后分别补验受影响的
构建、类型、客户端单测、浏览器、Docker、许可证和安全检查。
本报告按实际分项结果判定质量门禁，不把先前失败的 pnpm validate 记作 exit 0，
也不为测试脚本或 JavaScript 依赖变化重复未受影响的 Go 全量竞态测试。

OpenClaw 初始构建遇到 DNS 解析失败；仅为临时构建使用其现有 HTTP/HTTPS 代理，
不修改服务器 DNS、不关闭软件包签名验证、不改正式 Dockerfile。
构建镜像源、原生扩展固定版本及校验继续按仓库合同执行。
正常 Docker 网络与现有代理下的正式文件构建成功；临时 host 网络尝试遇到的
APT 签名拒绝没有被豁免。测试镜像实际 ID 为
`sha256:4019f16967b8fc16bf2ded3861a9412679b88e36df1cdc97215f0f6ce8d8be8f`，
平台为 `linux/amd64`。新增 Linux 回归同时验证恶意 Origin、多种认证 scheme、
非法返回值、公共错误防伪及字段完整性。
随后发现 Docker 数据分区已满，普通非 root Volume 无法创建测试目录；
本轮仅将自己新建的临时 Volume 绑定到有空间的专用测试目录，
通过 `KGOS_UNIFIED_DOCKER_SMOKE_VOLUME_ROOT` 指定，测试后清理自己的目录和 Volume，
不删除已有镜像、Volume 或业务数据。

## 真实 Embedding 与费用控制

本轮使用用户指定的 OpenAI-compatible 服务和 `qwen/qwen3-embedding-8b`。
密钥只经关闭回显的标准输入进入测试进程内存，由本地代理注入上游认证；
没有写入源码、运行时配置、数据库、报告或捕获的 Runtime 日志。

代理硬限制最多 10 次上游请求、累计最多 1,000 个输入字符。
实际统计为 **4 次 HTTP 200、56 个输入字符、上游 usage 合计 34 tokens**；
四次响应都提供了用量，返回向量维度为 4096。没有读取账单或估算货币金额。
付费测试之后的修改仅为测试启动入口与 JavaScript 依赖固定；服务核心文件保持一致，
客户端、浏览器与 Linux Docker 按更新后的依赖重新验证，没有为未改变的 Provider 重复付费调用。

| 场景 | 实际结果 |
| --- | --- |
| 创建真实 Ontology 和语义索引，写入两条合成知识 | 成功；建模与写入期间没有调用 Embedding |
| 中文实体/关系查询 | 命中预期知识图谱内容，结果包含有限分数 |
| 英文烹饪查询 | 命中预期面条内容 |
| 重复查询 | 结果一致，上游新增请求 0 |
| 停止并重启 Runtime | 原 State 和数据保留，语义结果一致，上游新增请求 0 |
| 受控 Provider 503 | 本地模拟的三次内部重试后返回 IO_ERROR；未把故障伪装成零命中，未发出付费故障请求 |
| 故障期间普通读取与恢复 | 普通读取正常，Branch State 不变，恢复后缓存检索正常 |
| 清理与凭证检查 | 临时进程及 Workspace 已清理，捕获的 Runtime 输出未包含用户密钥 |

## 交付状态与覆盖边界

本轮服务和测试修改共 17 个文件，已进行上述实际测试。测试阶段结束时尚未创建提交或推送，
当时没有新修复对应的 GitHub CI；后续授权交付的实际证据见下节。
本轮未执行 Tag、GHCR 发布，也未更新长期 Dev 或生产 Instance。
OpenClaw 长期 Dev 在测试前运行 2026-10-19 的 d62dc0c 镜像；本轮对临时实例写入，
不向长期知识库写入测试数据。
临时运行进程、容器、Volume、合成数据及本轮测试镜像已清理；独立验证工作树保留。
应用归档工具返回 `The task's primary checkout cannot be removed.`，
因此没有绕过该保护删除验证工作树。最终源码修改和本报告均保留在原主工作树
`/Users/yi/Code/KGOS`，验证副本位于 `/Users/yi/.codex/worktrees/mcp-service-audit/KGOS`。

真实 MCP 客户端库、服务本体和数据库链路属于本报告范围。
用户 ChatGPT 账户中的重新安装/授权、七 Skill 宿主自动选择、完整 Web 业务、
长期压力与生产流量不由本轮测试证明。最终结论仅覆盖实际检查的场景和修复后的代码，
不作所有输入永远无缺陷的保证。
最后追加的一轮独立子评审被平台内容检查中断，没有取得新的评审结论，未计为通过。
此前独立复审已实际返回具体问题，并已逐项修复及复验。
生产依赖扫描未报告已知漏洞；开发依赖仍报告 3 项低危、5 项中危，现有 high 门禁通过。
这些开发依赖没有进入已验收的 Node-free Linux 运行时，未把门禁通过表述为依赖零风险。

协议依据：[MCP Streamable HTTP Origin 要求](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#security-warning)、
[RFC 9110 认证 scheme](https://www.rfc-editor.org/rfc/rfc9110.html#section-11.1)。

## 独立提交与远程 CI

按后续交付授权，17 个文件已独立提交为
[`25c8401899e349b15a4d844b6c037937007bc904`](https://github.com/bYiyLi/kg-os/commit/25c8401899e349b15a4d844b6c037937007bc904)，
提交前的 `pnpm check:quick` 通过，并已推送至私有源码仓库 `main`。
提交在隔离工作树完成，再快进同步主工作树；并行 Web／Settings 修改未进入提交。
合并前后对当时排除的 77 个文件逐项比较 SHA-256，内容完全一致；
后续并行新增修改继续保留，不将并行工作的数量变化当作本轮改动。

| 环节 | 精确版本与实际结果 |
| --- | --- |
| 私有源码同步 | [Sync 40165172020](https://github.com/bYiyLi/kg-os/actions/runs/40165172020) 成功 |
| 公开 CI 源码绑定 | 生成提交 `f2eca202af4893e716ce08e22ccc2ac87b4b9674` 的 [source.json](https://github.com/bYiyLi/kg-releases/blob/f2eca202af4893e716ce08e22ccc2ac87b4b9674/source.json) 明确绑定上述私有源码 SHA |
| Linux Docker 集成 | [CI 40165194164](https://github.com/bYiyLi/kg-releases/actions/runs/40165194164) 的 Docker Linux amd64 integration 成功，包含正式镜像构建和 31/31 SDK 隔离验证 |
| 完整质量检查 | 同一 CI 的 Validate private source 成功，完整 pnpm validate 通过；该 Job 耗时 17 分 48 秒 |

本节所述远程验证针对上述实现提交；报告证据补录后的最终提交将另外跟进其自身 CI，
最终状态随交付回复给出。交付期间未增加付费 Embedding 请求。

## MCP 竞态稳定性续作

续作基线为 `main@f9139dc6d842b5cdc05ec18d9309d3e334d0132e`，范围仅为
固定 QuickJS 引擎初始化、源码输入边界、Doctor 失败诊断及对应回归和证据。
Web／Settings 代码、测试及设计文档的并行修改保留在主工作树，未进入隔离验证副本。

| 问题 | 修复与实际证据 |
| --- | --- |
| 每次实例重复编译固定 WASM，放大并发时延 | 使用 wazero 进程内 CompilationCache，保留一次成功编译的固定句柄；可取消的编译入口避免并发冷编译。每次仍按自身内存上限解码，并创建独立 Runtime、实例、内存和 JS context。相同低层回归在 `-race -count=3` 下，修复前为 4.68 / 4.70 / 5.13 秒，修复后为 5.83 / 0.13 / 0.13 秒；首次仍需冷编译。数值为实测观测，不作为测试时间阈值 |
| 源码未按引擎 API 要求写入末尾 NUL，解析依赖堆残留 | 新增脏堆分配回归在原代码上实际失败：合法 `21 * 2` 返回 `SyntaxError: expecting ';'`。修复额外分配并写入 NUL，传入长度仍为原 UTF-8 字节数。短源码、中文及重复分配回归在修复后连续 5 轮通过 |
| Doctor 失败输出不能直接区分通信、空结果和 MCP 错误 | 拆开三类失败诊断，保留原有真实探针、权限和 State 数据断言；空库、模型和非法状态三个场景各连续 5 轮竞态验证通过 |

编译复用及生命周期以 [wazero v1.12.0](https://pkg.go.dev/github.com/tetratelabs/wazero@v1.12.0#CompilationCache)
与当前锁定源码核对，输入边界以
[QuickJS-NG v0.15.1 C API](https://github.com/quickjs-ng/quickjs/blob/v0.15.1/quickjs.h#L941) 核对。
默认脚本 15 秒预算、内存上限、SCRIPT_ERROR 判定及 90% 覆盖率门槛保持。

定向 `-race -count=5` 已通过：非法返回值和宿主隔离、并发实例状态与不同内存上限、
越界增长拒绝、取消/关闭后的存活实例与后续恢复、取消编译等待，以及脏堆后的源码解析。
其中取消/恢复回归证明隔离与恢复，不单独宣称已观测到无限循环进入执行；
运行循环的超时/取消继续由现有服务回归覆盖。
独立源码复核检查缓存引用计数、Runtime 关闭、逐实例解码、失败恢复和输入长度，
没有确认任务范围内的阻断问题；验证结果仍以实际命令为准。

完整 `pnpm validate` 已在隔离工作树成功退出（exit 0），使用 Node 24.15.0、Go 1.27.3，
通过 `GOFLAGS=-p=1` 和 `GOMAXPROCS=4` 控制测试并发，未改变服务执行预算。
本次完整命令包含 Go 静态/全量测试、全量竞态、Go 覆盖率 90.1%、
客户端 292/292 及四项覆盖率均超过 90%、类型覆盖率 99.67%、
浏览器 42/42，以及依赖、许可证、安全与差异门禁。
生产依赖无已知漏洞；开发依赖仍为 3 项低危和 5 项中危，现有 high 门禁通过。
命令完成后仅补录本节和阶段证据，保存后的文档另行检查；本节的本地成功不代替新提交的远程 CI。
本次交付范围为 7 个 MCP 实现、回归及所属文档文件；提交和远程结果从该独立提交的关联检查追溯。
本次不新增付费 Embedding 调用，不更新长期 Dev 或生产 Instance。
