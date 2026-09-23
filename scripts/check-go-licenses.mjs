import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};
const allowed = new Map([
  [
    "github.com/BurntSushi/toml",
    {
      version: "v1.4.1-0.20240526193622-a339e1f7089c",
      file: "COPYING",
      license: "MIT"
    }
  ],
  ["github.com/mattn/go-sqlite3", { version: "v1.14.52", file: "LICENSE", license: "MIT" }],
  ["github.com/zeebo/blake3", { version: "v0.2.4", file: "LICENSE", license: "CC0-1.0" }],
  ["github.com/klauspost/cpuid/v2", { version: "v2.0.12", file: "LICENSE", license: "MIT" }],
  ["golang.org/x/sys", { version: "v0.48.0", file: "LICENSE", license: "BSD-3-Clause" }],
  ["gopkg.in/yaml.v3", { version: "v3.0.1", file: "LICENSE", license: "MIT/Apache-2.0" }]
]);

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
  const reviewed = allowed.get(path);
  if (reviewed === undefined) {
    throw new Error(
      "Go runtime/test-native dependency has not been reviewed: " + path + " " + metadata.version
    );
  }
  if (metadata.version !== reviewed.version) {
    throw new Error(
      path + " must remain pinned to " + reviewed.version + ", got " + metadata.version
    );
  }
  const license = await readFile(resolve(metadata.directory, reviewed.file), "utf8");
  if (reviewed.license === "MIT") {
    if (
      !license.includes("Permission is hereby granted, free of charge") ||
      !license.includes('THE SOFTWARE IS PROVIDED "AS IS"')
    ) {
      throw new Error(path + " no longer matches the reviewed MIT license text");
    }
  } else if (reviewed.license === "BSD-3-Clause") {
    if (
      !license.includes("Redistribution and use in source and binary forms") ||
      !license.includes("Neither the name of Google LLC") ||
      !license.includes('"AS IS"')
    ) {
      throw new Error(path + " no longer matches the reviewed BSD-3-Clause license text");
    }
  } else if (reviewed.license === "CC0-1.0") {
    if (
      !license.includes("This work is released into the public domain with CC0 1.0.") ||
      !license.includes("CC0 1.0 Universal") ||
      !license.includes("Statement of Purpose")
    ) {
      throw new Error(path + " no longer matches the reviewed CC0-1.0 license text");
    }
  } else if (reviewed.license === "MIT/Apache-2.0") {
    if (
      !license.includes("This project is covered by two different licenses: MIT and Apache.") ||
      !license.includes("Permission is hereby granted, free of charge") ||
      !license.includes("Licensed under the Apache License, Version 2.0")
    ) {
      throw new Error(path + " no longer matches the reviewed MIT/Apache-2.0 license text");
    }
  } else {
    throw new Error("unsupported reviewed license kind for " + path + ": " + reviewed.license);
  }
}

process.stdout.write(
  "Go dependency license gate passed: BurntSushi/toml (MIT), mattn/go-sqlite3 (MIT), zeebo/blake3 (CC0-1.0), klauspost/cpuid/v2 (MIT), golang.org/x/sys (BSD-3-Clause), gopkg.in/yaml.v3 (MIT/Apache-2.0)\n"
);
