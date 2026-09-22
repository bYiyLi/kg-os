import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const allowed =
  "MIT;MIT*;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;MPL-2.0;" +
  "Python-2.0;CC0-1.0;BlueOak-1.0.0;CC-BY-3.0;CC-BY-4.0;CC-BY-SA-4.0;" +
  "(BSD-2-Clause OR MIT OR Apache-2.0);(MIT AND CC-BY-3.0);" +
  "Custom: https://github.com/streetsidesoftware/cspell";

await run(
  "pnpm",
  [
    "exec",
    "license-checker-rseidelsohn",
    "--production",
    "--excludePrivatePackages",
    "--onlyAllow",
    allowed,
    "--summary"
  ],
  { cwd: resolve(root, "packages/web") }
);
