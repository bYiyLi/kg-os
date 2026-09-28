import { KGOS_VERSION } from "@kgos/sdk";

import { INIT_FIELD_SPECS } from "./init-schema.js";

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
  ["init", initUsage(), "Initialize an Instance", "初始化 Instance"],
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
  kg --root <workspace-root> <command> ...
  KGOS_ROOT=<workspace-root> kg <command> ...
  kg --help
  kg --version

${childrenHelp("", zh)}
${zh ? "全局选项" : "Global"}:
  --root <path>   ${zh ? "Workspace Root；优先级高于 KGOS_ROOT" : "Workspace Root; overrides KGOS_ROOT"}
  -h, --help      ${zh ? "显示帮助，不访问 Instance" : "Show help without accessing an Instance"}
  -V, --version   ${zh ? "显示版本" : "Show version"}

${zh ? "Root 解析" : "Root resolution"}:
  ${zh ? "--root > KGOS_ROOT；不搜索 cwd、父目录或 home。" : "--root > KGOS_ROOT; cwd, parents, and home are never searched."}

${zh ? "示例" : "Examples"}:
  kg --root ./workspace init
  KGOS_ROOT=./workspace kg doctor
  kg ontology --help
`;
}

export function versionText(): string {
  return KGOS_VERSION + "\n";
}

export function commandHelp(args: readonly string[]): string {
  const resolved = resolveHelpEntry(args);
  if (resolved === undefined) return rootHelp();
  const zh = chineseHelp();
  const children = childrenHelp(resolved.key, zh);
  const header = renderCommandHeader(resolved.entry, zh);
  if (children !== "") return header + "\n" + children;
  return (
    header + helpNotes(resolved.key, resolved.entry[1], zh) + renderLeafExamples(resolved.key, zh)
  );
}

function resolveHelpEntry(args: readonly string[]): { key: string; entry: HelpEntry } | undefined {
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
  return entry === undefined ? undefined : { key, entry };
}

function helpNotes(key: string, usage: string, zh: boolean): string {
  const notes = [requiredOptionalNote(zh), ...specializedHelpNotes(key, usage, zh)];
  if (key === "init") notes.push(...initHelpNotes(zh));
  return "\n" + (zh ? "约束" : "Constraints") + ":\n  " + notes.join("\n  ") + "\n";
}

function renderCommandHeader(entry: HelpEntry, zh: boolean): string {
  const heading = zh ? "用法" : "Usage";
  const description = zh ? entry[3] : entry[2];
  return `${heading}:\n  kg --root <workspace-root> ${entry[1]}\n\n${description}\n`;
}

function renderLeafExamples(key: string, zh: boolean): string {
  const examples = leafExamples[key] ?? [];
  if (examples.length === 0) return "";
  const heading = zh ? "示例" : "Examples";
  return `\n${heading}:\n${examples.map((example) => `  ${example}\n`).join("")}`;
}

function requiredOptionalNote(zh: boolean): string {
  return zh
    ? "方括号参数可选；未放在方括号中的参数必填。"
    : "Bracketed arguments are optional; unbracketed arguments are required.";
}

function specializedHelpNotes(key: string, usage: string, zh: boolean): string[] {
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
  if (usage.includes("--limit <n>")) {
    notes.push(zh ? "--limit 必须为 1..1000。" : "--limit must be an integer from 1 to 1000.");
  }
  if (usage.includes("--expected-revision <n>")) {
    notes.push(zh ? "--expected-revision 必须 >= 1。" : "--expected-revision must be >= 1.");
  }
  return notes;
}

function initHelpNotes(zh: boolean): string[] {
  const extensionNote = zh
    ? "--extensions-file 与 --no-additional-extensions 互斥；非交互初始化必须显式选择其中一个。"
    : "--extensions-file and --no-additional-extensions are mutually exclusive; non-interactive init must choose one.";
  return [extensionNote, ...INIT_FIELD_SPECS.map((spec) => initFieldNote(spec, zh))];
}

function initFieldNote(spec: (typeof INIT_FIELD_SPECS)[number], zh: boolean): string {
  const help = zh ? spec.help.zh : spec.help.en;
  let suffix: string;
  if (spec.automaticDefault) {
    suffix = zh
      ? `；省略时默认 ${spec.recommended}`
      : `; defaults to ${spec.recommended} when omitted`;
  } else {
    suffix = zh
      ? `；交互推荐 ${spec.recommended}`
      : `; interactive recommendation: ${spec.recommended}`;
  }
  return `${spec.flag}: ${help}${suffix}`;
}

function initUsage(): string {
  const scalar = INIT_FIELD_SPECS.map((spec) => `[${spec.flag} <value>]`).join(" ");
  return `init [--pretty] [--extensions-file <path> | --no-additional-extensions] ${scalar}`;
}

const leafExamples: Readonly<Record<string, readonly string[]>> = {
  doctor: ["kg --root ./workspace doctor", "kg --root ./workspace doctor --json --pretty"],
  init: [
    "kg --root ./workspace init",
    "kg --root ./workspace init --cache-path cache/openai-compatible.db --cache-max-size-mb 4096 --no-additional-extensions --embedding-base-url https://api.openai.com/v1 --embedding-model text-embedding-3-small --embedding-dimensions 1536 --embedding-similarity cosine --embedding-api-key-env OPENAI_API_KEY"
  ],
  ontology: ["kg --root ./workspace ontology node:Person --at branch/main"],
  "ontology patch": [
    "kg --root ./workspace ontology patch --base-state commit/<64-hex> --branch main --patch-file ontology.diff"
  ],
  "object read": ["kg --root ./workspace object read node:Person --at branch/main --body"],
  "object patch": [
    "kg --root ./workspace object patch --base-state commit/<64-hex> --branch main --patch-file objects.diff"
  ],
  "graph query": [
    "kg --root ./workspace graph query --at branch/main --cypher 'MATCH (n) RETURN n LIMIT 10'"
  ],
  "graph execute": [
    "kg --root ./workspace graph execute --branch main --cypher 'CREATE (:Example {name: $name})' --params '{\"name\":\"demo\"}'"
  ],
  "evolution overview": ["kg --root ./workspace evolution overview"],
  "evolution get": ["kg --root ./workspace evolution get branch/main"],
  "evolution ancestry": ["kg --root ./workspace evolution ancestry branch/main --limit 20"],
  "evolution history": [
    "kg --root ./workspace evolution history branch/main --scope all --limit 20"
  ],
  "evolution diff": [
    "kg --root ./workspace evolution diff --before commit/<64-hex> --after branch/main --scope all"
  ],
  "evolution state create": ["kg --root ./workspace evolution state create --branch main"],
  "evolution state set-data": [
    'kg --root ./workspace evolution state set-data branch/main --data \'{"source":"example"}\''
  ],
  "evolution state clear-data": ["kg --root ./workspace evolution state clear-data branch/main"],
  "evolution branch list": ["kg --root ./workspace evolution branch list"],
  "evolution branch create": [
    "kg --root ./workspace evolution branch create experiment --from branch/main"
  ],
  "evolution branch delete": ["kg --root ./workspace evolution branch delete experiment"],
  "evolution tag list": ["kg --root ./workspace evolution tag list"],
  "evolution tag create": ["kg --root ./workspace evolution tag create v1 --target branch/main"],
  "evolution tag move": ["kg --root ./workspace evolution tag move v1 --target branch/main"],
  "evolution tag delete": ["kg --root ./workspace evolution tag delete v1"],
  "evolution merge start": [
    "kg --root ./workspace evolution merge start --branch main --source branch/experiment"
  ],
  "evolution merge list": ["kg --root ./workspace evolution merge list --limit 20"],
  "evolution merge get": ["kg --root ./workspace evolution merge get <session>"],
  "evolution merge conflicts": [
    "kg --root ./workspace evolution merge conflicts <session> --limit 20"
  ],
  "evolution merge resolve": [
    "kg --root ./workspace evolution merge resolve <session> --expected-revision 1 --resolutions-file resolutions.json"
  ],
  "evolution merge finalize": [
    "kg --root ./workspace evolution merge finalize <session> --expected-revision 1"
  ],
  "evolution merge abort": [
    "kg --root ./workspace evolution merge abort <session> --expected-revision 1"
  ]
};

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
