import { KGOSDaemonError, KGOSTransportError, type JsonObject, type PublicError } from "@kgos/sdk";

export class CLIError extends Error {
  readonly code: string;
  readonly details: JsonObject | undefined;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode: number, details?: JsonObject) {
    super(message);
    this.name = "CLIError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function usageError(message: string, details?: JsonObject): CLIError {
  return new CLIError("INVALID_ARGUMENT", message, 2, details);
}

export function localIOError(message: string, details?: JsonObject): CLIError {
  return new CLIError("IO_ERROR", message, 2, details);
}

export function parseError(message: string, details?: JsonObject): CLIError {
  return new CLIError("PARSE_ERROR", message, 2, details);
}

export function resourceError(message: string, details?: JsonObject): CLIError {
  return new CLIError("RESOURCE_ERROR", message, 2, details);
}

export function localAuthenticationError(message: string, details?: JsonObject): CLIError {
  return new CLIError("AUTHENTICATION_FAILED", message, 2, details);
}

export function runtimeError(message: string, details?: JsonObject): CLIError {
  return new CLIError("IO_ERROR", message, 2, details);
}

export function targetError(message: string, details?: JsonObject): CLIError {
  return new CLIError("IO_ERROR", message, 3, details);
}

export function normalizeError(error: unknown): { error: PublicError; exitCode: number } {
  if (error instanceof CLIError) {
    const value: PublicError = { code: error.code, message: error.message };
    if (error.details !== undefined) {
      value.details = error.details;
    }
    return { error: value, exitCode: error.exitCode };
  }
  if (error instanceof KGOSDaemonError) {
    const value: PublicError = { code: error.code, message: error.message };
    if (error.details !== undefined) {
      value.details = error.details;
    }
    return { error: value, exitCode: 1 };
  }
  if (error instanceof KGOSTransportError) {
    return {
      error: { code: "IO_ERROR", message: "daemon transport failed" },
      exitCode: 3
    };
  }
  return {
    error: { code: "INTERNAL_ERROR", message: "internal KG OS CLI error" },
    exitCode: 2
  };
}

export function errorJSON(error: PublicError): string {
  return JSON.stringify(error) + "\n";
}
