// Product-site copy only. KG OS's runtime, Ontology and database contracts are
// defined in the private design sources, not in this public presentation layer.
export const copy = {
  zh: {
    htmlLang: "zh-CN",
    seo: {
      title: "KG OS — 让 AI 不止检索知识，更能操作知识",
      description:
        "KG OS 是面向 AI 的可编程知识图基础设施。自定义模型，以图连接知识，通过 MCP 查询、修改并追踪知识演化。"
    },
    nav: ["产品介绍", "工作方式", "核心能力", "架构", "AI 安装"],
    github: "GitHub",
    theme: {
      label: "外观主题",
      system: "跟随系统",
      light: "浅色",
      dark: "深色"
    },
    language: "网站语言",
    skip: "跳转到主要内容",
    hero: {
      eyebrow: "面向 AI 的可编程知识图基础设施",
      title1: "让 AI 不止检索知识，",
      title2: "更能操作知识。",
      description:
        "定义自己的知识模型，让图连接数据与关系。通过 KG OS，AI 可以查询、修改和追踪知识的变化，而不只是获得一段相关文本。",
      primary: "通过 AI Agent 安装",
      secondary: "了解它如何工作",
      properties: ["图结构", "自定义模型", "MCP + Skills", "版本历史"]
    },
    demo: {
      label: "产品体验 / 01",
      question: "一项技术决策，会影响哪些模块？依据是什么？",
      illustrative: "示例界面 · 非真实数据",
      workspace: "知识工作区",
      version: "版本历史",
      branches: "所有分支",
      search: "搜索提交…",
      commits: ["调整存储方案", "关联设计依据", "初始化项目模型"],
      title: "项目知识图谱",
      tabs: ["图谱", "本体", "查询"],
      nodeNames: ["存储模块", "查询引擎", "采用版本化存储", "技术评估报告", "架构设计文档"],
      inspector: "当前节点 / 技术决策",
      affected: "影响模块",
      evidence: "关联证据",
      branch: "当前分支",
      caption: "演示数据与界面示意，用于解释产品工作方式；不代表实际运行截图。"
    },
    why: {
      label: "01 / WHY KG OS",
      heading: "搜索可以找到信息。\n但知识不只有内容。",
      aside: "AI 不仅需要知道某件事，还需要理解它与其他事物的关系、所在的知识状态以及如何修改。",
      cards: [
        {
          heading: "找到相关文本",
          description: "检索返回相关内容，但关系、约束和版本上下文不一定具有明确的结构表达。"
        },
        {
          heading: "操作结构化知识",
          description: "用显式模型和关系连接数据，让 AI 能够查询影响、检查依据并进行受控修改。"
        }
      ],
      graphLabels: ["技术决策", "影响模块", "支持证据"]
    },
    how: {
      label: "02 / HOW IT WORKS",
      heading: "从信息，到可操作的知识。",
      description: "以技术项目为例，模型由你定义，操作通过真实的知识图与版本状态进行。",
      steps: [
        {
          code: "DEFINE",
          title: "定义模型",
          body: "按照实际领域定义节点、关系与约束，不受固定业务模板限制。"
        },
        {
          code: "CONNECT",
          title: "连接知识",
          body: "以图数据保存真实对象和关系，让知识结构清晰、可查询。"
        },
        {
          code: "OPERATE",
          title: "让 AI 操作",
          body: "Agent 通过 MCP 查询数据，并在授权下提交知识修改。"
        },
        {
          code: "EVOLVE",
          title: "保留历史",
          body: "使用 Commit、Branch、Diff 与 Merge 管理知识的变化。"
        }
      ],
      aiLabel: "AI-NATIVE INTERFACE",
      aiTitle: "不需要替换你的 Agent。",
      aiDescription:
        "KG OS 不内置 Agent。现有 AI 工具可以通过 MCP 读取知识模型、查询数据、执行获授权的操作。官方 Skills 提供建模、检索和维护的工作规范。"
    },
    capabilities: {
      label: "03 / CAPABILITIES",
      heading: "一个系统，连接模型、数据与历史。",
      description:
        "KG OS 提供基础能力，不预设业务世界的含义。你可以根据应用需要组织自己的知识系统。",
      cards: [
        {
          code: "ONTOLOGY",
          title: "自由定义知识结构",
          body: "按你的工作定义对象、关系、属性和约束，并为需要查找的内容建立索引。"
        },
        {
          code: "GRAPH & SEARCH",
          title: "从多个维度检索知识",
          body: "结合图遍历、结构化条件、全文与语义检索，访问知识及其关联。"
        },
        {
          code: "EVOLUTION",
          title: "完整追踪知识演化",
          body: "一起保留模型和数据的历史，比较不同版本，并用分支和合并管理变化。"
        },
        {
          code: "AI & WEB",
          title: "AI 操作，人类掌控",
          body: "用 MCP 连接你的 Agent，通过 Web 初始化实例并确认连接授权。"
        }
      ]
    },
    architecture: {
      label: "04 / ARCHITECTURE",
      heading: "每一层，都有清晰的职责。",
      description: "KG OS 专注于知识基础设施。Agent 与数据库引擎保持独立，各自完成擅长的工作。",
      layers: [
        { eyebrow: "INTELLIGENCE", title: "Agent / Skill", detail: "理解、推理与决策" },
        { eyebrow: "KNOWLEDGE", title: "KG OS", detail: "Model · MCP · Web" },
        { eyebrow: "GRAPH ENGINE", title: "Lithograph", detail: "Graph · Search · Versioning" },
        { eyebrow: "STORAGE", title: "SQLite", detail: "嵌入式数据存储" }
      ],
      note: "保留你熟悉的 Agent，由同一个 KG OS 实例提供 MCP 和 Web 入口，图数据库负责保存与查询知识。"
    },
    final: {
      label: "05 / INSTALL WITH AI",
      heading: "你选方案，AI 协助安装。",
      description:
        "将下面的提示词发送给 ChatGPT。它会先阅读手册，只读检查环境并给出方案；由你选择和明确授权后，再按分工执行并逐项验证。",
      promptLabel: "给 AI Agent 的提示词",
      promptBeforeUrl: "请按照这份官方安装手册帮我安装 KG OS：",
      promptAfterUrl:
        "先阅读手册，检查已有环境和实际发布的可用版本，再完成获授权的安装与验证。复用有效连接，保留现有数据。需要我登录或授权时，告诉我具体操作；不要让我把凭证粘贴到对话中。",
      copy: "复制安装提示词",
      copied: "已复制",
      copySuccess: "已复制。将提示词粘贴到你的 AI Agent 对话中即可。",
      copyFailed: "复制未成功，请选中上方提示词并手动复制。",
      note: "新部署需要 Linux amd64 Docker 环境；有效实例与连接先验证后复用。AI 无法操作的步骤可由你按指引完成；缺少功能或权限时会说明阻塞，保留已完成结果。"
    },
    footer: "面向 AI 的可编程知识图基础设施"
  },
  en: {
    htmlLang: "en",
    seo: {
      title: "KG OS — Beyond retrieval. Make knowledge operable.",
      description:
        "Programmable knowledge graph infrastructure for AI. Define custom models, connect knowledge, and let agents query, update, and evolve it through MCP."
    },
    nav: ["Overview", "How it works", "Capabilities", "Architecture", "Install with AI"],
    github: "GitHub",
    theme: {
      label: "Appearance",
      system: "System",
      light: "Light",
      dark: "Dark"
    },
    language: "Site language",
    skip: "Skip to main content",
    hero: {
      eyebrow: "PROGRAMMABLE KNOWLEDGE GRAPH INFRASTRUCTURE FOR AI",
      title1: "Beyond retrieval.",
      title2: "Make knowledge operable.",
      description:
        "Define your own knowledge models. Connect data through relationships. Give AI a structured system it can query, update, and evolve—not just retrieve relevant text from.",
      primary: "Install with AI Agent",
      secondary: "See how it works",
      properties: ["Graph-first", "Custom Models", "MCP + Skills", "Versioned Knowledge"]
    },
    demo: {
      label: "PRODUCT EXPERIENCE / 01",
      question: "Which components does this decision affect? What supports it?",
      illustrative: "Illustrative UI · Example data",
      workspace: "Knowledge workspace",
      version: "Version history",
      branches: "All branches",
      search: "Search commits…",
      commits: ["Revise storage strategy", "Link design evidence", "Initialize project models"],
      title: "Project knowledge graph",
      tabs: ["Graph", "Ontology", "Query"],
      nodeNames: [
        "Storage module",
        "Query engine",
        "Versioned storage",
        "Technical evaluation",
        "Architecture design"
      ],
      inspector: "Selected / Decision",
      affected: "Affected modules",
      evidence: "Evidence links",
      branch: "Current branch",
      caption: "Illustrative data and UI concept. Not a screenshot from a running KG OS instance."
    },
    why: {
      label: "01 / WHY KG OS",
      heading: "Search finds information.\nKnowledge is more than content.",
      aside:
        "AI needs to understand not only what something says, but how it relates to other things, which state it belongs to, and how it can change.",
      cards: [
        {
          heading: "Retrieve relevant text",
          description:
            "Retrieval finds content, but structure, constraints, and version context may remain implicit."
        },
        {
          heading: "Operate structured knowledge",
          description:
            "Explicit models and relationships let AI query dependencies, inspect evidence, and make authorized changes."
        }
      ],
      graphLabels: ["Decision", "Affected module", "Evidence"]
    },
    how: {
      label: "02 / HOW IT WORKS",
      heading: "From information to operable knowledge.",
      description:
        "A software project is one example. You define the model. Operations work against graph data and explicit version states.",
      steps: [
        {
          code: "DEFINE",
          title: "Define models",
          body: "Define nodes, relationships, and constraints for your domain instead of adapting to a fixed schema."
        },
        {
          code: "CONNECT",
          title: "Connect knowledge",
          body: "Store real entities and relationships as queryable graph data."
        },
        {
          code: "OPERATE",
          title: "Let AI operate",
          body: "Agents use MCP to query data and submit changes with authorization."
        },
        {
          code: "EVOLVE",
          title: "Keep the history",
          body: "Manage knowledge changes with commits, branches, diffs, and merges."
        }
      ],
      aiLabel: "AI-NATIVE INTERFACE",
      aiTitle: "Keep your existing agents.",
      aiDescription:
        "KG OS has no built-in agent. Your AI tools can use MCP to inspect models, query data, and perform authorized operations. Official Skills guide modeling, retrieval, and maintenance workflows."
    },
    capabilities: {
      label: "03 / CAPABILITIES",
      heading: "Models, data, and history. In one system.",
      description:
        "KG OS provides foundational capabilities without prescribing what your domain means. Build the knowledge system your application needs.",
      cards: [
        {
          code: "ONTOLOGY",
          title: "Define your own structures",
          body: "Define entities, relationships, properties, and constraints for your work, with indexes for the information you need to find."
        },
        {
          code: "GRAPH & SEARCH",
          title: "Query knowledge from every angle",
          body: "Combine graph traversal, structured queries, full-text search, and semantic retrieval."
        },
        {
          code: "EVOLUTION",
          title: "Track how knowledge evolves",
          body: "Keep models and data in the same history, compare versions, and manage changes with branches and merges."
        },
        {
          code: "AI & WEB",
          title: "AI operates. You stay in control.",
          body: "Connect your Agent through MCP. Use the Web interface to set up your instance and approve connections."
        }
      ]
    },
    architecture: {
      label: "04 / ARCHITECTURE",
      heading: "Clear responsibilities at every layer.",
      description:
        "KG OS focuses on knowledge infrastructure, while agents and the independent graph database engine own their separate responsibilities.",
      layers: [
        { eyebrow: "INTELLIGENCE", title: "Agent / Skill", detail: "Reasoning and decisions" },
        { eyebrow: "KNOWLEDGE", title: "KG OS", detail: "Model · MCP · Web" },
        { eyebrow: "GRAPH ENGINE", title: "Lithograph", detail: "Graph · Search · Versioning" },
        { eyebrow: "STORAGE", title: "SQLite", detail: "Embedded storage" }
      ],
      note: "Keep the Agent you already use. One KG OS instance provides MCP and Web access, with a graph database to store and query knowledge."
    },
    final: {
      label: "05 / INSTALL WITH AI",
      heading: "You choose the plan. AI helps you install.",
      description:
        "Send the prompt below to ChatGPT. It reads the guide, checks your setup without changing it, and proposes a plan. After you choose and explicitly authorize the plan, it helps carry out each step and verifies the results.",
      promptLabel: "Prompt for your AI Agent",
      promptBeforeUrl: "Help me install KG OS using its official installation guide:",
      promptAfterUrl:
        "Read the guide first, check my existing setup and available published releases, then complete and verify the authorized installation steps. Reuse working connections and preserve existing data. Tell me which login or approval actions require my participation. Do not ask me to paste credentials into the conversation.",
      copy: "Copy installation prompt",
      copied: "Copied",
      copySuccess: "Copied. Paste the prompt into your AI Agent to begin.",
      copyFailed: "Automatic copy failed. Select the prompt above and copy it manually.",
      note: "New deployments need Linux amd64 with Docker. Working instances and connections are checked and reused. You can follow instructions for steps the AI cannot perform; missing features or permissions are reported while completed work is preserved."
    },
    footer: "Programmable knowledge graph infrastructure for AI"
  }
} as const;

export type Locale = keyof typeof copy;
