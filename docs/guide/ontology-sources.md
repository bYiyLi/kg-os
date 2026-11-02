# 基础本体资料维护与旧模型库迁移

<!-- cspell:words pypdf -->

本指南负责维护操作；设计与边界见 [D121](../design/decisions.md#d121-bundled-foundations-and-quality-review) 和 [MCP owner](../design/mcp.md#ontology-standards-authoring)，状态与证据见 [Phase 27](../development/phases/27-knowledge-standards-skills.md)。

## 核对包内来源

运行时入口是 [Ontology Skill](../../plugins/kgos/skills/kgos-ontology-standards/SKILL.md)，其 [基础本体入口](../../plugins/kgos/skills/kgos-ontology-standards/references/foundations.md) 条件式指向五套理论的原件、方法、依赖及缺口。`references/upstream/` 保持来源原始字节，`readable/` 是逐页完整文本提取，`foundations/` 是独立 KG OS 适配，`source-index/` 是文件路由，`sources.json` 是精确清单。第三方许可与署名按 [声明](../../plugins/kgos/skills/kgos-ontology-standards/references/third-party-notices.md) 保留，不被本项目商业条款覆盖。

在仓库根目录运行只读检查：

```sh
pnpm check:ontology-sources
```

此命令核对来源/许可元数据、原件 SHA-256/Git blob、字节数、完整文本的来源及页序、声明总数和实际文件集合。它不访问网络、不执行原件中的代码/案例，也不调用 KG OS。非零退出须先解决确切的清单/文件差异，不能直接重新计算 hash 掩盖来源变化。

需要对照上游真实树时，将已核准的来源 Git 仓库放在某个本地父目录的 `kgos-<source-id>` 下；来源 URL 和固定 Commit 从清单逐项取得。不要将这些 checkout 放入运行时 Skill。只读对照：

```sh
node scripts/check-ontology-sources.mjs --upstream-root /tmp
```

`--upstream-root` 不会下载仓库或切换分支；相应 clone 必须已含固定 Commit。检查用该 Commit 的 `ls-tree` 对比收录与排除的**完整集合**，不采用上游工作树文件，不执行构建或证明。非 Git 来源（固定 arXiv 版本和法律文本）的 URL、版本、许可依据与 hash 单独记录，Git 树检查不覆盖其远程内容。

## 更新一个来源

1. 确定用户请求涉及的理论、版本/变体与实际缺口，只更新所需来源。检查当前包和本地 Git 状态，保留用户定制；未经授权不改变实例模型或已安装 Plugin。
2. 从来源官方仓库读取固定 Commit 的完整文件树，逐项决定收录或排除及理由。用 `git show <commit>:<path>` 取得原始 blob 字节，保留原路径和原通知；不要格式化、换行归一化或手工重写原件。`.gitattributes` 对原件/完整提取副本关闭文本转换和空白格式判断，普通项目文件仍使用原规则。
3. 核对许可及逐文件例外、署名、依赖、实现与原理论差异。全仓库已下载不代表所有论文/书籍都在其许可下；未知或未公开内容写入来源 `gaps`。源文件删除、核心缺失或依赖不可得时，暂停依赖部分的覆盖声明。
4. 更新 `sources.json` 的来源 Commit/版本、逐文件 SHA-256、Git blob、字节数、许可、类别与排除集合；同步目录、适配和缺口。文件 hash 是来源取证结果，不是批准内容或执行源码的凭据。
5. 如需 PDF 可读转换，保留原 PDF，记录提取工具/版本、完整页序、每页字符数和原件 hash。当前副本使用 pypdf 6.13.2 的 plain 提取并逐页放入文本围栏，不翻译、不摘要；检查所有页及复现结果。图、公式和排版不能由文本无损表示时明确限制，使用原 PDF/公式源做判断；不能把全文抽取称作语义忠实已认证。
6. 运行上述完整性/上游树检查，检查修改文档、路径、格式和实际 diff。分发器只向原四个官方 Skill 导出；非 Markdown 原件必须被清单精确列出并通过 hash 检查，普通文件保持原大小上限，已列原件的工程上限为单文件 16 MiB。此值是仓库保护阈值，不是 ChatGPT 宿主容量承诺。
7. 在独立临时输出目录检查公开候选与 Plugin 归档：原件/全文逐字节相同、四 Skill 版本一致、许可证与清单完整、项目测试目录未导出。上游原件中的测试/证明源码是只读资料，不能误作要自动执行的项目案例。实际宿主格式、总量、读取轨迹和账户安装状态另行报告；未获得证据不称通过。

本次 D121 增量由用户选择结果 Review，禁止运行案例、模型评测和任务模拟；只使用确定性文件/格式/分发检查。以后资料维护遵循当次授权与仓库要求，不把这一轮范围例外当所有任务永久禁测。

## 旧 `kgos-ontologies` 处理

独立官方业务模型产品线与运行时发现/同步入口已退出本次源码合同。远端仓库保留原状，未归档、删除或改写历史 Tag。其固定 Commit 的 VLog/AIMemory 原件随 Ontology Skill 作为可选静态对照，不默认安装模型，不导出新的官方 Memory Skill。

- 当前 VLog 可维护模型与查询在 `plugins/kgos/skills/kgos-vlog-standards/references/`，历史来源 URL 留在文件中；后续修订在本仓库维护，不再由旧库覆盖。
- `scripts/sync-vlog-ontology.mjs` 保留为安全失败入口，说明退役位置；不会读取旧库或覆盖文件。原旧库导出工具仅属于其历史工作流，当前安装不调用它。
- 已采用旧模型、已有私人 Memory Skill 与用户定制继续按其真实来源识别。需要迁移时先比较目标 State 的本体、身份、关系与实际 Knowledge，取得具体方案授权；源码更新不自动迁移。
- 若将来要为远端旧库添加退役说明、归档或删除，应单独列明目标与影响并取得对应授权。本任务没有实施这些跨库操作。

## 恢复与交付

本次交付是任务分支和 draft PR。恢复源码可从该 PR 的 base Commit 或需要的固定来源重新取文件，随后重新核对清单和差异；不要用恢复源文件来覆盖未核实的并发用户改动。已经分发的 Plugin 使用其旧发行包恢复，源码回退不会自动修改账户安装。

本次没有修改 Prod/Dev Ontology、Knowledge、Branch 或配置，不需要数据恢复。未来迁移涉及的数据回退必须另有实际备份与兼容证据，不能将 Git 回退或镜像回退当作数据库回滚。提交、推送、合并、发布与部署各自报告实际结果；draft PR 不等于已发行或已安装。
