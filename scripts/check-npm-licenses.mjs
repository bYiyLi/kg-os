import { resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const allowed = new Set(
  (
    "MIT;MIT*;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;MPL-2.0;" +
    "Python-2.0;CC0-1.0;BlueOak-1.0.0;CC-BY-3.0;CC-BY-4.0;CC-BY-SA-4.0;" +
    "(BSD-2-Clause OR MIT OR Apache-2.0);(MIT AND CC-BY-3.0);" +
    "Custom: https://github.com/streetsidesoftware/cspell"
  ).split(";")
);

for (const name of ["cli", "web"]) {
  const output = await runCapture(
    "pnpm",
    ["--filter", "@kgos/" + name, "licenses", "list", "--prod", "--json"],
    { cwd: root }
  );
  const byLicense = JSON.parse(output.stdout);
  if (byLicense === null || typeof byLicense !== "object" || Array.isArray(byLicense)) {
    throw new Error("npm production license inventory is invalid");
  }
  let checked = 0;
  for (const [license, items] of Object.entries(byLicense)) {
    if (!Array.isArray(items)) throw new Error("npm license inventory is invalid");
    for (const item of items) {
      if (typeof item?.name !== "string" || typeof item?.license !== "string") {
        throw new Error("npm license entry is invalid");
      }
      if (item.name.startsWith("@kgos/")) continue;
      checked += 1;
      if (!allowed.has(license) || item.license !== license) {
        throw new Error("Disallowed npm production license: " + item.name + " (" + license + ")");
      }
    }
  }
  if (checked === 0) throw new Error("@kgos/" + name + " has no verified production licenses");
  process.stdout.write("@kgos/" + name + ": " + String(checked) + " production licenses allowed\n");
}
