import { access } from "node:fs/promises";
import { join } from "node:path";

import { KGOSClient, KGOS_VERSION, type JsonObject } from "@kgos/sdk";

import { parseOptions } from "../args.js";
import {
  loadConfig,
  validateRequiredEnvironment,
  validateRootShape,
  type InstanceConfig
} from "../config.js";
import { CLIError, usageError } from "../errors.js";
import { outputJSON } from "../io.js";
import {
  endpointReachable,
  readLocator,
  readToken,
  resolveNativeRuntime,
  type RuntimeLocator
} from "../runtime.js";

type CheckStatus = "ok" | "info" | "error";

interface DoctorCheck {
  id: string;
  status: CheckStatus;
  blocking: boolean;
  message: string;
  details?: JsonObject;
}

interface DoctorResult {
  ready: boolean;
  root: string;
  checks: DoctorCheck[];
}

interface CheckInput {
  status: CheckStatus;
  blocking: boolean;
  message: string;
  details?: JsonObject;
}

export async function runDoctor(root: string, args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args, { boolean: ["--json"] });
  if (parsed.positionals.length !== 0) {
    throw usageError("doctor does not accept positional arguments");
  }
  const result = await diagnose(root);
  if (parsed.booleans.has("--json")) {
    outputJSON(result, false);
    return;
  }
  for (const check of result.checks) {
    process.stdout.write(
      "[" +
        check.status +
        "] " +
        check.id +
        ": " +
        check.message +
        (check.blocking ? " (blocking)" : "") +
        "\n"
    );
  }
  process.stdout.write(result.ready ? "ready\n" : "not ready\n");
}

export async function diagnose(root: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const rootState = await validateRootShape(root);
  if (rootState === "missing") {
    checks.push(
      check("root", { status: "error", blocking: true, message: "Instance Root does not exist" })
    );
  } else {
    checks.push(
      check("root", { status: "ok", blocking: false, message: "Instance Root is a directory" })
    );
  }

  const configDiagnostic = await diagnoseConfig(root, rootState);
  checks.push(configDiagnostic.check);
  const config = configDiagnostic.config;

  checks.push(await diagnoseRuntimePackage());
  checks.push(diagnoseEnvironment(config));

  const authExists = await exists(join(root, "auth.json"));
  checks.push(
    authExists
      ? check("credential", { status: "ok", blocking: false, message: "auth.json exists" })
      : check("credential", {
          status: "info",
          blocking: false,
          message: "auth.json will be created on first daemon startup"
        })
  );
  const databaseExists = await exists(join(root, "kgos.db"));
  checks.push(
    databaseExists
      ? check("database", { status: "ok", blocking: false, message: "kgos.db exists" })
      : check("database", {
          status: "info",
          blocking: false,
          message: "kgos.db will be created on first daemon startup"
        })
  );

  if (rootState === "directory") {
    checks.push(await diagnoseDaemon(root, authExists));
  } else {
    checks.push(
      check("daemon", {
        status: "info",
        blocking: false,
        message: "daemon is stopped",
        details: { state: "stopped" }
      })
    );
  }

  return {
    ready: !checks.some((item) => item.blocking && item.status === "error"),
    root,
    checks
  };
}

async function diagnoseRuntimePackage(): Promise<DoctorCheck> {
  try {
    const runtime = await resolveNativeRuntime();
    return check("runtime", {
      status: "ok",
      blocking: false,
      message: "native Runtime package is valid",
      details: { package: runtime.name, version: runtime.version }
    });
  } catch (error) {
    return check("runtime", {
      status: "error",
      blocking: true,
      message: diagnosticMessage(error)
    });
  }
}

function diagnoseEnvironment(config: InstanceConfig | undefined): DoctorCheck {
  if (config === undefined) {
    return check("environment", {
      status: "info",
      blocking: false,
      message: "environment cannot be evaluated without valid config"
    });
  }
  try {
    validateRequiredEnvironment(config);
    return check("environment", {
      status: "ok",
      blocking: false,
      message: "required environment is available"
    });
  } catch (error) {
    return check("environment", {
      status: "error",
      blocking: true,
      message: diagnosticMessage(error)
    });
  }
}

async function diagnoseConfig(
  root: string,
  rootState: "missing" | "directory"
): Promise<{ check: DoctorCheck; config?: InstanceConfig }> {
  if (rootState !== "directory") {
    return {
      check: check("config", {
        status: "error",
        blocking: true,
        message: "config.toml is unavailable"
      })
    };
  }
  try {
    const config = await loadConfig(root);
    return {
      check: check("config", { status: "ok", blocking: false, message: "config.toml is valid" }),
      config
    };
  } catch (error) {
    return {
      check: check("config", {
        status: "error",
        blocking: true,
        message: diagnosticMessage(error)
      })
    };
  }
}

async function diagnoseDaemon(root: string, authExists: boolean): Promise<DoctorCheck> {
  let locator: RuntimeLocator | undefined;
  try {
    locator = await readLocator(root);
  } catch (error) {
    return check("daemon", {
      status: "error",
      blocking: true,
      message: diagnosticMessage(error),
      details: { state: "unavailable" }
    });
  }
  if (locator === undefined) {
    return check("daemon", {
      status: "info",
      blocking: false,
      message: "daemon is stopped",
      details: { state: "stopped" }
    });
  }
  if (locator.version !== KGOS_VERSION) {
    return check("daemon", {
      status: "error",
      blocking: true,
      message: "active Runtime version is incompatible",
      details: {
        state: "version_mismatch",
        daemonVersion: locator.version,
        cliVersion: KGOS_VERSION
      }
    });
  }
  if (locator.endpoint === undefined) {
    return check("daemon", {
      status: "info",
      blocking: false,
      message: "daemon is starting",
      details: { state: "starting", pid: locator.pid, version: locator.version }
    });
  }
  if (!(await endpointReachable(locator.endpoint))) {
    return check("daemon", {
      status: "error",
      blocking: true,
      message: "daemon endpoint is unavailable",
      details: {
        state: "unavailable",
        endpoint: locator.endpoint,
        pid: locator.pid,
        version: locator.version
      }
    });
  }
  if (!authExists) {
    return check("daemon", {
      status: "error",
      blocking: true,
      message: "running daemon has no readable local credential",
      details: { state: "unavailable" }
    });
  }
  try {
    const token = await readToken(root);
    const client = new KGOSClient({ endpoint: locator.endpoint, token });
    await client.evolution.overview();
  } catch (error) {
    return check("daemon", {
      status: "error",
      blocking: true,
      message: "daemon authentication check failed",
      details: { state: "unavailable", reason: diagnosticMessage(error) }
    });
  }
  return check("daemon", {
    status: "ok",
    blocking: false,
    message: "daemon is running and authenticated",
    details: {
      state: "running",
      endpoint: locator.endpoint,
      pid: locator.pid,
      version: locator.version
    }
  });
}

function check(id: string, input: CheckInput): DoctorCheck {
  const result: DoctorCheck = {
    id,
    status: input.status,
    blocking: input.blocking,
    message: input.message
  };
  if (input.details !== undefined) {
    result.details = input.details;
  }
  return result;
}

function diagnosticMessage(error: unknown): string {
  return error instanceof CLIError || error instanceof Error ? error.message : "diagnostic failed";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
