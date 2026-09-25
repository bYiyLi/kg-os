# Phase 09：MVP Release Closure

## 1. 目标

把 Phase 00–08 已完成并通过跨平台 candidate 验收的 KG OS，关闭为第一个**真实可从 npm registry 获取并运行**的公开 MVP Release：

```text
validated v<version> tag revision
        │
        ├── @kgos/sdk
        ├── @kgos/cli
        ├── @kgos/runtime-darwin-arm64
        ├── @kgos/runtime-darwin-x64
        ├── @kgos/runtime-linux-arm64
        └── @kgos/runtime-linux-x64
        │
        ▼
public npm registry
        │
        ▼
real npx install / runtime smoke
        │
        ▼
Git tag + GitHub Release + docs status
```

本 Phase 只关闭 **Release engineering、registry publish、registry acceptance 与 Release 证据**。不增加新的 Kernel / Ontology / Object / Graph / Evolution 产品能力，不展开 Web 页面，不实现 AI Skill，不增加 Windows / Linux musl target，也不修改 Lithograph 产品合同。

## 2. 状态

`blocked`

Phase 09 的仓库内 Release engineering 已进入实现与验证阶段：首个公开 MVP baseline 已冻结为 exact version `0.1.0` 与正式 dist-tag `latest`，版本源、candidate provenance / aggregation、partial-release recovery、public-registry smoke 与 Release workflow 已实现。正式入口已调整为 push 已存在的 `v<version>` Git tag；`workflow_dispatch` 只恢复一个已有 tag。当前 `@kgos` npm organization 已真实创建，当前 npm account 为 owner 且已启用 2FA；真实 Release 仍被首次 publish 的 bootstrap credential / 后续 Trusted Publishing 配置与实际 publish acceptance 阻塞。

在取得首次 publish credential 并实际 push release tag、执行 registry publish、四平台 post-publish smoke、Trusted Publisher 配置与 GitHub Release 前，本 Phase 不得进入 `done`，也不得把仓库状态写成“已发布”。

## 3. Design Inputs

- [Client：版本关系](../../design/client.md#版本关系)
- [Client：发布与验证边界](../../design/client.md#发布与验证边界)
- [Client：npm package topology](../../design/client.md#npm-package-topology)
- [Runtime：Native Runtime package](../../design/runtime.md#native-runtime-package)
- [Phase 08：TypeScript Client & npm Runtime Distribution](08-typescript-client-npm-runtime.md)
- [开发计划状态模型与通用完成标准](../README.md)

本 Phase 不复制 CLI / SDK / Runtime 的产品合同。package 名称、支持平台、Runtime 内容、Instance Root 与版本兼容语义继续由 Client / Runtime owner 文档定义。

## 4. 当前基线

截至 2026-09-25 当前工作树：

- Phase 00–08 均为 `done`；
- Phase 08 pushed revision 已完成 Validate + 四平台 native/package matrix；Phase 09 release engineering 实现提交 `37290ef0ed31f1e6627654109011bc212089d2d7` 已推送到 `main`，对应 GitHub Actions run `36136264908` 的 Validate 与四平台 native/package jobs 全部成功；
- exact Release version 已冻结为 `0.1.0`，正式 dist-tag 已冻结为 `latest`；root、SDK、CLI、Web、四个 Runtime package、SDK public version constant 与 Go build info 已同步；
- Release workflow 已改为 `v*` tag push 自动触发，`workflow_dispatch` 只接受一个已存在 tag 用于 recovery；preflight 验证 tag/version/source identity，publish job 支持 GitHub Actions OIDC，并保留首次 publish 可使用短期 `NPM_TOKEN` bootstrap fallback；
- 六个 public package 已补齐与 `bYiyLi/kg-os` 一致的 `repository.url`，满足 npm Trusted Publishing 的 repository identity 要求；
- publish 顺序固定为四个 Runtime → SDK → CLI；每个 package 直接带正式 `latest` dist-tag 发布，CLI 最后切换，因此不再依赖 post-publish `npm dist-tag add`；
- Git repository 当前没有 Release tag；
- 当前 macOS arm64 已真实完成 `0.1.0` Runtime build、三包 `npm pack`、repo 外 packed smoke 与 candidate provenance 输出；candidate 因未提交工作树正确记录 `dirty: true`，不能进入正式聚合；
- 当前 npm registry 查询 `@kgos/cli`、`@kgos/sdk` 与四个 Runtime package 均未发现已发布 package/version；`@kgos` organization ownership 已通过 npm Web 实际页面确认，但首次 publish 仍需一个可供 GitHub Actions 使用的 bootstrap credential。

## 5. 前置依赖

### 5.1 已满足

1. Phase 08 为 `done`，六个正式 npm 发布单元及 candidate topology 已实现；
2. macOS arm64/x64 与 Linux glibc arm64/x64 均已有真实 native build / load / packed smoke 证据；
3. CLI、SDK、Runtime package 使用同一 KG OS version 的约束已有仓库检查；
4. npm 是正式分发入口，GitHub artifact 只作为 CI / provenance / 调试证据。

### 5.2 Publish 前必须满足

1. 冻结本次 Release 的 exact version；不得以 `0.0.0` 执行正式 publish；
2. 冻结本次 Release 使用的 npm dist-tag；
3. 由有权限的 npm account / organization 证明可以公开发布 `@kgos/*`；当前已确认 npm account 为 `@kgos` owner；
4. GitHub Actions / release executor 具备最小必要 npm publish authority：首发允许短期 bootstrap credential，后续使用 package-level Trusted Publishing / OIDC；credential 不进入仓库、artifact、stdout/stderr 或 release notes；
5. GitHub repository 具备创建对应 Git tag / GitHub Release 的授权路径。

任何一项真实缺失只阻塞依赖它的 publish / finalization，不阻止独立的 release tooling、dry-run 与 review 工作。

## 6. Feature 顺序

```text
09.1 Release baseline / version closure
  -> 09.2 Release preflight + publish tooling
  -> 09.3 Cross-platform candidate aggregation
  -> 09.4 npm publish + partial-release recovery
  -> 09.5 Registry acceptance + real npx matrix
  -> 09.6 Git/GitHub release finalization + docs sync
```

Git tag 是明确的 Release 触发器，必须由人先创建并 push；普通 `main` push / pull request 只继续跑 CI，不自动产生公开 Release。GitHub Release 仍只能在 npm publish 与四平台 public-registry acceptance 成功后创建。

## 7. Features

### 09.1 Release Baseline / Version Closure

- 把 Release exact version 作为单一 release baseline，按现有仓库版本合同同步到 root package、SDK、CLI、Web、四个 Runtime package、SDK public version constant 与 Go build info；
- 保持 CLI → SDK 与 CLI → Runtime 的 packed dependency version 为 exact same version；
- 冻结本次 dist-tag，并使 Release workflow / registry verification 使用同一值；
- Release candidate 必须绑定一个确定的 Git commit SHA；后续所有平台 artifact、registry package、tag 与 GitHub Release 都能追溯到同一 source revision；
- 不在 Phase 内发明独立版本文件或第二套 version source。

### 09.2 Release Preflight + Publish Tooling

- 建立正式 Release workflow / release tooling，复用 Phase 08 已有 build、native test、pack 与 smoke 能力，不复制第二套 package builder；
- workflow 只从 `v*` tag push 或显式 recovery dispatch 启动，不因普通 PR / `main` push 自动 publish；
- publish 前检查：existing release tag、tag/version exact match、tag revision 属于 `origin/main` 历史、clean source revision、package metadata、registry target version 状态、要求的 CI / candidate gates；
- npm authentication 使用 repository 外的受控机制；仓库不得提交 token、生成持久 `.npmrc` secret 或把 credential 输出到 log；
- release tooling 对 dry-run / preflight 与真实 publish 明确区分，未执行 publish 时不得把结果记录为已发布。

### 09.3 Cross-platform Candidate Aggregation

- 从同一 source revision 取得四个 target 的 Runtime candidate：
  - `darwin-arm64`
  - `darwin-x64`
  - `linux-arm64`（glibc）
  - `linux-x64`（glibc）
- 取得一组同 revision / version 的 SDK 与 CLI candidate；
- 聚合阶段验证 package name、version、target、manifest、native SHA-256、npm pack integrity 与 required contents，不接受缺失 target、混合 revision 或 stale artifact；
- Release publisher 只消费通过上述验证的 immutable candidate，不在 publish job 中临时改写 binary、package name 或业务代码。

### 09.4 npm Publish + Partial-release Recovery

- 公开发布六个正式 package，dependency package 先于 `@kgos/cli`：
  - 四个 `@kgos/runtime-*`
  - `@kgos/sdk`
  - `@kgos/cli` 最后
- publish 使用 Client 设计要求的 public access metadata；
- 每个 package 直接使用冻结的正式 dist-tag 发布，顺序固定为 dependency packages 先、CLI 最后；CLI 发布前必须确认其 exact SDK / Runtime dependency 已全部以本次 immutable artifact 存在于 registry；
- 在首次 publish 前，目标 version 若已存在于任一 package，必须 fail closed，除非 workflow 正在恢复**同一次已验证 candidate 的部分成功发布**；
- npm package version immutable，因此 Release tooling 必须处理 partial publish：
  - 已成功 package 不尝试覆盖 / 重发；
  - 只有能够通过 registry `dist.integrity` / 等价不可变 artifact identity 证明现有 package/version 与本次 candidate 一致时，才允许继续发布缺失 package；
  - 任一现有 artifact 无法证明一致时终止，不用 unpublish / force overwrite“修复”；
- CLI 不得在 SDK 或当前支持平台 Runtime 仍缺失时发布为可消费的最终入口；
- partial recovery 中，已存在同版本 artifact 除了 integrity 必须一致，还必须已经携带本次正式 dist-tag；否则 fail closed，不使用 OIDC 之外的隐式 tag mutation 修补。

### 09.5 Registry Acceptance + Real npx Matrix

- 直接从 public npm registry 验证六个 exact package/version 均可解析，metadata / dependencies / target / artifact integrity 与 Release baseline 一致；
- 使用干净临时目录和 registry package，而不是 workspace、local tarball 或历史 `node_modules`，执行 canonical：

```text
npx --yes @kgos/cli@<version> --root <instance-root> ...
```

- post-publish smoke 至少覆盖：
  - `kg --version` 返回 exact Release version；
  - `doctor` 在未初始化 root 上保持既有只读语义；
  - `init` 完成完整显式配置；
  - 首个业务命令从 registry Runtime 自动启动 `kgosd` 并 bootstrap；
  - 至少一条 Ontology read、Graph read/write 与 Evolution overview 成功，证明真实 registry package 到 Kernel/Lithograph 的主链可用；
- macOS arm64/x64 与 Linux glibc arm64/x64 都必须从 registry 完成 native Runtime selection / startup smoke，不能只复用 publish 前的 tarball matrix；
- registry 可见性存在短暂传播延迟时只允许有界 retry；最终仍不可解析则验收失败。
- 发布 job 完成后重新读取 registry，要求六个 package 的 exact version、artifact identity、CLI exact dependencies 与正式 dist-tag 均一致；四平台 smoke 失败时不得创建 GitHub Release，也不通过 unpublish / force overwrite 回滚 immutable package version。

### 09.6 Git / GitHub Release Finalization + Docs Sync

- `v<version>` Git tag 在 workflow 启动前已经存在，并且必须指向本次 release revision；
- 只有 09.5 registry acceptance 全部成功后才创建 GitHub Release；Release 必须引用已有 tag / commit，并记录实际公开 npm package version 与支持 target；不上传需要用户手工安装的第二套正式分发物；
- GitHub Actions candidate artifacts可以保留为 provenance / debugging evidence，但 npm 仍是正式用户分发入口；
- 同步 README、设计状态导航、开发路线和本 Phase 当前状态，使“已发布”只出现在 registry / tag / GitHub Release 都有真实证据之后；
- 外部市场推广、社交媒体 announcement、Web 与 AI Skill 不属于本 Phase。

## 8. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | Release version | 非 `0.0.0` exact version 在仓库既有 version contract 中完全一致，SDK / Go runtime报告同一版本 |
| B | Source identity | SDK / CLI / 四个平台 Runtime、registry package、Git tag / GitHub Release都追溯到同一 release revision |
| C | npm authority | `@kgos` scope 对六个 package具有真实 public publish authority；无权限时 fail closed、不静默改名 |
| D | Candidate set | 四个平台 Runtime + SDK + CLI candidate齐全，metadata/manifest/hash/target/version全部验证 |
| E | Publish safety | 只有 `v*` tag / existing-tag recovery 可 publish；credential不泄漏；dependency packages先于CLI；目标 version 冲突时fail closed |
| F | Partial recovery | 部分 package 已发布时，只能在证明与本次candidate一致后续发缺失项；不覆盖、不unpublish、不换artifact |
| G | Registry package set | public npm registry可解析六个 exact package/version，artifact identity、CLI exact依赖与正式dist-tag全部正确 |
| H | Real registry smoke | 四个支持平台均从registry选择正确Runtime并完成version/init/auto-start/代表性业务E2E |
| I | Release finalization | `v<version>` tag预先存在且指向release revision；registry acceptance成功后才创建对应GitHub Release |
| J | Status truth | README / Design navigation / Development plan只按真实registry、tag、Release证据标记published / done |

## 9. 关键失败路径

至少覆盖：

1. Release version仍为 `0.0.0`、非法 SemVer或仓库各version source不一致；
2. `@kgos` scope不存在、当前身份不是owner/member、2FA / trusted publisher / token权限不足；
3. target version在六个package中的一个或多个已经存在；
4. registry已有同package/version但无法证明与本次candidate身份一致；
5. publish在第N个package后失败，形成partial release；
6. CLI在SDK或对应Runtime未公开可解析时被提前publish；
7. partial publish 后 dependency package 已切换正式 dist-tag，但 CLI 未发布；rerun 必须只接受与本次 candidate identity 一致且 dist-tag 正确的已发布项，不能覆盖或静默改 tag；
8. matrix artifact来自不同commit、不同version或stale workflow run；
9. 某个平台Runtime artifact / manifest / SHA-256缺失或target metadata错误；
10. registry install错误命中workspace、本机历史cache或local tarball而产生假阳性；
11. registry propagation延迟后仍无法解析新version；
12. npm package已发布但真实 `npx` 无法选择当前平台Runtime、无法启动daemon或version mismatch；
13. post-publish smoke失败但workflow仍创建GitHub Release；
14. tag/version不一致、tag不属于 main 历史，或 recovery dispatch 指向错误 tag；
15. credential、auth header、npm token或其它secret进入log/artifact/repository；
16. Release失败后文档被提前标记为published / Phase `done`。

## 10. 验证计划

### Targeted

- version sync / release preflight unit tests；
- release candidate aggregation：package set、source SHA、version、target、manifest/hash；
- registry state decoder与target-version conflict检查；
- partial-publish recovery逻辑：missing / matching-existing / conflicting-existing；
- release workflow静态检查：只有 `v*` tag push / existing-tag recovery具备publish路径，PR / ordinary main push不具备publish路径；publish job具备 OIDC `id-token: write`。

### Pre-publish integration

- 主工作树 `pnpm validate`；
- 独立 fresh-source `pnpm run setup && pnpm validate`；
- 四平台 native Runtime build / Lithograph suite / packed candidate smoke；
- Release dry-run / preflight证明不会产生registry、tag或GitHub Release副作用。

### Post-publish acceptance

- 对六个package执行public registry exact-version检查；
- 验证六包正式dist-tag已经随 publish 原子指向本次version；
- 四平台从registry进行clean `npx --yes @kgos/cli@<version>` smoke；
- 验证触发tag存在、version匹配且指向release revision；
- 验证GitHub Release存在并引用同一tag/version。

### Repository gates

- `pnpm check:quick`；
- `pnpm validate`；
- `git diff --check`；
- Markdown links / spelling / package metadata / license / audit gates；
- final diff与untracked/generated/secret hygiene。

## 11. Review 重点

- Release workflow是否错误允许PR、普通push或未验证commit直接publish；
- 是否存在长期npm token落盘、secret log、artifact credential泄漏；
- 是否复用Phase 08 builder而不是新建第二套package生成逻辑；
- version是否仍有第二真源、手工漏改或CLI/daemon drift；
- 四个平台candidate是否真的来自同一revision；
- publish顺序是否保证CLI只在其exact dependencies可用后公开；
- partial publish恢复是否尊重npm不可变version，而不是覆盖/unpublish/换artifact；
- registry smoke是否真正绕开workspace/local tarball并覆盖四个支持平台；
- Git tag是否作为显式release trigger预先存在且与version/source一致；GitHub Release是否只在registry acceptance成功后产生；
- 文档是否把candidate成功、npm publish、tag、GitHub Release错误合并成一个“发布完成”状态；
- 是否意外扩大到Web、Skill、Windows、musl、auto-upgrade、远程server或新的产品语义。

发现 finding 后执行“修复 → targeted复验 → 必要范围扩大验证 → 再 Review”；没有新的 task-affecting finding 时停止。

## 12. 完成条件

Phase 09 只有同时满足以下条件才能进入 `done`：

1. 09.1–09.6 全部真实执行并取得证据；
2. 正式 Release version / dist-tag 已冻结且不再使用 `0.0.0`；
3. `@kgos` scope publish authority 已取得真实证据；
4. 六个 npm package 在 public registry 以同一 exact version真实存在；
5. CLI 的 exact SDK / Runtime dependency与registry metadata一致，六个package的正式dist-tag随本次publish指向同一exact version，并在registry acceptance中重新验证；
6. partial-release冲突/恢复边界已验证，不存在需要覆盖已发布version的路径；
7. 四个支持平台都从public registry完成真实 `npx` Runtime selection与代表性业务smoke；
8. `v<version>` Git tag真实存在、作为Release trigger并指向release revision；
9. GitHub Release真实存在并引用同一tag/version；
10. Phase Review findings全部关闭；
11. 本地/fresh-source/四平台pre-publish gates与post-publish registry acceptance均成功；
12. README、设计状态导航、开发路线与Phase状态同步到真实Release结果；
13. 最终diff、links、package metadata、license/audit、secret与仓库卫生检查通过。

任何仅完成候选构建、workflow配置、npm publish的一部分、Git tag或GitHub Release中的单项，都不能单独声明 Phase 09 `done`。

## 13. 当前状态

2026-09-25：`blocked`。

当前已完成 09.1 与 09.2–09.6 所需的仓库内 Release tooling：`0.1.0` / `latest` baseline、`v*` tag-trigger / existing-tag recovery、tag/version/main-history preflight、同 revision/version candidate contract、Runtime manifest/native SHA-256 与 npm integrity聚合校验、immutable registry identity 驱动的 partial recovery、Runtime→SDK→CLI-last direct final-tag publish、OIDC-ready package repository identity、clean public-registry `npx` smoke以及registry acceptance后才允许创建GitHub Release的依赖链。

当前工作树完整 `git diff --check && pnpm validate` 已成功；独立 fresh-source 从 `HEAD + 当前 tracked/untracked Phase 09 变更` 重建后，`pnpm run setup && pnpm validate` 也成功。两轮都覆盖 Go check/race/coverage/security、TypeScript type/lint/test/coverage、Playwright、真实 Lithograph v0.3.0 native suite、packed npm smoke、license/audit/diff 等既有完整门禁。final review 继续闭环跨平台 client candidate identity、Runtime manifest 三文件 SHA-256、workflow 非 main fail-closed、registry smoke/packed smoke daemon cleanup 等边界；当前 reviewed repository scope 没有剩余 task-affecting code finding。

已确认 `@kgos` npm organization真实存在，当前 npm account 为owner且启用2FA；短期 bootstrap credential 已配置为 GitHub Actions secret，`v0.1.0` tag 已真实 push 并指向 release revision。尚未完成且不能伪装为完成的部分包括：六包真实 public publish、四平台 post-publish registry smoke、为六包配置 GitHub Actions Trusted Publisher，以及 GitHub Release。首次 package 尚不存在，Trusted Publisher 需要在 package 建立后配置，因此 Phase 09 在真实 registry acceptance 完成前保持 `blocked`。

`v0.1.0` 首次 Release run 已真实执行到四平台 candidate 全部成功，但 aggregate 在 publish 前 fail closed：CLI 的 `dist/.tsbuildinfo` 被误打入 npm tarball，TypeScript build cache 在 macOS 与 Linux 间不同，导致 client package byte-integrity 不一致。没有任何 npm package 被发布。修复把 CLI build info 移到仓库 cache，并在 packing 与 existing-tag recovery workflow 中显式排除该非运行时文件；同一 `v0.1.0` tag 将通过 recovery dispatch 继续，不移动 release source tag。
