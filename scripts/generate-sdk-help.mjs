import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import ts from "typescript";

import { methodNotes, methods } from "./sdk-help-metadata.mjs";

// cspell:words mcpsandbox
const root = resolve(import.meta.dirname, "..");
const clientPath = resolve(root, "packages/sdk/src/client.ts");
const typesPath = resolve(root, "packages/sdk/src/types.ts");
const enginePath = resolve(root, "internal/mcpsandbox/engine.go");
const outputs = [
  resolve(root, "packages/sdk/src/help-catalog.json"),
  resolve(root, "internal/mcpsandbox/sdk-help-catalog.json")
];
const isCheck = process.argv.includes("--check");

const program = ts.createProgram([clientPath, typesPath], {
  target: ts.ScriptTarget.ES2024,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true
});
const checker = program.getTypeChecker();
const clientFile = program.getSourceFile(clientPath);
const typesFile = program.getSourceFile(typesPath);
if (!clientFile || !typesFile) throw new Error("SDK type sources unavailable");

const declarations = new Map();
for (const node of typesFile.statements) {
  if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
    declarations.set(node.name.text, node);
  }
}

function typeDefinitions(requestType, returnType) {
  const found = new Set();
  function visit(name) {
    if (found.has(name)) return;
    const node = declarations.get(name);
    if (!node) return;
    found.add(name);
    function collect(child) {
      if (ts.isTypeReferenceNode(child)) {
        const name = child.typeName.getText(typesFile);
        if (declarations.has(name)) visit(name);
      }
      ts.forEachChild(child, collect);
    }
    ts.forEachChild(node, collect);
    if (ts.isInterfaceDeclaration(node) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const type of clause.types) visit(type.expression.getText(typesFile));
      }
    }
  }
  const referenced = [...returnType.matchAll(/\b[A-Z][a-zA-Z0-9]*\b/g)].map((match) => match[0]);
  for (const name of [requestType, ...referenced]) {
    if (name) visit(name);
  }
  return [...found].sort().map((name) =>
    declarations
      .get(name)
      .getText(typesFile)
      .replace(/^export\s+/, "")
  );
}

const seen = new Set();
const compiled = [];
function readMethods(node, prefix) {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText(clientFile);
    const path = [...prefix, name];
    if (ts.isObjectLiteralExpression(property.initializer)) {
      readMethods(property.initializer, path);
      continue;
    }
    if (!ts.isArrowFunction(property.initializer))
      throw new Error("Unexpected SDK method: " + path.join("."));
    const fullName = path.join(".");
    const doc = methods[fullName];
    if (!doc) throw new Error("SDK method missing Help metadata: " + fullName);
    seen.add(fullName);
    const arrow = property.initializer;
    const args = arrow.parameters.filter((param) => param.name.getText(clientFile) !== "options");
    if (args.length > 1) throw new Error("Unsupported SDK parameter shape: " + fullName);
    const request = args[0];
    const requestType = request?.type?.getText(clientFile) ?? null;
    if (request && (!requestType || !declarations.has(requestType))) {
      throw new Error("Unexpected request type for " + fullName);
    }
    const sig = checker.getSignaturesOfType(
      checker.getTypeAtLocation(arrow),
      ts.SignatureKind.Call
    )[0];
    if (!sig) throw new Error("Missing method signature: " + fullName);
    const returnType = checker.typeToString(
      sig.getReturnType(),
      arrow,
      ts.TypeFormatFlags.NoTruncation
    );
    if (!returnType.startsWith("Promise<") && !returnType.startsWith("AsyncGenerator<")) {
      throw new Error("Unexpected return type: " + fullName + " " + returnType);
    }
    const requestArg = requestType
      ? "request" + (request.initializer ? "?" : "") + ": " + requestType
      : "";
    compiled.push({
      name: fullName,
      description: doc[0],
      access: fullName in allowlist.read ? "read" : "write",
      signature: fullName + "(" + requestArg + "): " + returnType,
      requestType,
      returnType,
      typeDefinitions: typeDefinitions(requestType, returnType),
      example: doc[1],
      notes:
        fullName in allowlist.read
          ? (methodNotes[fullName] ?? [])
          : [
              "Example identifiers and revision numbers are placeholders; replace them with verified, authorized targets before executing.",
              ...(methodNotes[fullName] ?? [])
            ]
    });
  }
}
const engine = await readFile(enginePath, "utf8");
function methodsFromGo(listName) {
  const block = engine.match(
    new RegExp("var " + listName + " = map\\[string\\]bool\\{([\\s\\S]*?)\\n\\}")
  );
  if (!block) throw new Error("Could not find Go MCP allowlist " + listName);
  return [...block[1].matchAll(/"([^"]+)": true/g)].map((match) => match[1]);
}
const allowlist = {
  read: Object.fromEntries(methodsFromGo("readMethods").map((name) => [name, true])),
  write: Object.fromEntries(methodsFromGo("writeMethods").map((name) => [name, true]))
};
const sdkClass = clientFile.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === "KGOSClient"
);
if (!sdkClass) throw new Error("KGOSClient not found");
for (const namespace of ["ontology", "object", "graph", "evolution"]) {
  const node = sdkClass.members.find(
    (member) => ts.isPropertyDeclaration(member) && member.name?.getText(clientFile) === namespace
  );
  if (!node || !node.initializer || !ts.isObjectLiteralExpression(node.initializer))
    throw new Error("SDK namespace missing: " + namespace);
  readMethods(node.initializer, [namespace]);
}
const permitted = Object.keys(allowlist.read).concat(Object.keys(allowlist.write)).sort();
const authored = Object.keys(methods).sort();
const actual = [...seen].sort();
if (Object.keys(methodNotes).some((name) => !(name in methods))) {
  throw new Error("SDK Help notes reference an unknown method");
}
if (
  permitted.length !== 31 ||
  JSON.stringify(permitted) !== JSON.stringify(authored) ||
  JSON.stringify(permitted) !== JSON.stringify(actual)
) {
  throw new Error("SDK/Go MCP Help method inventory mismatch");
}
compiled.sort((a, b) => a.name.localeCompare(b.name, "en"));

// Type-check every published example against the SDK's actual method types.
// A syntactically valid snippet can still omit a required field or use a stale
// argument shape, which would make on-demand Help misleading to an AI client.
const examplePath = resolve(root, "packages/sdk/src/__generated_help_examples__.ts");
const exampleSource = [
  'import type { KGOSClient } from "./client.js";',
  ...["ontology", "object", "graph", "evolution"].map(
    (name) => `declare const ${name}: KGOSClient["${name}"];`
  ),
  ...compiled.map((item, index) => `async function example_${index}() { ${item.example} }`)
].join("\n");
const options = {
  target: ts.ScriptTarget.ES2024,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true
};
const host = ts.createCompilerHost(options);
const readSource = host.getSourceFile.bind(host);
const fileExists = host.fileExists.bind(host);
const readText = host.readFile.bind(host);
const canonicalExamplePath = process.platform === "win32" ? examplePath.toLowerCase() : examplePath;
const isExamplePath = (path) =>
  (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path)) ===
  canonicalExamplePath;
host.getSourceFile = (path, version, onError, createNew) =>
  isExamplePath(path)
    ? ts.createSourceFile(path, exampleSource, version, true)
    : readSource(path, version, onError, createNew);
host.fileExists = (path) => isExamplePath(path) || fileExists(path);
host.readFile = (path) => (isExamplePath(path) ? exampleSource : readText(path));
const exampleProgram = ts.createProgram([examplePath, clientPath], options, host);
const errors = ts
  .getPreEmitDiagnostics(exampleProgram)
  .filter((item) => item.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  throw new Error(
    "SDK Help examples do not type-check:\n" +
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (path) => path,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n"
      })
  );
}

const data = JSON.stringify({ methods: compiled }, null, 2) + "\n";
for (const path of outputs) {
  if (isCheck) {
    if ((await readFile(path, "utf8").catch(() => "")) !== data)
      throw new Error("Outdated SDK Help catalog: " + path);
  } else {
    await writeFile(path, data);
  }
}
process.stdout.write(
  "SDK Help: " + compiled.length + " methods; " + (isCheck ? "verified" : "generated") + "\n"
);
