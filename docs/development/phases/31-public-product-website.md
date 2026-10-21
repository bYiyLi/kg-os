# Phase 31 — Public KG OS Product Website

## Design inputs

- [Client：公开产品官网（Astro / GitHub Pages）](../../design/client.md#公开产品官网astro--github-pages)
- [D108：唯一私有开发真源与公开分发](../../design/decisions.md#d108-private-source-public-releases)
- [D109：公开仓库单一分发入口与唯一安装说明](../../design/decisions.md#d109-single-public-distribution-and-installer)
- [公开工作流维护指南](../../guide/distribution-maintenance.md)

## 当前状态

`done`（2026-10-22）。V4 首页已从私有 `distribution/site/` 生成到公开仓库并通过 GitHub Pages 发布；中英文、深浅主题/系统默认、AI Agent 安装提示词、复制功能和桌面/手机响应式均有真实线上验收。官网部署独立于 KG OS Docker Release，**网站发布成功不等于镜像已发行**。

## 范围

1. 用 Astro、TypeScript 和原生 CSS 实现 V4 产品官网：产品定位、示例图谱、价值对比、四步工作流程、核心能力、清晰架构和 AI Agent 安装 CTA；首页不展示单独的手动安装入口。
2. 采用 `/en/`、`/zh/` 静态页面，默认识别浏览器语言；深浅主题默认跟随系统，显式选择可持久化。产品图谱必须标注示例，不使用虚假性能数字或已经发布的版本承诺。
3. 官网源码只维护于 `kg-os/distribution/site/`，受控导出到 `kg-releases/site/`；不改变 `packages/web` 管理工作区，不将私有源代码或用户凭证公开。
4. 公开 GitHub Pages 的构建与部署独立于源代码 Validate/Docker/Release。公开构建只使用本站源文件、锁文件和 GitHub Pages 权限，不检出私有 KG OS。

## Acceptance

- [x] 产品网站源码存在且 Astro 类型检查、静态构建生成中文、英文及根入口。
- [x] 导出器保留唯一 `INSTALL.md` 和准确七个官方 Skill，同时包含网站与独立 Pages 工作流；生成回归测试通过。
- [x] 浏览器验证中英切换、显式主题跨刷新生效、选择系统删除偏好、根目录按语言跳转。
- [x] 移动视口 390px / 320px 没有横向溢出；展示内容注明“演示/示意”。
- [x] 官网唯一安装入口由双语 Agent 提示词和复制按钮组成；提示词直接指向唯一公开 `INSTALL.md`，实际验证复制结果及权限受限的失败反馈，无手动安装切换。首页主 CTA 同样指向 Agent 安装入口。
- [x] 在仅含生成公开文件的全新目录中，使用冻结锁文件（离线安装）完成 Astro check/build；核对 `/kg-releases/_astro/` 静态资源路径及 `/en/`、`/zh/` 页面，未需要私有源代码。
- [x] 获授权 Push 后真实 `kg-releases` Pages 工作流成功，公开站点中文、英文、深浅主题及手机端通过远端验收。
- [x] 检查本任务范围的 diff、导出白名单及无关工作树变更，关闭移动端溢出及动态网站导出白名单过宽的问题；保留其它任务的既有修改。

## 本地验证记录（2026-10-21）

- 独立站点 `pnpm check`：7 个 Astro 文件、0 errors / 0 warnings / 0 hints；`pnpm build` 生成 `/en/`、`/zh/` 与根语言入口。
- 浏览器验证：桌面中文、英文路由切换；浅色主题保存并在刷新后恢复，切回系统模式移除保存的偏好；390px、320px 浅色手机屏宽没有横向滚动。
- 单独临时 Git 仓库渲染导出 → `pnpm install --frozen-lockfile --offline` → `pnpm check` → `pnpm build` 均成功；构建资源使用 `/kg-releases/_astro/` 路径。没有检出私有程序源码。
- 导出器 Node tests 4/4、相关 ESLint/Prettier、Markdown 检查及 `git diff --check` 通过；站点生产依赖审计无已知漏洞。只读截图临时文件已清理。
- AI Agent 安装入口定向回归：中英文提示词各自包含同一公开原始 Markdown 地址，授权剪贴板后点击复制并读取结果完全一致；复制被拒绝时显示准确失败说明并选中可复制文本；390px 和 320px 视口无横向滚动，导航仍指向同一安装入口。安装实际执行依赖外部 Agent 授权，不属于网页点击测试。
- 本段属于 2026-10-21 的本地阶段证据；当时尚未 Push，真实公开部署由以下 2026-10-22 验收独立闭合。

## 2026-10-22 真实公开部署与验收

- 官网源码、生成器及发布配置随私有 `main@e0544ac60140502df86a62c68b4ceffb15c26592` 已提交并推送；Git 工作区在提交后干净。同步工作流 [Run 39631960094](https://github.com/bYiyLi/kg-os/actions/runs/39631960094) 首次推送因新增 GitHub Actions 工作流缺 OAuth `workflow` scope 被拒绝；使用有权限的 GitHub 连接仅初始化与私有真源完全一致的公开 `pages.yml`，再重跑原同步，最终 **attempt 2 success**。没有在公开仓库维护第二份页面源码。
- 公开 [Product website Run 39632399800](https://github.com/bYiyLi/kg-releases/actions/runs/39632399800) 的 Astro Build 与 Pages Deploy 两个 Job 均 **success**，正式项目地址为 `https://www.y2l.top/kg-releases/`（沿用账号既有 Pages 自定义域名）。
- 使用真实 Chromium 浏览器逐一加载线上 `/zh/` 与 `/en/`，均 HTTP 200；中英文提示词使用相同的公开 `INSTALL.md`，按钮复制内容与输入框完全一致。手动选择浅色主题后刷新仍生效；390px、320px 视口无横向溢出。Pages 不获取私有源码、运行时数据或部署密钥。
- 发布到公开站点的是产品介绍及用户安装入口，不是 KG OS Instance。Docker GHCR 发布、合法二进制分发前置、Tag 和 Plugin Release 属于 Phase 30 的独立验收，不计入本阶段。

## Review / Constraints

- 不发布未经授权的 Release，不启用二进制发布门禁，不变更 Lithograph、KG OS Kernel 或运行时 Web。
- 本地文件、Git Commit、Push、公开 CI、GitHub Pages 部署和用户可访问状态分别报告；不能将本地构建成功当作上线成功。
- 不添加动态后端、React、CMS、站点登录、外部字体服务或额外安装文档。
