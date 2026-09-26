import { KGOS_VERSION } from "@kgos/sdk";

type HelpEntry = readonly [path: string, usage: string, english: string, chinese: string];

// One list owns both locales and the command topology. Help runs before root,
// config, credentials, and Runtime are accessed.
const entries: readonly HelpEntry[] = [
  [
    "doctor",
    "doctor [--json [--pretty]]",
    "Inspect an Instance without starting it",
    "只读检查 Instance，不启动服务"
  ],
  [
    "init",
    "init [--pretty] [--cache-path <path>] [--cache-max-size-mb <n>] [--fulltext-analyzer <fts5-spec>] [--embedding-base-url <url>] [--embedding-model <id>] [--embedding-dimensions <1..4096>] [--embedding-similarity <cosine|euclidean>] [--embedding-api-key-env <name-or-empty>]",
    "Initialize an Instance",
    "初始化 Instance"
  ],
  [
    "ontology",
    "ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>] [--edit]",
    "Read Ontology Markdown or canonical edit YAML",
    "读取 Ontology Markdown 或可编辑 YAML"
  ],
  [
    "ontology patch",
    "ontology patch --base-state <commit/...> --branch <name> (--patch <text> | --patch-file <path> | stdin) [--author <text>] [--message <text>] [--pretty]",
    "Apply an Ontology Patch",
    "提交 Ontology Patch"
  ],
  ["object", "object <read|patch> ...", "Read or patch Objects", "读取或修改 Object"],
  [
    "object read",
    "object read (<ObjectRef>... | --refs-file <path> | stdin) --at <StateRef> [--body [--format yaml|json]] [--pretty]",
    "Read one to 100 Object refs",
    "读取 1 到 100 个 Object Ref"
  ],
  [
    "object patch",
    "object patch --base-state <commit/...> --branch <name> (--patch <text> | --patch-file <path> | stdin) [--author <text>] [--message <text>] [--pretty]",
    "Apply a batch Object Patch",
    "提交批量 Object Patch"
  ],
  ["graph", "graph <query|execute> ...", "Run Lithograph Cypher", "执行 Lithograph Cypher"],
  [
    "graph query",
    "graph query --at <StateRef> (--cypher <text> | --cypher-file <path> | stdin) [--params <json-map> | --params-file <path>] [--stream] [--pretty]",
    "Query a pinned State",
    "查询固定 State"
  ],
  [
    "graph execute",
    "graph execute --branch <name> (--cypher <text> | --cypher-file <path> | stdin) [--params <json-map> | --params-file <path>] [--author <text>] [--message <text>] [--stream] [--pretty]",
    "Execute Cypher on a Branch",
    "在 Branch 上执行 Cypher"
  ],
  [
    "evolution",
    "evolution <command> ...",
    "Inspect and change versioned graph state",
    "查看和修改版本化图状态"
  ],
  ["evolution overview", "evolution overview [--pretty]", "Read current overview", "读取当前概览"],
  ["evolution get", "evolution get <StateRef> [--pretty]", "Get a State", "读取 State"],
  [
    "evolution ancestry",
    "evolution ancestry <StateRef> [--limit <n>] [--cursor <token>] [--pretty]",
    "Read State ancestry",
    "读取 State 祖先链"
  ],
  [
    "evolution history",
    "evolution history <StateRef> --scope <all|ontology|knowledge|object> [--object-ref <ref> --anchor-state <StateRef>] [--limit <n>] [--cursor <token>] [--pretty]",
    "Read scoped history",
    "读取指定范围的历史"
  ],
  [
    "evolution diff",
    "evolution diff --before <StateRef> --after <StateRef> --scope <all|ontology|knowledge|object> [--object-ref <ref> --anchor-state <StateRef>] [--limit <n>] [--cursor <token>] [--pretty]",
    "Compare two States",
    "比较两个 State"
  ],
  [
    "evolution state",
    "evolution state <create|set-data|clear-data> ...",
    "Manage State data",
    "管理 State Data"
  ],
  [
    "evolution state create",
    "evolution state create --branch <name> [--data <json> | --data-file <path>] [--author <text>] [--message <text>] [--pretty]",
    "Create a State",
    "创建 State"
  ],
  [
    "evolution state set-data",
    "evolution state set-data <StateRef> (--data <json> | --data-file <path> | stdin) [--pretty]",
    "Set State data",
    "设置 State Data"
  ],
  [
    "evolution state clear-data",
    "evolution state clear-data <StateRef> [--pretty]",
    "Clear State data",
    "清除 State Data"
  ],
  [
    "evolution branch",
    "evolution branch <list|create|delete> ...",
    "Manage Branch refs",
    "管理 Branch Ref"
  ],
  ["evolution branch list", "evolution branch list [--pretty]", "List Branches", "列出 Branch"],
  [
    "evolution branch create",
    "evolution branch create <name> --from <StateRef> [--pretty]",
    "Create a Branch",
    "创建 Branch"
  ],
  [
    "evolution branch delete",
    "evolution branch delete <name> [--pretty]",
    "Delete a Branch",
    "删除 Branch"
  ],
  [
    "evolution tag",
    "evolution tag <list|create|move|delete> ...",
    "Manage Tag refs",
    "管理 Tag Ref"
  ],
  ["evolution tag list", "evolution tag list [--pretty]", "List Tags", "列出 Tag"],
  [
    "evolution tag create",
    "evolution tag create <name> --target <StateRef> [--pretty]",
    "Create a Tag",
    "创建 Tag"
  ],
  [
    "evolution tag move",
    "evolution tag move <name> --target <StateRef> [--pretty]",
    "Move a Tag",
    "移动 Tag"
  ],
  ["evolution tag delete", "evolution tag delete <name> [--pretty]", "Delete a Tag", "删除 Tag"],
  [
    "evolution merge",
    "evolution merge <start|list|get|conflicts|resolve|finalize|abort> ...",
    "Manage Merge Sessions",
    "管理 Merge Session"
  ],
  [
    "evolution merge start",
    "evolution merge start --branch <name> --source <StateRef> [--pretty]",
    "Start a Merge Session",
    "开始 Merge Session"
  ],
  [
    "evolution merge list",
    "evolution merge list [--limit <n>] [--cursor <token>] [--pretty]",
    "List Merge Sessions",
    "列出 Merge Session"
  ],
  [
    "evolution merge get",
    "evolution merge get <session> [--pretty]",
    "Get a Merge Session",
    "读取 Merge Session"
  ],
  [
    "evolution merge conflicts",
    "evolution merge conflicts <session> [--limit <n>] [--cursor <token>] [--pretty]",
    "Read Merge conflicts",
    "读取 Merge 冲突"
  ],
  [
    "evolution merge resolve",
    "evolution merge resolve <session> --expected-revision <n> (--resolutions <json-array> | --resolutions-file <path> | stdin) [--pretty]",
    "Resolve Merge conflicts",
    "解决 Merge 冲突"
  ],
  [
    "evolution merge finalize",
    "evolution merge finalize <session> --expected-revision <n> [--author <text>] [--message <text>] [--pretty]",
    "Finalize a Merge Session",
    "完成 Merge Session"
  ],
  [
    "evolution merge abort",
    "evolution merge abort <session> --expected-revision <n> [--pretty]",
    "Abort a Merge Session",
    "中止 Merge Session"
  ]
];

const byPath = new Map(entries.map((entry) => [entry[0], entry]));

export function rootHelp(): string {
  const zh = chineseHelp();
  return `${zh ? "KG OS 命令行客户端" : "KG OS command-line client"}

${zh ? "用法" : "Usage"}:
  kg --root <instance-root> <command> ...
  kg --help
  kg --version

${childrenHelp("", zh)}
${zh ? "全局选项" : "Global"}:
  --root <path>   ${zh ? "显式 Instance Root" : "Explicit KG OS Instance Root"}
  -h, --help      ${zh ? "显示帮助，不访问 Instance" : "Show help without accessing an Instance"}
  -V, --version   ${zh ? "显示版本" : "Show version"}
`;
}

export function versionText(): string {
  return KGOS_VERSION + "\n";
}

export function commandHelp(args: readonly string[]): string {
  const path: string[] = [];
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") continue;
    if (arg.startsWith("-")) break;
    const candidate = [...path, arg].join(" ");
    if (!byPath.has(candidate)) break;
    path.push(arg);
  }
  const key = path.join(" ");
  const entry = byPath.get(key);
  if (entry === undefined) return rootHelp();
  const zh = chineseHelp();
  const children = childrenHelp(key, zh);
  const notes = helpNotes(key, entry[1], zh);
  return `${zh ? "用法" : "Usage"}:\n  kg --root <instance-root> ${entry[1]}\n\n${zh ? entry[3] : entry[2]}\n${children === "" ? "" : `\n${children}`}${notes}`;
}

function helpNotes(key: string, usage: string, zh: boolean): string {
  const notes: string[] = [];
  if (usage.includes(" | ")) {
    notes.push(
      zh ? "输入约束：竖线分隔的选项互斥。" : "Inputs separated by | are mutually exclusive."
    );
  }
  if (key.startsWith("graph ")) {
    notes.push(
      zh ? "--stream 与 --pretty 互斥。" : "--stream and --pretty are mutually exclusive."
    );
  }
  if (key === "object read") {
    notes.push(
      zh ? "YAML body 输出不支持 --pretty。" : "YAML body output does not support --pretty."
    );
  }
  return notes.length === 0 ? "" : "\n" + notes.join("\n") + "\n";
}

function childrenHelp(parent: string, zh: boolean): string {
  const depth = parent === "" ? 1 : parent.split(" ").length + 1;
  const children = entries.filter(([path]) => {
    const words = path.split(" ");
    return words.length === depth && (parent === "" || path.startsWith(parent + " "));
  });
  if (children.length === 0) return "";
  return `${zh ? "命令" : "Commands"}:\n${children.map(([path, , en, cn]) => `  ${(path.split(" ").at(-1) ?? "").padEnd(12)}${zh ? cn : en}\n`).join("")}`;
}

function chineseHelp(): boolean {
  for (const name of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const value = process.env[name]?.trim();
    if (value !== undefined && value !== "") return /^zh(?:_|-|\b)/iu.test(value);
  }
  return false;
}
