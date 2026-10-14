import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "packages/web");
const output = join(root, "dist-mcp");
let html = await readFile(join(output, "mcp.html"), "utf8");

async function inlineAssets(pattern, wrap) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error("MCP App must have exactly one bundled " + wrap.name + " asset");
  }
  const match = matches[0];
  const filename = match[1];
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) throw new Error("Unsafe MCP App asset");
  const content = await readFile(join(output, "assets", filename), "utf8");
  html = html.replace(match[0], () => wrap(content));
}

await inlineAssets(
  /<script\b[^>]*\bsrc="\/assets\/([^"]+\.js)"[^>]*><\/script>/g,
  function javascript(code) {
    return '<script type="module">' + code.replace(/<\/script/gi, "<\\/script") + "</script>";
  }
);
await inlineAssets(/<link\b[^>]*\bhref="\/assets\/([^"]+\.css)"[^>]*>/g, function stylesheet(css) {
  return "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>";
});
const unresolved = html.match(/<(?:script|link)\b[^<>]*(?:src|href)="\/assets\//);
if (unresolved !== null) {
  throw new Error("MCP App still depends on external assets: " + unresolved[0].slice(0, 160));
}
await writeFile(join(root, "dist", "mcp-app.html"), html, "utf8");
await rm(output, { recursive: true, force: true });
