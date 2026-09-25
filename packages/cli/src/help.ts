import { KGOS_VERSION } from "@kgos/sdk";

export function rootHelp(): string {
  return `KG OS command-line client

Usage:
  kg --root <instance-root> doctor [--json]
  kg --root <instance-root> init [configuration options]
  kg --root <instance-root> ontology ...
  kg --root <instance-root> object ...
  kg --root <instance-root> graph ...
  kg --root <instance-root> evolution ...
  kg --help
  kg --version

Global:
  --root <path>   Explicit KG OS Instance Root
  -h, --help      Show help without accessing an Instance
  -V, --version   Show version
`;
}

export function versionText(): string {
  return KGOS_VERSION + "\n";
}

export function commandHelp(args: readonly string[]): string {
  const command = args.find((value) => !value.startsWith("-"));
  if (command === undefined) {
    return rootHelp();
  }
  switch (command) {
    case "doctor":
      return "Usage: kg --root <instance-root> doctor [--json]\n";
    case "init":
      return `Usage: kg --root <instance-root> init
  [--cache-path <path>]
  [--cache-max-size-mb <n>]
  [--fulltext-analyzer <fts5-spec>]
  [--embedding-base-url <url>]
  [--embedding-model <id>]
  [--embedding-dimensions <1..4096>]
  [--embedding-similarity <cosine|euclidean>]
  [--embedding-api-key-env <name-or-empty>]
`;
    case "ontology":
      return `Usage:
  kg --root <instance-root> ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]
  kg --root <instance-root> ontology <OntologyRef>... --at <commit/...> --edit
  kg --root <instance-root> ontology patch --base-state <commit/...> --branch <name> (--patch <text> | --patch-file <path> | stdin)
`;
    case "object":
      return `Usage:
  kg --root <instance-root> object read <ObjectRef>... --at <StateRef> [--body] [--format yaml|json] [--pretty]
  kg --root <instance-root> object read --refs-file <path> --at <StateRef> [...]
  kg --root <instance-root> object patch --base-state <commit/...> --branch <name> (--patch <text> | --patch-file <path> | stdin)
`;
    case "graph":
      return `Usage:
  kg --root <instance-root> graph query --at <StateRef> (--cypher <text> | --cypher-file <path> | stdin) [--params <json-map> | --params-file <path>] [--stream] [--pretty]
  kg --root <instance-root> graph execute --branch <name> (--cypher <text> | --cypher-file <path> | stdin) [--params <json-map> | --params-file <path>] [--author <text>] [--message <text>] [--stream] [--pretty]
`;
    case "evolution":
      return `Usage:
  kg --root <instance-root> evolution overview [--pretty]
  kg --root <instance-root> evolution get <StateRef> [--pretty]
  kg --root <instance-root> evolution ancestry <StateRef> [--limit <n>] [--cursor <token>] [--pretty]
  kg --root <instance-root> evolution history <StateRef> --scope all|ontology|knowledge|object [...]
  kg --root <instance-root> evolution diff --before <StateRef> --after <StateRef> --scope all|ontology|knowledge|object [...]
  kg --root <instance-root> evolution state ...
  kg --root <instance-root> evolution branch ...
  kg --root <instance-root> evolution tag ...
  kg --root <instance-root> evolution merge ...
`;
    default:
      return rootHelp();
  }
}
