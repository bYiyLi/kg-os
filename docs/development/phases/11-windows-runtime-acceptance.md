# Phase 11：Windows Runtime CI 验收与六平台发布

## 目标与状态

`in_progress`。把现有 CLI + native Runtime package 路径扩展到 Windows x64 / arm64，并在对应 GitHub Actions runner 上取得真实 build、native load、packed npm 使用链与回归证据。六平台候选验收后，按既定 Release workflow 发布 `0.1.1` 的八个 npm package，并完成六平台 public-registry `npx` smoke 与 GitHub Release。Phase 10 的四平台完成结论保持原适用范围；公开 `0.1.0` 仍只有 macOS / Linux Runtime package。

本阶段不增加 Windows Service 或系统级安装方式。Git tag、npm publish 和 GitHub Release 必须在同一经过六平台 CI 验收的 source revision 上进行；仅有本地候选或 CI 配置不构成发布完成。

## 设计输入

- [Client npm package topology](../../design/client.md#npm-package-topology)：平台包、版本关系、manifest 与目标选择。
- [Runtime native package](../../design/runtime.md#native-runtime-package)：daemon、official extensions、Instance 隔离与自动启动。
- [Runtime daemon lifecycle](../../design/runtime.md#daemon-lifecycle)：同 root 锁、stale recovery 和 ready 等待。
- [Phase 10](10-runtime-cli-hardening.md)：现有 packed smoke 与 official Jieba 行为基线。

## 工作与验收

| 工作 | 可观察验收 |
| --- | --- |
| Windows 资产与包 | pinned Lithograph v0.3.0 ZIP 校验、DLL 解包；`kgosd.exe`、Provider/Jieba DLL、license 与 manifest hash 进入 `win32-x64` / `win32-arm64` npm 候选 |
| Runtime 与 CLI | CLI 在 Windows 解析同版本 package，daemon 验证 manifest，`doctor -> init -> auto-start` 在 repo 外 packed install 成功 |
| Native 行为 | Windows runner 真正加载三个 official DLL；Go native suite、中文 Full-text、loopback Semantic Provider、Graph/Object/Evolution 主链成功 |
| 生命周期 | packed smoke 覆盖两个 Instance、并发启动、stale locator、正常与异常退出后的恢复，结束时没有遗留测试 daemon |
| 跨平台回归 | macOS/Linux 既有 CI matrix 与 Ubuntu full Validate 仍成功；release candidate 集合、package metadata、文档与 lockfile 一致 |
| 六平台发布 | `v0.1.1` tag 指向已通过完整 CI 的 main revision；Release workflow 六平台 immutable candidate、八包 exact-version registry verification、六平台 public-registry `npx` smoke 与 GitHub Release 全部成功 |
| 首发认证 | 两个 Windows npm package 首次发布使用短期 bootstrap credential；其余已发布 package 继续使用 Trusted Publishing。首发后为 Windows 包配置 Trusted Publisher，移除 bootstrap credential，并验证后续 OIDC 路径 |

CI matrix 使用 `windows-2025` x64 与 `windows-11-vs2026-arm` arm64，并继续现有四个平台。Windows arm64 所需 CGO toolchain 必须在实际 runner 上证实，不能由 runner 标签或交叉编译推断成功。失败后按日志修复并复验受影响 job；最终 Review 检查 Windows 目标、secret、manifest、进程清理及历史发布边界。只有 Validate 与六个平台的 native/package jobs 在同一最终 revision 成功，且同 revision 的 Release workflow 完成 registry 与六平台 smoke、范围内 finding 关闭并同步状态后，才能改为 `done`。

## 当前证据

- 上游 Lithograph v0.3.0 的 Windows x64 / arm64 ZIP 已下载并核对固定 SHA-256，均含 `lithograph.dll`、`lithograph-openai-compatible.dll` 和 `VERSION`。
- `0.1.1` 代码候选的 macOS arm64 `pnpm validate` 已通过，提交 `1ad53b2890324eec2628f865833d0fd17d2bce3a` 已推送。首次六平台 CI run `36262650545` 的 Windows x64/arm64 在 Lithograph ZIP 读取阶段失败：Git Bash `tar` 把 Windows 盘符当作远端设备。修复提交 `934e3ba3758dad44a0099d47f722c1d0a9a7b142` 改用 Windows 系统 `tar.exe`，第二次 CI run `36263099654` 的两个 Windows job 已读出 ZIP，却因列表 CRLF 行尾未匹配 `lithograph.dll`。修复提交 `41e5b82632a222dedc44477af43fb9b7b4abff4f` 后，第三次 CI run `36263422963` 的 Windows x64 已完成 native build，但测试暴露出 Windows file URI、credential ACL / directory sync、绝对路径与平台 fixture 问题；Windows arm64 的 native build 使用了 x64 GCC，无法编译 ARM64 汇编。上述问题的最小修复与 arm64 CGO toolchain 正在验证。`v0.1.1` 发布与 registry smoke 尚未运行，本阶段尚未完成。
- 修复提交 `398079010b8cdb10cf180d9dbf21300ba945a85a` 已推送；第四次 CI run `36264716226` 的 Validate 与 Linux arm64/x64、macOS arm64/x64 native/package job 已通过，Windows arm64 的目标 CGO toolchain 已在 runner 安装并通过 target 校验。Windows x64 native suite 进一步暴露：`LockFileEx` 锁住 locator 正文导致其它 handle 不能读取；LOAD CSV 测试需要标准 Windows `file:///C:/...` URI；daemon 集成测试也因 locator 无法读取超时。Windows arm64 在 build 时把 Go 的 MinGW `CC` 传给 Rust 的 Windows Jieba 构建，导致 C 标准头缺失。当前正验证这些修复，第四次 CI 不能作为发布依据。
