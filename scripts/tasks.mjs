import { appendFile } from "node:fs/promises";

import { run } from "./process.mjs";

const task = process.argv[2];

const taskCommands = {
  lint: [
    ["check:docs"],
    ["check:ontology-sources"],
    ["exec", "eslint", ".", "--max-warnings", "0"],
    ["exec", "prettier", "--check", ".", "--ignore-unknown"],
    ["check:imports"],
    ["check:repo"],
    ["check:markdown"],
    ["check:spelling"],
    ["check:secrets"]
  ],
  quick: [["check:go"], ["typecheck"], ["lint"], ["test"]],
  typecheck: [
    ["exec", "tsc", "-b", "--pretty", "false"],
    ["exec", "tsc", "-p", "packages/web/tsconfig.json", "--pretty", "false"],
    ["exec", "tsc", "-p", "config/test/tsconfig.test.json", "--pretty", "false"]
  ],
  validate: [
    ["check:install"],
    ["check:dependencies"],
    ["typecheck"],
    ["lint"],
    // Go integration tests now serve the embedded Web Setup pages.
    // Build real Web assets before any Go tests on a clean checkout.
    ["build"],
    ["check:go"],
    ["test:go:race"],
    ["test:go:coverage"],
    ["check:go:security"],
    ["test:coverage"],
    ["check:type-coverage"],
    ["check:duplicates"],
    ["check:unused"],
    ["exec", "playwright", "test", "--config", "config/test/playwright.config.ts"],
    ["check:licenses"],
    ["check:security"],
    ["check:diff"]
  ]
};

if (!(task in taskCommands)) {
  throw new Error("Unknown task sequence: " + String(task));
}

for (const [index, args] of taskCommands[task].entries()) {
  process.stdout.write("\n> pnpm " + args.join(" ") + "\n");
  try {
    await run("pnpm", args);
  } catch (error) {
    // The public job masks private logs. A stage number in its job summary
    // allows troubleshooting without exposing tests or source paths.
    if (task === "validate" && process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `Validation failed at stage ${index + 1}/${taskCommands[task].length}; details are suppressed.\n`
      ).catch(() => undefined);
    }
    throw error;
  }
}
