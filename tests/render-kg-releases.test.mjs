import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { render } from "../scripts/render-kg-releases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

test("only whitelisted public files are generated, deterministically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    const first = await render({ output: directory, revision, ref: "refs/heads/main" });
    const manifest = JSON.parse(await readFile(join(directory, "source.json"), "utf8"));
    assert.equal(first.files.length, 7);
    assert.deepEqual(manifest, {
      schema: 1,
      repository: "bYiyLi/kg-os",
      revision,
      ref: "refs/heads/main"
    });
    const before = await readFile(join(directory, "source.json"), "utf8");
    const second = await render({ output: directory, revision, ref: "refs/heads/main" });
    assert.deepEqual(first, second);
    assert.equal(await readFile(join(directory, "source.json"), "utf8"), before);
    assert.equal(
      (await readFile(join(directory, "README.md"), "utf8")).includes("kg-releases"),
      true
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects untrusted refs, mismatched revisions and unexpected public files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    await assert.rejects(
      render({ output: directory, revision, ref: "refs/heads/untrusted" }),
      /Only private main/
    );
    await assert.rejects(
      render({ output: directory, revision: "0".repeat(40), ref: "refs/heads/main" }),
      /does not equal/
    );
    await writeFile(join(directory, "private-source.txt"), "must never be synced");
    await assert.rejects(
      render({ output: directory, revision, ref: "refs/heads/main" }),
      /unmanaged public file/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removes previously tracked files outside the export allowlist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Release Test"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: directory });
    await writeFile(join(directory, "legacy-public-file.txt"), "obsolete");
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["commit", "-qm", "seed"], { cwd: directory });
    await render({ output: directory, revision, ref: "refs/heads/main" });
    await assert.rejects(readFile(join(directory, "legacy-public-file.txt")), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses rendering into the KG OS source and rejects unknown release tags", async () => {
  await assert.rejects(
    render({ output: join(root, ".private-source-output"), revision, ref: "refs/heads/main" }),
    /must not be inside/
  );
  await assert.rejects(
    render({
      output: join(tmpdir(), "kg-releases-invalid-tag"),
      revision,
      ref: "refs/tags/v999.999.999"
    })
  );
});
