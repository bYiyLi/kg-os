#!/usr/bin/env node

import { extractRoot } from "./args.js";
import { runDoctor } from "./commands/doctor.js";
import { runEvolution } from "./commands/evolution.js";
import { runGraph } from "./commands/graph.js";
import { runInit } from "./commands/init.js";
import { runObject } from "./commands/object.js";
import { runOntology } from "./commands/ontology.js";
import { loadConfig, validateRequiredEnvironment } from "./config.js";
import { errorJSON, normalizeError, usageError } from "./errors.js";
import { commandHelp, rootHelp, versionText } from "./help.js";
import { ensureClient } from "./runtime.js";

export async function main(argv: readonly string[]): Promise<number> {
  try {
    if (argv.length === 0) {
      process.stdout.write(rootHelp());
      return 0;
    }
    if (hasHelp(argv)) {
      process.stdout.write(commandHelp(stripRoot(argv)));
      return 0;
    }
    const metadataArgs = stripRoot(argv);
    if (
      metadataArgs.length === 1 &&
      (metadataArgs[0] === "--version" || metadataArgs[0] === "-V")
    ) {
      process.stdout.write(versionText());
      return 0;
    }

    const { root, args } = extractRoot(argv);
    const command = args[0];
    if (command === undefined) {
      throw usageError("command is required");
    }
    switch (command) {
      case "doctor":
        await runDoctor(root, args.slice(1));
        return 0;
      case "init":
        await runInit(root, args.slice(1));
        return 0;
      case "ontology":
      case "object":
      case "graph":
      case "evolution": {
        const config = await loadConfig(root);
        validateRequiredEnvironment(config);
        const client = await ensureClient(root);
        if (command === "ontology") {
          await runOntology(client, args.slice(1));
        } else if (command === "object") {
          await runObject(client, args.slice(1));
        } else if (command === "graph") {
          await runGraph(client, args.slice(1));
        } else {
          await runEvolution(client, args.slice(1));
        }
        return 0;
      }
      default:
        throw usageError("unknown command " + JSON.stringify(command));
    }
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(errorJSON(normalized.error));
    return normalized.exitCode;
  }
}

function hasHelp(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--help" || arg === "-h");
}

function stripRoot(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") {
      index += 1;
      continue;
    }
    result.push(args[index] ?? "");
  }
  return result;
}

process.exitCode = await main(process.argv.slice(2));
