import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const stages = [
  "check:install",
  "check:dependencies",
  "typecheck",
  "lint",
  "build",
  "check:go",
  "test:go:race",
  "test:go:coverage",
  "check:go:security",
  "test:coverage",
  "check:type-coverage",
  "check:duplicates",
  "check:unused",
  "exec playwright test --config config/test/playwright.config.ts",
  "check:licenses",
  "check:security",
  "check:diff"
];
const tools = ["docker", "skopeo", "git", "tar", "zip", "pnpm", "node"];
const categories = [
  "tool_interface",
  "authentication",
  "network",
  "storage",
  "external_tool_failed"
];
export function safeToolFailure(program, exitCode, stderr) {
  const name = String(program).split(/[\\/]/).at(-1);
  const text = String(stderr);
  let category = "external_tool_failed";
  if (/unknown flag|unknown option/i.test(text)) category = "tool_interface";
  else if (/unauthorized|authentication required|access denied/i.test(text))
    category = "authentication";
  else if (
    /network is unreachable|connection refused|i\/o timeout|could not resolve|TLS handshake timeout/i.test(
      text
    )
  )
    category = "network";
  else if (/no space left on device/i.test(text)) category = "storage";
  return {
    schema: 1,
    category,
    tool: tools.includes(name) ? name : "other",
    exitCode: Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255 ? exitCode : null
  };
}

// Never forward a log line, filename, test name or arbitrary exception to stdout.
export function safeReport(log, exitCode) {
  const text = String(log).replace(
    new RegExp(String.fromCharCode(27) + "\\[[0-?]*[ -/]*[@-~]", "g"),
    ""
  );
  const commands = [...text.matchAll(/^> pnpm (.+)$/gm)].map((match) => match[1].trim());
  const last = commands.filter((command) => stages.includes(command)).at(-1);
  const thresholds = [];
  const pattern =
    /^ERROR: Coverage for (branches|functions|lines|statements) \((\d+(?:\.\d+)?)%\) does not meet global threshold \((\d+(?:\.\d+)?)%\)\s*$/gm;
  for (const match of text.matchAll(pattern)) {
    const actual = Number(match[2]);
    const required = Number(match[3]);
    if (actual >= 0 && actual <= 100 && required >= 0 && required <= 100) {
      thresholds.push({ metric: match[1], actual, required });
    }
  }
  const row = text.match(
    /^All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/m
  );
  const percentages = row?.slice(1).map(Number);
  const coverage = percentages?.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)
    ? Object.fromEntries(
        ["statements", "branches", "functions", "lines"].map((key, i) => [key, percentages[i]])
      )
    : null;
  const unhandled = /^Vitest caught \d+ unhandled errors? during the test run\./m.test(text);
  if (exitCode !== 0)
    for (const line of text.split("\n").reverse()) {
      try {
        const data = JSON.parse(line);
        if (
          data.schema === 1 &&
          categories.includes(data.category) &&
          [...tools, "other"].includes(data.tool)
        )
          return {
            schema: 1,
            category: data.category,
            tool: data.tool,
            exitCode:
              Number.isInteger(data.exitCode) && data.exitCode >= 0 && data.exitCode <= 255
                ? data.exitCode
                : null
          };
      } catch {
        /* Non-JSON source output is never forwarded. */
      }
    }
  return {
    schema: 1,
    exitCode: Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255 ? exitCode : null,
    stage: last ? stages.indexOf(last) + 1 : null,
    category:
      exitCode === 0
        ? "passed"
        : thresholds.length
          ? "coverage_threshold"
          : unhandled
            ? "unhandled_error"
            : "command_failed_unknown",
    coverage,
    thresholds: thresholds.slice(0, 4)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [path, status] = process.argv.slice(2);
    console.log(JSON.stringify(safeReport(await readFile(path, "utf8"), Number(status))));
  } catch {
    console.log('{"schema":1,"category":"diagnostic_unavailable"}');
    process.exitCode = 1;
  }
}
