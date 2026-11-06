import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(join(root, path), "utf8");
const fixture = JSON.parse(read("tests/skills/knowledge-quality-evidence-evaluation.json"));
const selection = JSON.parse(read("tests/skills/knowledge-unified-evaluation.json")).cases;

test("quality evidence cases are paired and verifiable without production data", () => {
  const pairs = new Map();
  const ids = new Set();
  const verdicts = new Set([
    "supported",
    "insufficient",
    "correctable_gap",
    "unknown",
    "not_recorded"
  ]);
  assert.match(fixture.purpose, /Synthetic/);
  for (const item of fixture.cases) {
    assert.ok(item.id && !ids.has(item.id), `duplicate or empty ID ${item.id}`);
    ids.add(item.id);
    for (const field of ["request", "knowledge", "source"]) {
      assert.ok(item.input?.[field]?.length >= 10, `${item.id}: missing ${field}`);
    }
    assert.ok(verdicts.has(item.expected?.verdict), `${item.id}: unsupported verdict`);
    assert.ok(["read_only", "approved_in_scope"].includes(item.expected?.permission));
    pairs.set(item.pair, [...(pairs.get(item.pair) ?? []), item]);
  }
  assert.equal(pairs.size, 4);
  for (const [name, items] of pairs) {
    assert.equal(items.length, 2, `${name}: expected positive and contrasting case`);
    assert.notDeepEqual(
      items[0].expected,
      items[1].expected,
      `${name}: pair must test a different fact or permission`
    );
  }
  assert.equal(
    pairs.get("authorization")?.filter((item) => item.expected.permission === "read_only").length,
    1
  );
});

const skillNames = [
  "design-ontology",
  "kgos-ontology-implementation",
  "kgos-review-ontology",
  "kgos-organize-knowledge",
  "kgos-review-knowledge",
  "kgos-retrieve-knowledge",
  "kgos-record-vlog",
  "kgos-doctor"
];

test("current selection fixtures cover all eight responsibilities and explicit boundaries", () => {
  const ids = new Set();
  const selected = new Set();
  for (const item of selection) {
    assert.ok(item.id && !ids.has(item.id), `duplicate case: ${item.id}`);
    ids.add(item.id);
    assert.ok(item.prompt?.length >= 10);
    assert.ok(item.criteria?.length >= 2);
    assert.ok([...skillNames, "none"].includes(item.expectedSkill), item.id);
    assert.equal("expectedApplies" in item, false, "retired unified selection must not be used");
    selected.add(item.expectedSkill);
  }
  assert.deepEqual([...selected].sort(), [...skillNames, "none"].sort());
  const routes = {
    "read-only-existing-decision": "kgos-retrieve-knowledge",
    "real-knowledge-write": "kgos-organize-knowledge",
    "quality-audit-source-claims": "kgos-review-knowledge",
    "quality-authorized-fix-pair": "kgos-organize-knowledge",
    "quality-scope-vlog-specialized": "kgos-review-knowledge",
    "quality-scope-ontology-structure": "design-ontology",
    "implement-approved-design": "kgos-ontology-implementation",
    "review-active-ontology": "kgos-review-ontology",
    "vlog-boundary": "kgos-record-vlog",
    "quality-scope-doctor-diagnostic": "kgos-doctor"
  };
  for (const [id, expected] of Object.entries(routes)) {
    assert.equal(selection.find((item) => item.id === id)?.expectedSkill, expected, id);
  }
});

test("current Skill catalog has valid metadata and all local Markdown resources resolve", () => {
  const skillsRoot = join(root, "plugins/kgos/skills");
  assert.deepEqual(
    readdirSync(skillsRoot, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort(),
    [...skillNames].sort()
  );
  for (const name of skillNames) {
    const directory = join(skillsRoot, name);
    const body = readFileSync(join(directory, "SKILL.md"), "utf8");
    assert.match(body, /^---\n/);
    assert.equal(/^name: (.+)$/m.exec(body)?.[1], name);
    const description = /^description: (.+)$/m.exec(body)?.[1];
    assert.ok(description && description.length <= 1024, name);
    assert.doesNotMatch(
      body.split("---")[1],
      /metadata:|version:/,
      "repository Skill sources are unversioned; distribution stamps metadata.version"
    );
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
      );
    for (const file of walk(directory).filter((path) => path.endsWith(".md"))) {
      const content = readFileSync(file, "utf8");
      const targets = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
      // Some approved design navigation uses plain relative paths rather than links.
      targets.push(
        ...[...content.matchAll(/(?:references|assets)\/[A-Za-z0-9_.-]+\.md/g)].map((match) =>
          relative(dirname(file), join(directory, match[0]))
        )
      );
      for (const link of targets) {
        const target = link.split("#")[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const resolved = resolve(dirname(file), target);
        const within = relative(skillsRoot, resolved);
        assert.ok(
          !isAbsolute(within) && within !== ".." && !within.startsWith("../"),
          `resource escapes Plugin Skills: ${file}: ${link}`
        );
        assert.ok(existsSync(resolved), `missing resource: ${file}: ${link}`);
      }
    }
  }
});

test("split Skills preserve read-only review, scoped saves and independent results", () => {
  const contracts = {
    "kgos-retrieve-knowledge": ["KG OS 侧只读", "不可变 State", "完整正文", "top-k", "不能擅自切换实例"],
    "kgos-organize-knowledge": [
      "只读、讨论和建议任务止于候选与建议",
      "不自行修改本体或新建分支",
      "写入结果不明",
      "不直接重试",
      "内容检查、保存回读、检索检查和真实运行效果"
    ],
    "kgos-review-knowledge": ["仅使用只读接口", "不提供替代文本、修复步骤或修改方案", "完整正文", "未核实项目不得算作通过"],
    "design-ontology": ["预期结果及依据", "不通过迁就模型改写预期", "自检清单"],
    "kgos-ontology-implementation": ["核验写入许可", "不在转换时擅自补设计", "信息一致性", "不以写入成功代替验收通过"],
    "kgos-review-ontology": ["仅使用只读接口", "不提供替代模型、修复步骤、修改方案或补丁", "相关真实知识", "无法确认"],
    "kgos-record-vlog": ["操作成功不等于验证通过", "回执未知时先检查原目标", "日志保存失败不重做原操作", "不为日志保存成功再递归记一条日志"],
    "kgos-doctor": ["全面自检覆盖 D0–D6", "冻结清单", "Plugin 发行版本与 MCP 运行版本是两个证据对象", "不执行修复、升级、部署或自动保存日志"]
  };
  for (const [name, phrases] of Object.entries(contracts)) {
    const body = read(`plugins/kgos/skills/${name}/SKILL.md`);
    for (const phrase of phrases) assert.ok(body.includes(phrase), `${name}: missing ${phrase}`);
  }
});

test("evaluator is opt-in and never supplied grading expectations", () => {
  const evaluator = read("tests/skills/evaluate-knowledge-quality.mjs");
  assert.ok(evaluator.includes("KGOS_EVAL_EXECUTION_APPROVED"));
  assert.ok(evaluator.includes("JSON.stringify(selected.input)"));
  assert.ok(evaluator.includes("selected.expectedSkill"));
  assert.ok(!evaluator.includes("JSON.stringify(selected.expected)"));
});
