import { lstat } from "node:fs/promises";

import { classifyExtensionSource, type ExtensionConfig, type InstanceConfig } from "../config.js";
import type { NativeRuntime } from "../runtime.js";
import { cachedArtifactPresent, regularFile, sha256File } from "./doctor-artifacts.js";
import { doctorCheck, type DoctorCheck } from "./doctor-types.js";

interface ExpectedArtifact {
  kind: "official" | "additional";
  sha256: string;
}

type ArtifactResolution = { artifact: ExpectedArtifact } | { check: DoctorCheck };

export async function diagnoseExtensions(
  extensionsDir: string,
  config: InstanceConfig | undefined,
  runtime: NativeRuntime | undefined
): Promise<DoctorCheck> {
  if (config === undefined || runtime === undefined) {
    return doctorCheck("extensions", {
      status: "info",
      blocking: false,
      message: "extension state cannot be evaluated without valid config and Runtime package"
    });
  }
  if (!(await regularFileSetReady(extensionsDir))) {
    return doctorCheck("extensions", {
      status: "error",
      blocking: true,
      message: "extensions cache directory is missing"
    });
  }
  const resolved = await expectedArtifacts(config, runtime);
  if ("check" in resolved) return resolved.check;
  const missing = await missingArtifacts(extensionsDir, resolved.artifacts);
  if (missing.length !== 0) {
    return doctorCheck("extensions", {
      status: "error",
      blocking: true,
      message: "one or more extension artifacts are not materialized",
      details: { missing }
    });
  }
  return doctorCheck("extensions", {
    status: "ok",
    blocking: false,
    message: "official and additional extension artifacts are materialized",
    details: {
      official: runtime.extensions.length,
      additional: config.sqlite?.extensions?.length ?? 0
    }
  });
}

async function regularFileSetReady(directory: string): Promise<boolean> {
  try {
    return (await lstat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function expectedArtifacts(
  config: InstanceConfig,
  runtime: NativeRuntime
): Promise<{ artifacts: ExpectedArtifact[] } | { check: DoctorCheck }> {
  const artifacts: ExpectedArtifact[] = runtime.extensions.map((artifact) => ({
    kind: "official",
    sha256: artifact.sha256
  }));
  for (const extension of config.sqlite?.extensions ?? []) {
    const resolved = await resolveAdditionalArtifact(extension);
    if ("check" in resolved) return resolved;
    artifacts.push(resolved.artifact);
  }
  return { artifacts };
}

async function resolveAdditionalArtifact(extension: ExtensionConfig): Promise<ArtifactResolution> {
  const sourceClass = classifyExtensionSource(extension.source);
  if (sourceClass.remote) {
    return {
      artifact: {
        kind: "additional",
        sha256: extension.sha256 ?? ""
      }
    };
  }
  if (!(await regularFile(extension.source))) {
    return {
      check: doctorCheck("extensions", {
        status: "error",
        blocking: true,
        message: "additional extension source is unavailable",
        details: { source: extension.source }
      })
    };
  }
  return await hashLocalAdditionalExtension(extension);
}

async function hashLocalAdditionalExtension(
  extension: ExtensionConfig
): Promise<ArtifactResolution> {
  try {
    const sourceHash = await sha256File(extension.source);
    if (extension.sha256 !== undefined && extension.sha256 !== sourceHash) {
      return configuredHashMismatch(extension, sourceHash);
    }
    return {
      artifact: {
        kind: "additional",
        sha256: extension.sha256 ?? sourceHash
      }
    };
  } catch (error) {
    return {
      check: doctorCheck("extensions", {
        status: "error",
        blocking: true,
        message: "additional extension source cannot be read",
        details: {
          source: extension.source,
          reason: error instanceof Error ? error.message : "read failed"
        }
      })
    };
  }
}

function configuredHashMismatch(extension: ExtensionConfig, actual: string): ArtifactResolution {
  return {
    check: doctorCheck("extensions", {
      status: "error",
      blocking: true,
      message: "additional extension source failed configured SHA-256",
      details: {
        source: extension.source,
        expected: extension.sha256 ?? "",
        actual
      }
    })
  };
}

async function missingArtifacts(
  directory: string,
  artifacts: readonly ExpectedArtifact[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const artifact of artifacts) {
    if (!(await cachedArtifactPresent(directory, artifact.sha256))) {
      missing.push(artifact.kind + ":" + artifact.sha256);
    }
  }
  return missing;
}
