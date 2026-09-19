# KG OS 开发计划

本目录把[设计文档集](../design.md)中已经确认的产品与技术设计拆成可连续执行、可验证的开发阶段。Design 定义系统行为与边界；Development 只定义实现依赖、交付单位、状态、验收和完成证据。本地安装与命令操作见[开发指南](../guide/development.md)。

## 1. 文档职责

| 内容 | 唯一位置 |
| --- | --- |
| 产品行为、结构、接口、数据与运行时决定 | [`docs/design/`](../design.md) |
| 阶段顺序、Feature、状态、Acceptance、Review 与完成证据 | 本目录及 [`phases/`](phases/) |
| 安装、启动、调试、检查、测试和打包步骤 | [开发指南](../guide/development.md) |
| 实际开发过程记录 | [`docs/vlog/`](../vlog/) |

阶段计划引用 Design Inputs，不复制或改写产品合同。设计尚未确定时，Development 只能记录准确 gap，不能用实现计划替代设计决定。

## 2. 开发执行模型

```text
Design baseline
     ↓
Phase plan
     ↓
Feature dependency order
     ↓
Implementation
     ↓
Targeted validation
     ↓
Phase acceptance
     ↓
Review findings closure
     ↓
Documentation and status sync
```

Feature 是实现单元，Phase 是默认交付与验收单元。Feature 完成、代码已经存在或某一条测试通过，都不能单独替代 Phase acceptance。

## 3. 状态模型

| 状态 | 含义 |
| --- | --- |
| `planned` | 目标已进入路线，但 Design Inputs、依赖或 Acceptance 尚未全部满足 |
| `ready` | Design Inputs、前置依赖、Feature 顺序和 Acceptance 已齐全，可以开始实现 |
| `in_progress` | 正在实现、验证、Review 或关闭阶段验收缺口 |
| `blocked` | 存在当前仓库、设计真源或已授权能力无法解决的真实阻塞 |
| `done` | 实现、全部阶段验收、Review、文档同步及该阶段要求的远端门禁全部完成 |

状态只描述当前仓库的真实证据。配置存在不等于远端门禁通过；本地验证不等于 CI、发布或部署已经完成。

## 4. 当前基线

**Phase 00 当前为 `in_progress`。** TypeScript workspace、CLI / daemon / Web 壳层、质量检查、测试、真实 Lithograph smoke、构建和本地包验证已经在 macOS arm64 完成本地验收。GitHub Actions workflow 已建立，但远端 Linux job 尚未运行，因此 Phase 00 不能标记为 `done`。

KG OS 业务能力仍未实现。Knowledge Base bootstrap、认证、正式 daemon lifecycle、SQLite / Lithograph adapter、Ontology / Object / Graph / Evolution、正式 CLI / SDK / Web 交互继续以设计文档为行为真源。

## 5. 路线总览

| Phase | 状态 | 交付结果 | 主要输入 |
| --- | --- | --- | --- |
| [00 Engineering Foundation](phases/00-engineering-foundation.md) | `in_progress` | 固定 TypeScript 工具链、workspace、统一开发宿主、质量门禁、测试、CI workflow 与本地交付物 | [D63](../design/decisions.md#d63-typescript-integrated-web)、[D64](../design/decisions.md#d64-phase0-development-environment) |

后续业务阶段尚未冻结为独立 Phase。当前设计能够确定的实现依赖顺序是：

```text
runtime / KG_HOME / extension loading / Lithograph adapter
  -> Ontology and Object projection/read
  -> atomic Object Patch and compiler
  -> Graph query/execute and managed search integration
  -> Evolution and Merge
  -> complete CLI / SDK / Web surfaces and release closure
```

这条顺序只导航现有[工程映射](../design/implementation.md)，不是已经进入 `ready` 的 Phase 列表。开始下一阶段前，应从对应 Design Inputs 建立独立 Phase 文件，明确范围、Feature、Acceptance 和 Review；不提前为尚未开工的阶段制造空计划。

## 6. Phase 通用完成标准

每个 Phase 的具体 Acceptance 由对应文件维护。所有 Phase 共同要求：

1. Scope 内能力真实实现，不用 mock、空入口或示例结果代替核心行为。
2. Targeted tests、必要集成测试和阶段级验收全部通过。
3. 成功路径以及会改变 correctness、security、transaction、storage 或 recovery 的失败路径均有验证。
4. Phase review 完成，范围内 finding 已关闭；没有 unrelated refactor、临时样本、secret 或 generated junk。
5. 设计、开发计划、开发指南、README 和 vlog 按各自职责同步。
6. `git diff --check`、Markdown、本地链接和仓库要求的完整质量门禁通过。
7. Phase 文件要求的远端 CI / matrix 有实际成功结果；仅有 workflow 配置时保持 `in_progress`。

Commit、push、发布和部署是独立动作。只有实际执行并取得证据后，才能记录对应状态。

## 7. Development Artifacts

- [Phase 00：Engineering Foundation](phases/00-engineering-foundation.md)
- [开发指南](../guide/development.md)
- [设计到实现的工程映射](../design/implementation.md)
