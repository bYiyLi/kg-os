import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

test("Skill selection evaluation includes all three nearest professional boundaries", () => {
  const wrongRoutes = new Set(
    selection
      .filter((item) => item.expectedApplies === false)
      .map((item) => item.expectedOtherSkill)
      .filter(Boolean)
  );
  assert.deepEqual(
    [...wrongRoutes].sort(),
    ["kgos-doctor", "kgos-ontology-standards", "kgos-vlog-standards"].sort()
  );
  assert.ok(selection.some((item) => item.id === "quality-authorized-fix-pair"));
});

test("shipped Knowledge and VLog guidance preserve independent quality boundaries", () => {
  const knowledge = read("plugins/kgos/skills/kgos-knowledge-standards/SKILL.md");
  const method = read("plugins/kgos/skills/kgos-knowledge-standards/references/quality-audit.md");
  const vlog = read("plugins/kgos/skills/kgos-vlog-standards/SKILL.md");
  assert.match(knowledge, /references\/quality-audit\.md/);
  assert.match(knowledge, /VLog 事件的执行尝试/);
  assert.match(vlog, /通用的来源真实性/);
  for (const contract of ["证据强度", "审计覆盖、深度和成本", "敏感", "未验证"]) {
    assert.ok(method.includes(contract), `missing quality boundary: ${contract}`);
  }
});
