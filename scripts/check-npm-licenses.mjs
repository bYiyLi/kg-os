import { resolve } from "node:path";

import { checkProductionLicenses } from "./npm-license-policy.mjs";
import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
// Scan every workspace importer so linked SDK dependencies are included too.
// validate runs a frozen install first; failed scans are never treated as empty results.
const licenses = await runCapture("pnpm", ["licenses", "list", "--prod", "--json"], {
  cwd: root
});
const dependencies = await runCapture(
  "pnpm",
  ["list", "--prod", "--recursive", "--depth", "Infinity", "--json"],
  { cwd: root }
);
const summary = await checkProductionLicenses(
  JSON.parse(licenses.stdout),
  JSON.parse(dependencies.stdout)
);
process.stdout.write("npm production dependency licenses: " + JSON.stringify(summary) + "\n");
