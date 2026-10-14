import type { en } from "./en.js";

type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : TranslationShape<T[Key]>;
};

export const zhCN = {
  meta: { title: "KG OS", description: "KG OS 知识图谱工作区" },
  language: { label: "界面语言", english: "English", chinese: "简体中文" },
  auth: {
    restoring: "正在恢复 KG OS 登录状态...",
    logoutFailed: "未能退出登录，请重试。",
    brandDescription: "知识图谱操作系统",
    title: "需要身份认证",
    descriptionFirst: "请输入访问令牌以连接当前 KG OS 实例。",
    descriptionSecond: "所有数据均受保护，访问前必须完成认证。",
    accessToken: "访问令牌",
    placeholder: "在这里粘贴访问令牌…",
    showToken: "显示访问令牌",
    hideToken: "隐藏访问令牌",
    tokenNote: "令牌仅保存在当前页面内存中，不会写入磁盘。",
    connect: "连接",
    connecting: "正在连接…",
    helpTitle: "需要帮助？",
    helpDescription: "可以在以下位置找到访问令牌：",
    viewDocs: "查看文档",
    footer: "同一份数据，更深层的理解。",
    error: {
      required: "请输入访问令牌后再继续。",
      invalid: "访问令牌无效，请检查后重试。",
      transport: "无法连接 KG OS 实例，请重试。",
      unknown: "无法连接 KG OS，请重试。"
    },
    loss: {
      changed: "KG OS 服务已发生变化，请重新连接以确保安全。",
      expired: "访问令牌已失效，请重新连接。",
      offline: "KG OS 服务当前离线，请在服务恢复后重新连接。"
    }
  },
  versions: {
    navigation: "版本导航",
    mobileNavigation: "移动端版本导航",
    closeNavigation: "关闭版本导航",
    expandSidebar: "展开侧栏",
    collapseSidebar: "收起侧栏",
    collapseHint: "点击收起 · 拖动或使用方向键调整宽度",
    example: "设计示例 · 未连接数据",
    history: "示例提交历史",
    tree: "版本树（静态示例）",
    branches: "分支",
    ahead: "领先 {{count}} 个提交",
    behind: "落后 {{count}} 个提交",
    disconnect: "断开连接",
    appearance: "外观主题",
    light: "浅色主题",
    dark: "深色主题"
  },
  workspace: {
    label: "可视化工作区",
    canvas: "图谱画布",
    pendingTools: "画布工具（待实现）",
    pendingAction: "{{name}}（待实现）",
    select: "选择工具",
    layout: "图谱布局",
    fit: "适配画布",
    minimap: "画布概览",
    zoom: "缩放（待实现）",
    pendingCanvas: "画布内容待实现"
  },
  mcp: {
    title: "授权连接",
    description: "ChatGPT 希望连接到您的 KG OS 实例。",
    cancelConnection: "取消连接",
    externalAssistant: "外部 AI 助手",
    yourGraph: "您的知识图谱",
    loading: "正在加载连接请求…",
    permissionsTitle: "此应用将可以：",
    readName: "读取知识",
    readDescription: "访问节点、关系和图谱数据",
    writeName: "修改知识",
    writeDescription: "创建、更新和删除图谱数据",
    branchesName: "管理分支",
    branchesDescription: "创建、更改和删除分支",
    executeName: "执行操作",
    executeDescription: "运行查询和知识图谱操作",
    requested: "请求授权",
    writeNotice: "此连接包含写入权限。",
    trustNotice: "仅授权您信任的应用。您的实例凭证不会被共享。",
    cancel: "取消",
    authorize: "授权连接",
    authorizing: "正在授权…",
    footnote: "继续即表示您信任 ChatGPT 访问此 KG OS 实例。",
    error: {
      unavailable: "此连接请求不可用，请从 ChatGPT 重新发起。",
      failed: "无法完成授权，请从 ChatGPT 重新发起。"
    }
  }
} satisfies TranslationShape<typeof en>;
