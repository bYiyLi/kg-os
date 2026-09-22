import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};
const allowed = new Map([["github.com/mattn/go-sqlite3", "v1.14.52"]]);

const result = await runCapture(
  "go",
  [
    "list",
    "-deps",
    "-test",
    "-tags=sqlite_fts5,lithograph_smoke",
    "-f",
    "{{with .Module}}{{if not .Main}}{{.Path}}\t{{.Version}}\t{{.Dir}}{{end}}{{end}}",
    "./..."
  ],
  { cwd: root, env }
);

const modules = new Map();
for (const line of result.stdout.split("\n")) {
  if (line.trim() === "") {
    continue;
  }
  const [path, version, directory] = line.split("\t");
  modules.set(path, { directory, version });
}

if (!modules.has("github.com/mattn/go-sqlite3")) {
  throw new Error("Go license gate did not observe the SQLite runtime dependency");
}
for (const [path, metadata] of modules) {
  const expectedVersion = allowed.get(path);
  if (expectedVersion === undefined) {
    throw new Error(
      "Go runtime/test-native dependency has not been reviewed: " + path + " " + metadata.version
    );
  }
  if (metadata.version !== expectedVersion) {
    throw new Error(
      path + " must remain pinned to " + expectedVersion + ", got " + metadata.version
    );
  }
  const license = await readFile(resolve(metadata.directory, "LICENSE"), "utf8");
  if (
    !license.includes("Permission is hereby granted, free of charge") ||
    !license.includes('THE SOFTWARE IS PROVIDED "AS IS"')
  ) {
    throw new Error(path + " no longer matches the reviewed MIT license text");
  }
}

process.stdout.write(
  "Go dependency license gate passed: github.com/mattn/go-sqlite3 v1.14.52 (MIT)\n"
);
