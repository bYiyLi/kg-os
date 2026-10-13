import { readFile } from "node:fs/promises";
// cspell:words aperturerobotics segmentio tetratelabs yosida uritemplate
import { resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.2"
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
  [
    "github.com/aperturerobotics/go-quickjs-wasi-reactor",
    { version: "v0.15.1", file: "LICENSE", license: "MIT" }
  ],
  ["github.com/google/jsonschema-go", { version: "v0.4.3", file: "LICENSE", license: "MIT" }],
  ["github.com/mattn/go-sqlite3", { version: "v1.14.52", file: "LICENSE", license: "MIT" }],
  [
    "github.com/modelcontextprotocol/go-sdk",
    { version: "v1.8.0", file: "LICENSE", license: "Apache-2.0/MIT" }
  ],
  ["github.com/segmentio/asm", { version: "v1.1.3", file: "LICENSE", license: "MIT" }],
  ["github.com/segmentio/encoding", { version: "v0.5.4", file: "LICENSE", license: "MIT" }],
  ["github.com/tetratelabs/wazero", { version: "v1.12.0", file: "LICENSE", license: "Apache-2.0" }],
  [
    "github.com/yosida95/uritemplate/v3",
    { version: "v3.0.2", file: "LICENSE", license: "BSD-3-Clause-Generic" }
  ],
  ["github.com/zeebo/blake3", { version: "v0.2.4", file: "LICENSE", license: "CC0-1.0" }],
  ["github.com/klauspost/cpuid/v2", { version: "v2.0.12", file: "LICENSE", license: "MIT" }],
  ["golang.org/x/oauth2", { version: "v0.35.0", file: "LICENSE", license: "BSD-3-Clause" }],
  ["golang.org/x/sync", { version: "v0.23.0", file: "LICENSE", license: "BSD-3-Clause" }],
  ["golang.org/x/sys", { version: "v0.48.0", file: "LICENSE", license: "BSD-3-Clause" }],
  ["golang.org/x/time", { version: "v0.15.0", file: "LICENSE", license: "BSD-3-Clause" }],
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
  } else if (reviewed.license === "Apache-2.0" || reviewed.license === "Apache-2.0/MIT") {
    if (
      !license.includes("Apache License") ||
      !license.includes("Version 2.0, January 2004") ||
      !license.includes("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION") ||
      (reviewed.license === "Apache-2.0/MIT" &&
        (!license.includes("MIT License") ||
          !license.includes("Permission is hereby granted, free of charge")))
    ) {
      throw new Error(path + " no longer matches the reviewed Apache-2.0/MIT license text");
    }
  } else if (reviewed.license === "BSD-3-Clause-Generic") {
    if (
      !license.includes("Redistribution and use in source and binary forms") ||
      !license.includes("Neither the name of the copyright holder") ||
      !license.includes('"AS IS"')
    ) {
      throw new Error(path + " no longer matches the reviewed BSD-3-Clause license text");
    }
  } else {
    throw new Error("unsupported reviewed license kind for " + path + ": " + reviewed.license);
  }
}

process.stdout.write(
  "Go dependency license gate passed: " +
    [...modules.keys()]
      .sort()
      .map((name) => name + " (" + allowed.get(name).license + ")")
      .join(", ") +
    "\n"
);
