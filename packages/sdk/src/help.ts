import catalog from "./help-catalog.json" with { type: "json" };

export type SDKHelpAccess = "read" | "write";

export interface SDKHelpSummary {
  name: string;
  description: string;
  access: SDKHelpAccess;
}

export interface SDKHelpDetail extends SDKHelpSummary {
  signature: string;
  requestType: string | null;
  returnType: string;
  typeDefinitions: string[];
  example: string;
  notes: string[];
}

const methods = catalog.methods as SDKHelpDetail[];

/** Inspect methods supported by the KG OS MCP JavaScript sandbox. */
export function help(): SDKHelpSummary[];
export function help(name: string): SDKHelpDetail;
export function help(name?: string): SDKHelpSummary[] | SDKHelpDetail {
  if (arguments.length > 1) {
    throw new TypeError("SDK help accepts at most one method name");
  }
  if (name === undefined) {
    return methods.map(({ name: method, description, access }) => ({
      name: method,
      description,
      access
    }));
  }
  if (typeof name !== "string" || !name) {
    throw new TypeError("SDK help requires a non-empty method name");
  }
  const detail = methods.find((item) => item.name === name);
  if (!detail) {
    throw new RangeError("Unknown KG OS SDK method");
  }
  return structuredClone(detail);
}
