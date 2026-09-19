import { run } from "./process.mjs";

const task = process.argv[2];

const taskCommands = {
  lint: [
    ["exec", "eslint", ".", "--max-warnings", "0"],
    ["exec", "prettier", "--check", ".", "--ignore-unknown"],
    ["check:imports"],
    ["check:repo"],
    ["check:markdown"],
    ["check:spelling"],
    ["check:secrets"]
  ],
  quick: [["typecheck"], ["lint"], ["test"]],
  typecheck: [
    ["exec", "tsc", "-b", "--pretty", "false"],
    ["exec", "tsc", "-p", "packages/web/tsconfig.json", "--pretty", "false"],
    ["exec", "tsc", "-p", "tsconfig.test.json", "--pretty", "false"]
  ],
  validate: [
    ["check:install"],
    ["check:dependencies"],
    ["typecheck"],
    ["lint"],
    ["test:coverage"],
    ["check:type-coverage"],
    ["check:duplicates"],
    ["check:unused"],
    ["check:versions"],
    ["check:dedupe"],
    ["build"],
    ["check:exports"],
    ["exec", "playwright", "test"],
    ["test:native"],
    ["check:package"],
    ["check:licenses"],
    ["check:security"],
    ["check:diff"]
  ]
};

if (!(task in taskCommands)) {
  throw new Error(`Unknown task sequence: ${String(task)}`);
}

for (const args of taskCommands[task]) {
  process.stdout.write(`\n> pnpm ${args.join(" ")}\n`);
  await run("pnpm", args);
}
