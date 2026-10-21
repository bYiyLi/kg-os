# Phase 29 — Web shadcn/ui Migration

状态：`in_progress`（组件迁移与任务范围 Review 已完成，本地 Web 验收通过；整仓收尾被已有开发依赖安全审计阻断）

## Goal / Design Inputs

在当前工作树完成 Web 通用组件迁移，不重做业务界面。产品合同唯一来源为 [Web 通用组件体系](../../design/web.md#通用-ui-组件体系)、[首次初始化](../../design/web.md#web-first-run-setup)、[MCP Apps](../../design/web.md#chatgpt-内嵌-webmcp-apps)、[认证](../../design/web.md#连接认证与恢复)及 [Runtime Setup](../../design/runtime.md#web-first-run-bootstrap)。

依赖已存在的 Web 外壳、认证、真实版本浏览和 Phase 26 初始化工作树；不依赖 Phase 25/27/28 完成。保留所有原有未提交修改。此次不包含 Commit、Push、Dev 部署、发布和远端 CI；这些动作需要独立授权，不以旧阶段证据替代当前验证。

## Actual inventory / Scope

| 控件 | 现有使用位置 | 迁移目标 |
| --- | --- | --- |
| Button | Setup、认证/授权、语言/主题、版本操作、Canvas 工具和内嵌刷新 | shadcn Base UI Button；保留业务布局和禁用状态 |
| Input | 向量参数、Token、版本搜索 | shadcn Base UI Input；保留原生 datalist 自由模型输入 |
| Select | 向量 similarity | shadcn Base UI Select，键盘操作与本地化选项 |
| Dialog | 强制认证、MCP 授权、移动版本抽屉 | shadcn Base UI Dialog，原有关闭策略不变 |
| Popover / Checkbox | 分支筛选浮层及分支选择 | 删除手写外部点击/Escape 监听，复用 Base UI |
| Tooltip | 操作按钮提示 | shadcn Base UI Tooltip，保留 aria-label |
| Toast | 向量服务验证 | 官方 Base UI Toast；删除旧依赖、引用及旧测试 mock |
| Icon | 现有 Icon 名称与各业务图标 | 复用调用接口，改为 Lucide；保留品牌和业务绘图 |
| Textarea | 当前无使用点 | 不安装 |
| 业务组件 | SidebarHandle、Sidebar、Version Browser、Canvas、四步向导 | 保留职责/布局/API，仅替换内部通用控件 |

## Features / Order

| ID | Feature | Status | Acceptance |
| --- | --- | --- | --- |
| P29-01 | 样式/配置/依赖/Token/双入口 Provider | `done` | 原项目可类型检查和双入口构建；无第二套主题和 UI 框架 |
| P29-02 | 实际控件与弹层迁移 | `done` | 清单迁移完毕，认证策略/焦点/键盘/真实版本导航不回归 |
| P29-03 | 验证通知迁移 | `done` | Loading/Success/Error、自动消失/关闭、取消/过期结果、即时翻译及主题通过测试 |
| P29-04 | 回归、视觉与最终 Review | `in_progress` | 本地验收与任务范围 Diff Review 已通过；整仓安全门禁仍有已有阻断，未验证边界见 Evidence |

## Validation / Completion

- 类型检查、ESLint、Prettier、Web Vitest、普通 Web 与自包含 MCP Apps 构建通过。
- 受影响 Playwright 覆盖四步初始化、验证通知、登录/Session 恢复/MCP 授权、中英文、深浅色、真实版本导航、移动抽屉、键盘与焦点。
- 真实 Chromium 检查桌面 100% 缩放与 320/375px 窄屏；弹层继承当前主题，界面不横向溢出，Footer 不因通知跳动。
- 内嵌包无外部 CSS/JS 资源依赖；Sidebar App / Conversation Panel 的共同资源与 Bridge 行为保持，模拟 Host 与真实 ChatGPT 客户端证据分开记录。
- 按仓库规范运行相关质量/安全/许可/依赖/构建测试；记录原有独立失败，不改写无关范围掩盖问题。
- 检查替换后旧控件/样式/依赖残留、无用导出与重复实现；基于任务开始快照核对未涉及文件保持不变；无已知任务相关缺陷。

## Evidence / Review

2026-10-21 迁移前基线：`main` @ `d62dc0cd226e40f7ff7b82e57364e3d69aa4d9ea`，已有 Phase 25–28 及 Setup 未提交改动。Web check（TypeScript、ESLint、Prettier、16 文件 / 154 个 Vitest）通过；Browser 与 MCP 双入口构建通过。MCP 原始包已有大于 500 kB 的 Vite 提示（615.64 kB），不是本次引入。

### 已实现与已通过的本地验收

- 8 类通用控件均使用官方 shadcn/ui Base UI 来源，MIT 许可随源码保留；按实际调用安装，无独立 UI package。原图标接口改为静态 Lucide 引入；原几何拖拽 Handle 和业务绘图保留。旧通知依赖在源码、Web manifest 与 lockfile 中均已移除。
- 两个入口共用 UI Provider、样式入口与 document 主题同步；认证、MCP 授权、移动抽屉的原有关闭策略保留。未修改 API、SDK、后端数据模型、安全边界或四步初始化顺序。
- `pnpm typecheck`、`pnpm lint`、冻结安装和依赖一致性、类型覆盖率（99.65%）、重复代码（0）、无用依赖/导出、许可、`git diff --check` 均通过。
- Vitest：33 个文件 / 256 项全部通过，其中 Web 16 文件 / 154 项；覆盖率 Statements 94.87%、Branches 90.52%、Functions 97.02%、Lines 96.78%，既有门槛未降低。
- 最终串行校验中的 Go 全量 race、覆盖率门禁（总 Statements 90.1%）与漏洞检查均通过；NPM / Go / Rust 许可门禁通过。生产依赖审计没有已知漏洞。
- `pnpm test:e2e` 重新构建 SDK、CLI、Browser Web、MCP 自包含资源和真实 daemon 后，39/39 通过。覆盖真实初始化路径、验证请求/失败/取消/旧结果失效、Token/Session/MCP 授权、语言、主题、版本导航和移动操作；新增 5 项 UI/MCP 资源测试。
- 真实 Chromium 的 100% 缩放下，1440/375/320px × dark/light 六组均无横向溢出；桌面欢迎页主要布局框、页脚和按钮尺寸与任务前构建保持一致。视觉检查涵盖欢迎页、向量表单、Toast 和移动抽屉；额外在 Yi Mac 的 Chrome 中检查中文初始化页面。
- 375px / 1100px 的 MCP 协议 Host fixture 加载实际打包的 `mcp-app.html`，验证初始化/工具查询、分支 Popover/Checkbox、Host 深浅色变更、Escape/焦点恢复，且未发起外部 JS/CSS 请求。此项是共同资源及 Bridge 回归，不冒充真实 ChatGPT 客户端验收。

### Review findings 与修复

| 问题 | 修复与回归证据 |
| --- | --- |
| 生产 CSS 压缩后移动抽屉仍受居中位移影响 | 通过组件 class 合并显式覆盖位移；生产包 E2E 断言 x/y 为 0 并操作底部主题控件 |
| 旧表单 `display:block` 使 Select 箭头换行 | 限定实际 Select 为 flex；320px 键盘选择、Escape 和焦点恢复测试通过 |
| Tooltip Trigger 的 disabled 不会自动成为渲染 Button 的 disabled | 传递至实际 Button；版本导航不可用/加载中测试通过 |
| 通知内容可能停留在旧语言，且首轮迁移用了错误标题键 | 存储语义错误并在 React 内容中订阅翻译；测试 Loading 中切换语言不重发请求、Success 自动消失与 Error 手动关闭 |
| Portal 不再继承业务容器的主题类 | 同步本 document 的根主题，不触碰外层 Host；Browser 授权弹窗与内嵌 Popover 深浅色回归通过 |
| 测试曾依赖旧原生 Dialog、旧图标路径或通知 mock | 改测真实 Provider/Portal 的交互与可访问状态；保留专业拖拽 Handle 的 SVG 几何断言 |

Base UI 的高优先级错误通知在独立 live region 宣读，用户可按 F6 聚焦通知并操作关闭按钮；E2E 按真实可访问路径验证，不通过移除上游 ARIA 行为让测试变绿。

### 后续样式收敛复查（2026-10-21）

- 按实际 JSX 使用点复核 `layout.css`、`authentication.css`、`setup-wizard.css`：删除旧版 Setup 的扩展选择、单位输入、验证控件、完成页和原生 Select 失效样式；移除 `setup-wizard.tsx` 中始终隐藏的装饰节点；精简已由 shadcn/ui 提供的按钮布局与输入框重复声明。保留表单原有 `outline` 抑制，避免双重焦点描边；保留业务尺寸、渐变、拖拽和 Token。
- 当前工作树执行 `pnpm --filter @kgos/web check`，Web 16 文件 / 154 项 Vitest 通过；再次执行 `pnpm test:e2e`，正式 Browser / MCP 双构建及 39/39 Playwright 通过。真实 Chromium 对比清理前后的 1440px、375px 欢迎页与向量表单，控件几何、边框和间距一致，未出现横向溢出或 JS 异常；剩余的验证按钮布局类型由 `grid` 改为 Base UI 自带 `flex`。CSS 选择器重新扫描没有发现其他确定失效的业务类。
- 此次仅涉及上述三个 CSS、一个 Setup TSX 与本阶段验收记录；未修改公共 API、依赖或其它既有未提交工作。先前整仓开发依赖安全审计阻断未在本轮处理，Phase 仍为 `in_progress`。

### 认证 Token 输入框焦点修复（2026-10-21）

- 用户在实际本地 Web 验收时发现 Token 输入框聚焦后出现双重光圈。真实 Chromium 确认内层 shadcn Input 的 `focus-visible:ring-3` 与外层 `.authentication-token-field:focus-within` 同时产生 3px `box-shadow`。
- 仅在认证 Token 组合控件内禁用 Input 自身的 `box-shadow`，保留外层焦点边框与光圈，不改变通用 Input、Token 认证、密码可见性切换或业务页面。通过当前本地 Web 的独立浏览器实测：内层 `box-shadow: none`，外层焦点光圈保留，无页面 JS 错误。
- `tests/e2e/web-shell.spec.ts` 补充输入框聚焦与外层容器光圈回归断言；修复后 `pnpm --filter @kgos/web check` 通过（16 文件 / 154 项 Vitest），`pnpm test:e2e` 重新构建并通过 39/39 项 Playwright。整仓已有开发依赖安全审计阻断不属于本次修复，阶段状态保持不变。

### 官方 Token Input Group 样式验收（2026-10-21）

- 按用户要求提供可直接比较的官方样式：新增按实际使用范围适配的 shadcn/ui Base UI Input Group 源码，只组合原有 Token 输入、左侧钥匙图标与右侧密码显示按钮；移除认证页手写的 Token 渐变背景、44px 容器、边框、光圈和显示按钮 CSS。保留既有表单、认证与国际化语义，组件默认高度为 32px，色彩仍取 KG OS 当前主题 Token。
- 旧的全局 `:focus-visible` 会覆盖官方 Input Group 对内部输入的 `outline-none`；限定此全局规则不再命中 `data-slot="input-group-control"`，改由官方外层管理焦点。实际运行中的 `5183` 页在 1200、375、320px 实测：内层无可见描边或光圈，外层有单一 3px 光圈，左右图标及密码显示正常，无横向溢出或浏览器异常；前后截图保留在忽略目录 `.cache/shadcn-review/`。
- `pnpm --filter @kgos/web check` 通过 16 文件 / 154 项测试；正式 Browser 与自包含 MCP 双构建通过。`pnpm test:e2e` 的并行执行为 38/39，唯一失败在本次未改动的 Setup Toast 页脚位置断言；该项单独运行通过，再使用 `pnpm exec playwright test --config config/test/playwright.config.ts --workers=1` 完整复跑为 39/39。并行状态下的 Toast 布局断言波动独立保留，不将串行成功冒充并行验收。未提交、推送或部署，阶段仍为 `in_progress`。

### Token 输入焦点视觉收敛（2026-10-21）

- 用户验收希望保留聚焦边框，但去除官方 Input Group 的外侧 3px 光圈：在 `shared/ui/input-group.tsx` 移除 Focus 与 Invalid 状态的 Ring 工具类，保留 `border-ring` / `border-destructive` 作为清晰状态提示。不修改通用 Input、验证逻辑、管理员凭证或页面布局。
- 真实本地 Web `5183` 的 1200、375、320px 浏览器检查确认：聚焦边框保持紫色，外层 `box-shadow: none`；错误状态无发光；无 JS 错误或横向溢出。回归断言覆盖焦点边框、无阴影与登录失败状态，`pnpm --filter @kgos/web check` 通过 16 文件 / 154 项测试；完整 `pnpm build` 生成匹配的内嵌 Web/Go Runtime，生产 E2E 认证定向验证 3/3 通过。
- 此次仅调整 Input Group、认证 E2E 与本阶段记录；此前整仓安全审计阻断及并行 Toast 用例波动均不在本次视觉修改范围，Phase 维持 `in_progress`。没有 Commit、Push 或部署。

### 整仓门禁、未验证与交付边界

- 最终串行 `pnpm validate` 已结束，退出码 1：安装、依赖一致性、静态检查、完整构建、Go race/coverage/security、Vitest coverage、类型覆盖率、重复/无用检查、39 项 Playwright 与许可门禁均通过，最后在 `check:security` 的开发依赖审计停止。后置 `check:diff` 已独立执行通过，不能声称整仓门禁全部通过。
- 当前未豁免的高危阻断为任务前即存在的开发依赖 `markdown-it@15.0.1`，审计编号 `GHSA-r7fv-28h4-cvq7`，依赖路径为根 `markdownlint-cli2 > markdown-it`；任务前 lockfile 已含该版本。审计总计另包含既有低危项与已豁免项，本轮没有扩大豁免或升级无关根工具链。此阻断保留在 Phase 收尾条件中，不影响上述已实际通过的迁移测试结论。
- MCP 单文件资源构建仍有 Vite 的大于 500 kB 提示；任务前已有，迁移引入的交互库使当前资源增加。保留自包含资源合同，不以拆成外部资源规避提示。
- 未执行真实 ChatGPT Sidebar App / Conversation Panel 的人工客户端验收、Dev 部署、远端 CI、发布；未使用个人外部 Embedding 账户做在线探测。自动测试中的 HTTP Provider fixture 与真实服务调用边界已区分。
- 基于任务开始时的 SHA-256 清单与增量 Diff 检查，未改动无关用户文件；现有 Phase 25–28、服务端、CLI/SDK 和 Plugin 改动均保留。未创建 Worktree，未 stage、Commit 或 Push。
- 本地完整验证日志及前后视觉证据留在临时目录和忽略的 `.cache/shadcn-review/`，不纳入提交；关键结论记录于本计划。
