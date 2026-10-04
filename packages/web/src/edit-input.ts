import { type InputIssue } from "./edit-validation.js";
import { yamlDocument } from "./edit-yaml.js";

export function inputIssues(inputs: Record<string, string>): InputIssue[] {
  const issues: InputIssue[] = [];
  for (const [key, raw] of Object.entries(inputs)) {
    try {
      yamlDocument(raw);
    } catch (error) {
      issues.push({
        ref: key.split("|")[0] ?? "",
        path: key.slice(key.indexOf("|") + 1),
        message: error instanceof Error ? error.message : "字段 YAML 无法解析"
      });
    }
  }
  return issues;
}
