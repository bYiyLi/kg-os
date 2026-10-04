import { readFile } from "node:fs/promises";

export async function seedResearchRuntime(endpoint, token) {
  const { KGOSClient } = await import(new URL("../packages/sdk/dist/index.js", import.meta.url));
  const objects = JSON.parse(
    await readFile(new URL("../tests/e2e/research-objects.json", import.meta.url), "utf8")
  );
  const client = new KGOSClient({ endpoint, token });
  const initial = await client.evolution.overview();
  const patch = objects
    .map(([ref, value]) => {
      const rows = JSON.stringify(value, null, 2).split("\n");
      return `diff --git a/${ref} b/${ref}\nnew file mode 100644\n--- /dev/null\n+++ b/${ref}\n@@ -0,0 +1,${String(rows.length)} @@\n${rows.map((row) => "+" + row).join("\n")}\n`;
    })
    .join("");
  const receipt = await client.object.patch({
    branch: "main",
    baseState: initial.state,
    patch,
    message: "E2E research fixture",
    author: "P14 E2E"
  });
  function created(alias, kind = "knowledge-node") {
    const ref = receipt.created.find((item) => item.alias === alias && item.kind === kind)?.ref;
    if (ref === undefined) throw new Error("Packed research fixture alias is absent: " + alias);
    return ref;
  }
  return {
    state: receipt.state,
    model: created("model"),
    paper: created("paper"),
    unlabelled: created("unlabelled"),
    describes: [
      created("describes-one", "knowledge-relationship"),
      created("describes-two", "knowledge-relationship")
    ],
    selfLoop: created("self", "knowledge-relationship"),
    reverse: created("reverse", "knowledge-relationship")
  };
}
