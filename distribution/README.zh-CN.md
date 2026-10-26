# KG OS

**让 AI 拥有可以查询、修改和回溯的知识图谱。**

[English](README.md) · 简体中文

KG OS 是面向 AI 的可编程知识图基础设施。你可以按自己的工作定义信息与关系，通过 MCP 连接 AI，并保留知识变化的历史。部署在哪里、采用什么知识模型，由你决定；KG OS 与现有 Agent 协作，而不是替换它。

[产品官网](https://kgos.sites.y2l.top/zh/) · [发布版本](https://github.com/bYiyLi/kg-releases/releases) · [问题反馈](https://github.com/bYiyLi/kg-releases/issues)

## 你可以用它做什么

| 你的目标 | KG OS 提供的帮助 |
| --- | --- |
| 按实际工作组织知识 | 自定义对象、关系、属性和约束，不必套用固定的业务模板。 |
| 找到答案及其上下文 | 结合图查询、全文搜索和语义检索，查看信息及其关联。 |
| 理解知识发生了什么变化 | 模型与数据一起保留历史，通过版本比较、分支和合并管理变化。 |
| 让现有 AI 使用知识 | 连接兼容的 MCP 客户端，由官方 Skills 提供建模、知识创建、检索、版本管理、维护、活动记录和诊断规范。 |

例如，把项目中的一项技术决策，与它影响的模块、支持它的证据连接起来。提出修改前，让 AI 先检查这些关系。

## 安装 KG OS

按照[安装教程](https://kgos.sites.y2l.top/zh/install/)完成：**部署服务 → 初始化 → 公网 HTTPS → 连接 ChatGPT → 安装私人 Plugin → 自检与开始使用**。推荐 **Docker Compose + Web 初始化**，也支持 Docker 命令与配置文件初始化。已有服务和连接可复用；[Markdown 原文](https://kgos.sites.y2l.top/zh/install.md)与网页来自同一份内容。

教程先引导你在 ChatGPT 创建或复用基础 MCP 应用，并验证真实调用，再提供可复制的 AI 安装提示词。使用**所选版本手册提供的 INSTALL.md**（[v0.3.3 AI 指南](https://kgos.sites.y2l.top/install/v0.3.3/INSTALL.md)），引导 AI 读取对应发行资源、识别旧 Plugin 定制，并在你确认方案后新建带版本号的私人 Plugin，协助安装七个官方 Skill、配置 Global AI Guidance v1 并自检。新版验收通过后，由你选择是否卸载旧版；共享应用与 MCP 连接保留。

完整安装包含就绪服务、ChatGPT 应用、私人 Plugin、七个官方 Skill 和全局引导词；只需基础 MCP 的用户可在连接验收通过后开始使用。

### 开始前需要准备什么

已有服务，或一台你选定的 **Linux amd64 Docker 主机**、持久存储、可用的 Embedding 服务及模型。连接 ChatGPT 还需要可信公网 HTTPS 和目标账户/Workspace 的实际功能与权限。主机、模型、费用及授权由你决定；服务安装步骤由你手动执行。

KGHub 为每个发布版本保留完整手册。[最新入口](https://kgos.sites.y2l.top/zh/install/)进入稳定版，可通过版本菜单阅读历史手册，包括 [v0.3.0](https://kgos.sites.y2l.top/zh/install/v0.3.0/)；切换语言保留所选版本。各版手册链接同版 INSTALL.md 和[官方 Plugin 发行包](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.3)，命令固定适用版本与镜像 digest。v0.3.0 官网手册为该发行补齐，原有 Tag 和 ZIP 保持不变；发行资产仍可在[正式发行](https://github.com/bYiyLi/kg-releases/releases)下载。

管理员 Token、API Key 等凭证只在可信终端或实例界面使用，不发送到聊天或公开 Issue。

### 升级已有安装

按[升级与恢复步骤](https://kgos.sites.y2l.top/zh/install/#upgrade)核对版本兼容性，停止服务并完整备份，再沿用原目录和配置替换镜像，重新验证服务及 ChatGPT 调用。服务升级与私人 Plugin 升级分别进行；不重新初始化，也不自动覆盖旧 Plugin。镜像回退不能代替数据恢复。

## 安装后如何开始

可以对 AI 说：“读取我的 KG OS 知识模型和版本概览，说明目前有哪些内容，不要修改数据。”Agent 应验证真实连接，逐项给出结果与证据。你确认范围内的必要检查全部通过才算完成；局部成功、待操作与未知项会分别说明，并保留后续恢复位置。

初始化和连接授权使用**你部署的实例地址**。产品官网只介绍 KG OS，不是你的知识工作区。[官方 Skills](plugins/kgos/skills/)帮助 AI 使用知识；遇到问题时，可以按需运行 `kgos-doctor` 做只读检查。

## 遇到问题

先让 Agent 在不修改数据的前提下诊断。仍无法解决时，通过 [Issue](https://github.com/bYiyLi/kg-releases/issues) 提供 KG OS 版本、客户端、主机平台、失败步骤和脱敏后的错误信息。不要附带凭证、私人连接配置或知识库数据。

## 许可

适用的 AGPL-3.0-only 条款见 [LICENSE](LICENSE)，独立商业协议的说明见[商业许可](COMMERCIAL-LICENSE.md#简体中文)。使用资源时，请保留其中附带的许可声明。
