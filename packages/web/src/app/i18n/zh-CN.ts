import type { en } from "./en.js";

type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : TranslationShape<T[Key]>;
};

export const zhCN = {
  ui: { closeNotification: "关闭通知", notifications: "通知" },
  meta: { title: "KG OS", description: "KG OS 知识图谱工作区" },
  language: {
    label: "界面语言",
    system: "跟随系统语言",
    auto: "自动",
    english: "English",
    chinese: "简体中文"
  },
  setup: {
    landmark: "KG OS 初始化",
    loading: "正在检查实例初始化状态...",
    statusFailed: "无法读取 KG OS 初始化状态。",
    unavailableTitle: "实例需要处理",
    unavailableDescription: "无法安全地继续初始化。",
    unavailableHelp: "请检查实例配置和服务日志，保留现有数据，修复问题后重新启动 KG OS。",
    retry: "重试",
    stepNavigation: "初始化步骤",
    setupLabel: "初始化设置",
    progress: "第 {{current}} 步，共 {{total}} 步",
    stages: {
      welcome: "欢迎使用 KG OS",
      publicOrigin: "配置对外访问地址",
      vector: "配置向量服务",
      auth: "保护您的 KG OS 实例",
      initialize: "初始化知识库"
    },
    description: {
      publicOrigin:
        "对外访问地址是 KG OS 的统一服务入口。Web、API 和 MCP 共用这个根地址，ChatGPT 也通过它连接实例并完成授权。",
      welcome: "为 AI 准备一个属于你的知识世界。只需几个简单步骤，就能开始使用。",
      vector: "连接向量服务，让 KG OS 能够根据内容的含义查找知识。",
      auth: "管理员访问令牌相当于当前 KG OS 实例的主钥匙。您可以用它登录 Web 管理界面，并授权受保护的 API 和客户端操作知识与配置。持有令牌的人可能拥有实例管理权限，请像保管密码一样妥善保管，切勿公开分享。",
      initialize: "确认配置，完成知识库初始化，随后就可以使用了。"
    },
    vector: {
      tagline: "让知识不仅能够被连接，也能够被发现",
      intro:
        "知识图谱让对象与关系拥有清晰的结构，但需要查找内容时，你未必记得准确的名称或关键词。语义检索从文本的含义出发，帮助你发现表达不同却彼此相关的知识。",
      context:
        "KG OS 通过 Embedding 服务将文本转换为向量。你可以使用下方的默认配置，也可以连接自己的服务和模型。",
      connectionTitle: "服务连接",
      connectionDescription:
        "KG OS 将通过这个接口生成文本向量。填写 API 地址；如需身份认证，再提供 API Key。",
      modelTitle: "模型配置",
      modelDescription:
        "Embedding 模型决定文本如何转换为向量。向量维度必须与模型输出一致，相似度算法决定如何比较它们。",
      modelLabel: "模型 ID",
      similarityLabel: "相似度",
      keyOptional: "（选填）",
      noKey: "无认证",
      validationTitle: "验证向量服务",
      validationDescription:
        "完成配置后，KG OS 会用当前参数发起一次真实的 Embedding 请求，检查服务是否可访问、模型是否可用，以及返回的向量维度。通过后才可继续；如未通过，可以调整参数后重新测试。",
      test: "验证配置",
      testing: "验证中…",
      validationStates: {
        idle: "尚未验证",
        testing: "正在验证向量服务…",
        success: "验证成功 · 模型输出 {{dimensions}} 维",
        failed: "验证失败"
      },
      testNetworkError: "无法完成连接验证，请检查服务器连接。",
      testErrors: {
        setup_unavailable: "实例已不再接受向量验证，请刷新页面检查当前初始化状态。",
        invalid_fields: "请检查 URL、模型和向量维度。",
        address_not_allowed: "无法验证本机回环地址或特殊保留地址，请检查 API 地址。",
        timeout: "向量服务响应超时，请稍后重试。",
        connection_failed: "无法连接到向量服务，请检查 API 地址和网络。",
        redirect_not_allowed: "向量服务返回了重定向，请填写最终 API 地址。",
        authentication_failed: "API Key 无效或缺失（HTTP {{status}}）。",
        endpoint_or_model_not_found: "API 地址或模型不存在（HTTP {{status}}）。",
        rate_limited: "向量服务请求过于频繁（HTTP {{status}}）。",
        provider_error: "向量服务拒绝了请求（HTTP {{status}}）。",
        provider_unavailable: "向量服务暂不可用（HTTP {{status}}）。",
        invalid_response: "向量服务没有返回合法的数值向量。",
        dimensions_mismatch: "模型实际返回 {{dimensions}} 维，与填写值不一致。",
        busy: "已有验证正在进行，请稍后重试。",
        unknown: "验证失败，请检查配置并重试。"
      }
    },
    publicOrigin: {
      tagline: "为 ChatGPT 和其他客户端配置统一入口",
      context:
        "系统已根据浏览器当前地址预填。若您使用域名或反向代理，请改为外部客户端实际能够访问的 HTTPS 地址。",
      connectionTitle: "服务地址",
      connectionDescription:
        "填写实例的服务根地址，KG OS 将自动生成 MCP 连接地址及 OAuth 授权地址。",
      label: "对外访问地址",
      hint: "例如 https://kgos.example.com，不包含 /mcp 或其他路径。",
      invalid: "请输入不带路径的有效 HTTPS 地址。仅本机开发允许使用 HTTP 回环地址。",
      mcpLabel: "MCP 连接地址（自动生成）",
      localWarning:
        "当前为本机地址，仅适用于本地开发。ChatGPT 云端无法通过此地址连接，请在正式接入前配置可公开访问的 HTTPS 域名。",
      help: "请确认 HTTPS 域名与反向代理已正确配置，并且外部客户端能够实际访问。填写地址不会自动创建公网入口。"
    },
    welcome: {
      tagline: "为 AI 构建可持续演进的知识世界",
      intro:
        "KG OS 是面向 AI 的可编程知识图基础设施。你可以自由定义知识模型，将对象、属性与关系组织成知识图谱，并通过图查询、全文检索和向量检索访问知识。",
      evolution:
        "每一次变更都可以进入版本历史。AI 通过统一接口使用和维护知识，而你可以在 Web 中查看、管理与修正。",
      featuresTitle: "KG OS 能为你做什么",
      features: {
        structure: {
          title: "自由定义知识结构",
          description: "通过 Ontology 自定义对象、关系、属性与约束，不受预设领域模型限制。"
        },
        discovery: {
          title: "连接、查询与发现知识",
          description: "结合图查询、全文检索与向量检索，发现知识之间的关联。"
        },
        evolution: {
          title: "让知识持续演进",
          description: "借助 Commit、Branch 与 Diff 保留历史、比较差异和追溯变化。"
        },
        ai: {
          title: "为 AI 而设计，由人掌控",
          description: "AI 通过 CLI、Skill 和 MCP 使用知识，人通过 Web 管理和纠正。"
        }
      },
      nextTitle: "接下来，只需完成四个步骤"
    },
    url: "API 地址",
    key: "API Key",
    keyPlaceholder: "请输入向量服务 API Key",
    showKey: "显示密钥",
    hideKey: "隐藏密钥",
    model: "Embedding 模型",
    dimensions: "向量维度",
    similarity: "相似度算法",
    cosine: "余弦相似度",
    euclidean: "欧氏距离",
    analyzer: "全文分词",
    cacheSize: "向量缓存",
    keyProvided: "已配置 API Key",
    credentialMode: "API 凭证",
    authTagline: "为知识库建立安全的管理员访问入口",
    authIntroductionSecond:
      "KG OS 会自动生成高强度随机令牌，无需另设账号或密码。每次生成后立即生效，Web 仅在创建时展示完整令牌；刷新或离开此步骤后，您仍可从实例目录 .kgos/auth.json 中找回。重新生成将使旧令牌及其登录会话失效，其他客户端需要更新凭证才能继续连接。",
    authGenerateDescription:
      "完成初始化前，可直接重新生成访问令牌，无需输入旧令牌。生成后，当前浏览器将自动尝试连接。请复制新令牌并妥善保存，再继续初始化知识库。",
    authCreatedTitle: "访问令牌已创建",
    authTokenCreated: "实例访问令牌",
    generateToken: "生成访问令牌",
    regenerateToken: "重新生成访问令牌",
    signIn: "完成认证",
    authReady: "实例访问认证已完成。当前浏览器已建立认证会话，可以继续初始化知识库。",
    saveToken: "请立即复制并妥善保存。离开此步骤后，Web 不会再次展示该令牌。",
    authLoginRetry: "访问令牌已创建，但当前浏览器尚未完成认证。请使用该令牌重新尝试。",
    copyToken: "复制令牌",
    copySuccess: "已复制访问令牌，请保存到安全的位置。",
    copyFailed: "复制失败，请手动选择并复制令牌。",
    authRequired: "请先完成实例访问认证。",
    vectorInvalid: "请检查 API 地址、模型、维度和 API Key。",
    actionFailed: "操作失败，请重试。",
    previewAction: "预览模式下无法执行此操作。",
    initializing: "正在准备知识库",
    resumeHint: "如初始化中断，可使用原配置和实例令牌重新尝试。",
    phases: {
      configuration: "检查配置",
      extensions: "准备扩展",
      authentication: "访问认证",
      database: "数据库",
      readiness: "检查就绪"
    },
    back: "上一步",
    start: "开始设置",
    next: "下一步",
    initialize: "开始初始化"
  },
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
    history: "提交历史",
    tree: "版本浏览器",
    branches: "分支",
    filterBranches: "筛选分支",
    allBranches: "全部分支",
    selectedBranches: "已选分支",
    selectAll: "全选",
    clearAll: "清空",
    searchCommits: "搜索提交记录…",
    noBranchesSelected: "请选择分支以查看提交记录。",
    noMatchingCommits: "没有匹配的提交记录。",
    noBranches: "当前没有可用分支。",
    unavailable: "连接后查看版本历史。",
    noMessage: "无提交说明",
    loading: "正在加载历史…",
    loadFailed: "版本历史加载失败，请重试。",
    selectFailed: "无法打开此版本，已保留之前的选择。",
    loadMore: "加载更多",
    loadedOnly: "搜索和颜色仅代表已加载的历史。",
    refresh: "刷新版本",
    reachableFrom: "可从以下分支访问：{{names}}",
    merge: "合并",
    disconnect: "断开连接",
    appearance: "外观主题",
    system: "跟随系统主题",
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
  embedded: {
    title: "当前知识版本",
    refresh: "刷新",
    loading: "正在读取 KG OS…",
    unavailable: "无法连接 KG OS，请检查连接后刷新。",
    branch: "默认分支",
    commit: "提交"
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
