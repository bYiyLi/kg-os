import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { currentLithographArtifact } from "../scripts/lithograph-artifacts.mjs";
import { buildCurrentRuntimeBundle, currentRuntimeBundle } from "../scripts/runtime-bundle.mjs";

test("local runtime bundle is independent of historical npm platform packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "kgos-runtime-bundle-"));
  try {
    const artifact = currentLithographArtifact(root);
    const suffix =
      process.platform === "darwin" ? ".dylib" : process.platform === "win32" ? ".dll" : ".so";
    const daemonName = process.platform === "win32" ? "kgosd.exe" : "kgosd";
    const jiebaName =
      process.platform === "darwin"
        ? "libkgos_jieba.dylib"
        : process.platform === "win32"
          ? "kgos_jieba.dll"
          : "libkgos_jieba.so";
    const sources = new Map([
      ["package.json", '{"version":"0.2.1"}'],
      ["artifacts/build/" + daemonName, "kgosd fixture"],
      [
        artifact.cacheDirectory.slice(root.length + 1) + "/" + artifact.library,
        "Lithograph fixture"
      ],
      [
        artifact.cacheDirectory.slice(root.length + 1) + "/" + artifact.providerLibrary,
        "Provider fixture"
      ],
      ["artifacts/jieba/release/" + jiebaName, "Jieba fixture"],
      ["native/jieba/NOTICE.md", "Jieba notice"],
      ["native/jieba/licenses/sqlite-simple-tokenizer-MIT.txt", "Tokenizer license"],
      ["native/jieba/licenses/jieba-rs-MIT.txt", "Jieba license"]
    ]);
    for (const [relative, contents] of sources) {
      const path = join(root, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }

    const output = currentRuntimeBundle(root);
    const target = process.platform + "-" + process.arch;
    assert.equal(output, join(root, "artifacts", "runtime", target));

    const first = await buildCurrentRuntimeBundle({
      root,
      daemon: join(root, "artifacts", "build", daemonName)
    });
    assert.equal(first.output, output);
    assert.equal(first.target, target);
    assert.equal(first.manifest.platform, process.platform);
    assert.equal(first.manifest.arch, process.arch === "x64" ? "x64" : process.arch);
    assert.equal(first.manifest.version, "0.2.1");
    assert.deepEqual(
      first.manifest.files.map((entry) => entry.file),
      [
        daemonName,
        "extensions/lithograph" + suffix,
        "extensions/lithograph-openai-compatible" + suffix,
        "extensions/kgos-jieba" + suffix,
        "JIEBA-NOTICE.md",
        "licenses/sqlite-simple-tokenizer-MIT.txt",
        "licenses/jieba-rs-MIT.txt"
      ]
    );
    for (const { file, sha256 } of first.manifest.files) {
      const content = await readFile(join(output, file));
      assert.equal(sha256, createHash("sha256").update(content).digest("hex"));
    }
    assert.equal((await readdir(output)).includes("package.json"), false);

    const again = await buildCurrentRuntimeBundle({
      root,
      daemon: join(root, "artifacts", "build", daemonName)
    });
    assert.deepEqual(again.manifest, first.manifest);
    await writeFile(join(root, "package.json"), '{"version":"invalid"}');
    await assert.rejects(
      buildCurrentRuntimeBundle({ root, daemon: join(root, "artifacts", "build", daemonName) }),
      /valid product version/
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(output, "manifest.json"), "utf8")),
      first.manifest,
      "a bad input must not erase the last successfully prepared bundle"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
