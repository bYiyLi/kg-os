# Phase 11：Windows Runtime CI 验收与六平台发布

## 目标与状态

`in_progress`。Windows x64 / arm64 的 native Runtime package、真实 runner 验收、`0.1.1` 八包发布、六平台 public-registry `npx` smoke 与 GitHub Release 已完成。剩余首发认证收尾：为两个 Windows package 配置 Trusted Publisher，并删除短期 bootstrap credential。Phase 10 的四平台完成结论保持原适用范围。

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

- Windows x64 / arm64 使用 `windows-2025` 与 `windows-11-vs2026-arm` runner；Lithograph v0.3.0 固定 ZIP 的 SHA-256、三个 DLL、arm64 CGO target 与两个 Runtime package manifest 均在真实 runner 上验证。前五次 CI 暴露并修复了 Windows `tar.exe` / CRLF、file URI、credential ACL、locator 锁、arm64 CGO 与 Jieba Rust 编译、packed Patch file 等问题；历史失败 run 为 `36262650545`、`36263099654`、`36263422963`、`36264716226`、`36265371571`。
- 发布源码提交 `1509eaf80a1aadf6a8f126a479cf8854c016ed2a` 的 CI run `36266146250`：Validate 与 macOS arm64/x64、Linux glibc arm64/x64、Windows arm64/x64 的 native/package jobs 全部成功；`v0.1.1` tag 仍指向该提交。后续发布工具/清理修复提交 `98f6fd9`、`3d1259a`、`356dd26`、`b43d3fe` 均已推送；`b43d3fe` 的 CI run `36271435413` 同样六平台全绿。
- 首次 Release run `36266771760` 的六个平台候选成功，但 Windows `npm pack` 只在 CLI `dist/bin.js` 可执行位上与 Unix tarball 不同，聚合失败。修复后 run `36268144455` 的六候选与聚合成功；npm 精简元数据缓存使 publish 在七包后达到 job 时限。恢复工作流复用该 run 的原始 `release-set`，按 tag revision、version、tarball hash 验证后继续，避免重新构建的 native tarball 与已发布版本冲突。
- 恢复 run `36270787994` 完成第八个 `@kgos/cli@0.1.1` 包及八包 exact-version / `latest` 校验；macOS/Linux 四个平台 public-registry smoke 通过。Windows 首轮 smoke 的业务步骤已运行，但清理时 DLL 短暂占用导致权限错误，后续给 Windows 临时目录清理加入有上限的重试。
- 最终 Release run `36271452963` 的第二次尝试为 `success`：八包与 `latest=0.1.1` 的完整性核对、macOS/Linux/Windows arm64/x64 六平台 public-registry `npx` smoke，以及非 draft、非 prerelease 的 GitHub Release `KG OS v0.1.1` 均成功。Windows x64 首次尝试在 `npx --version` 遇到无输出的 `0xC0000409` fail-fast，重试同一 job 后完整 smoke 成功；崩溃进程与原因仍无诊断证据，不把该一次成功外推成稳定性证明。
- 两个 Windows package 的首次发布使用短期 npm bootstrap token。GitHub Actions secret `NPM_TOKEN` 已删除，`gh secret list --repo bYiyLi/kg-os` 确认不再列出它；Windows package Trusted Publisher 设置与 npm bootstrap token 撤销仍待 npm Web 安全密钥验证。完成并核对后再将本阶段状态改为 `done`。
