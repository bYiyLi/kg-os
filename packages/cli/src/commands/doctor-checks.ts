import { access, lstat } from "node:fs/promises";

import { KGOSClient, KGOS_VERSION } from "@kgos/sdk";

import { loadConfig, validateRequiredEnvironment, type InstanceConfig } from "../config.js";
import { CLIError } from "../errors.js";
import { isInitializationComplete } from "../paths.js";
import {
  endpointReachable,
  readLocator,
  readToken,
  resolveNativeRuntime,
  type NativeRuntime,
  type RuntimeLocator
} from "../runtime.js";
import { regularFile } from "./doctor-artifacts.js";
import { doctorCheck as check, type DoctorCheck } from "./doctor-types.js";

export type DirectoryState = "missing" | "directory" | "invalid";

export async function directoryState(path: string): Promise<DirectoryState> {
  try {
    return (await lstat(path)).isDirectory() ? "directory" : "invalid";
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "missing";
    return "invalid";
  }
}

export function workspaceCheck(path: string, state: DirectoryState): DoctorCheck {
  if (state === "directory") {
    return check("workspace", {
      status: "ok",
      blocking: false,
      message: "Workspace Root is a directory",
      details: { path }
    });
  }
  return check("workspace", {
    status: "error",
    blocking: true,
    message:
      state === "missing" ? "Workspace Root does not exist" : "Workspace Root is not a directory",
    details: { path }
  });
}

export function instanceCheck(path: string, state: DirectoryState): DoctorCheck {
  if (state === "directory") {
    return check("instance", {
      status: "ok",
      blocking: false,
      message: "Instance Directory exists",
      details: { path }
    });
  }
  return check("instance", {
    status: "error",
    blocking: true,
    message:
      state === "missing"
        ? "Instance Directory does not exist"
        : "Instance path is not a directory",
    details: { path }
  });
}

export function legacyCheck(legacy: boolean): DoctorCheck {
  return legacy
    ? check("legacy", {
        status: "error",
        blocking: true,
        message: "legacy v0.1.x root-is-Instance layout detected"
      })
    : check("legacy", {
        status: "ok",
        blocking: false,
        message: "no legacy root-is-Instance layout detected"
      });
}

export async function diagnoseConfig(
  root: string,
  instanceState: DirectoryState
): Promise<{ check: DoctorCheck; config?: InstanceConfig }> {
  if (instanceState !== "directory") {
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
      check: check("config", {
        status: "ok",
        blocking: false,
        message: "config.toml is valid"
      }),
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

export async function diagnoseRuntimePackage(): Promise<{
  check: DoctorCheck;
  runtime?: NativeRuntime;
}> {
  try {
    const runtime = await resolveNativeRuntime();
    return {
      check: check("runtime", {
        status: "ok",
        blocking: false,
        message: "native Runtime package is valid",
        details: { package: runtime.name, version: runtime.version }
      }),
      runtime
    };
  } catch (error) {
    return {
      check: check("runtime", {
        status: "error",
        blocking: true,
        message: diagnosticMessage(error)
      })
    };
  }
}

export function diagnoseEnvironment(config: InstanceConfig | undefined): DoctorCheck {
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

export async function diagnoseCredential(
  root: string,
  authPath: string
): Promise<{ check: DoctorCheck; exists: boolean }> {
  if (!(await exists(authPath))) {
    return {
      exists: false,
      check: check("credential", {
        status: "error",
        blocking: true,
        message: "auth.json is missing"
      })
    };
  }
  try {
    await readToken(root);
    return {
      exists: true,
      check: check("credential", {
        status: "ok",
        blocking: false,
        message: "auth.json is readable"
      })
    };
  } catch (error) {
    return {
      exists: true,
      check: check("credential", {
        status: "error",
        blocking: true,
        message: diagnosticMessage(error)
      })
    };
  }
}

export async function diagnoseDatabase(path: string): Promise<DoctorCheck> {
  if (await regularFile(path)) {
    return check("database", { status: "ok", blocking: false, message: "kgos.db exists" });
  }
  return check("database", {
    status: "error",
    blocking: true,
    message: "kgos.db is missing"
  });
}

export async function diagnoseInitialization(root: string): Promise<DoctorCheck> {
  try {
    if (await isInitializationComplete(root)) {
      return check("initialization", {
        status: "ok",
        blocking: false,
        message: "init completion marker is valid"
      });
    }
    return check("initialization", {
      status: "error",
      blocking: true,
      message: "initialization has not completed"
    });
  } catch (error) {
    return check("initialization", {
      status: "error",
      blocking: true,
      message: diagnosticMessage(error)
    });
  }
}

export async function diagnoseDaemon(
  root: string,
  instanceState: DirectoryState,
  authExists: boolean
): Promise<DoctorCheck> {
  if (instanceState !== "directory") return stoppedDaemonCheck();
  let locator: RuntimeLocator | undefined;
  try {
    locator = await readLocator(root);
  } catch (error) {
    return unavailableDaemonCheck(diagnosticMessage(error));
  }
  if (locator === undefined) return stoppedDaemonCheck();
  return await diagnoseLocatedDaemon(root, locator, authExists);
}

async function diagnoseLocatedDaemon(
  root: string,
  locator: RuntimeLocator,
  authExists: boolean
): Promise<DoctorCheck> {
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
  if (!authExists) return unavailableDaemonCheck("running daemon has no readable local credential");
  return await authenticateDaemon(root, locator);
}

async function authenticateDaemon(root: string, locator: RuntimeLocator): Promise<DoctorCheck> {
  try {
    const token = await readToken(root);
    const client = new KGOSClient({ endpoint: locator.endpoint ?? "", token });
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
      endpoint: locator.endpoint ?? "",
      pid: locator.pid,
      version: locator.version
    }
  });
}

function stoppedDaemonCheck(): DoctorCheck {
  return check("daemon", {
    status: "info",
    blocking: false,
    message: "daemon is stopped",
    details: { state: "stopped" }
  });
}

function unavailableDaemonCheck(message: string): DoctorCheck {
  return check("daemon", {
    status: "error",
    blocking: true,
    message,
    details: { state: "unavailable" }
  });
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
