import { readFile, stat } from "node:fs/promises";

import type { MCPConfiguration } from "./config.js";

const MAX_TOKEN_BYTES = 4096;

export async function readMCPToken(
  source: MCPConfiguration["tokenSource"],
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  let token: string;
  if (source.kind === "env") {
    token = env[source.name] ?? "";
  } else {
    const info = await stat(source.path);
    if (!info.isFile() || info.size > MAX_TOKEN_BYTES + 2) {
      throw new Error("MCP token file is invalid or too large");
    }
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
      throw new Error("MCP token file must not be readable by group or others");
    }
    const file = await readFile(source.path, "utf8");
    token = file.replace(/\r?\n$/, "");
  }
  if (
    Buffer.byteLength(token, "utf8") < 32 ||
    Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES ||
    !/^[A-Za-z0-9._~+/-]+=*$/.test(token)
  ) {
    throw new Error("MCP token must be 32–4096 bytes of Bearer token characters");
  }
  return token;
}
