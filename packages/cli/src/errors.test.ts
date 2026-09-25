import { describe, expect, it } from "vitest";

import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";

import {
  CLIError,
  errorJSON,
  localAuthenticationError,
  localIOError,
  normalizeError,
  parseError,
  resourceError,
  runtimeError,
  targetError,
  usageError
} from "./errors.js";

describe("CLI error mapping", () => {
  it("builds stable local categories", () => {
    expect(usageError("x")).toMatchObject({ code: "INVALID_ARGUMENT", exitCode: 2 });
    expect(localIOError("x")).toMatchObject({ code: "IO_ERROR", exitCode: 2 });
    expect(parseError("x")).toMatchObject({ code: "PARSE_ERROR", exitCode: 2 });
    expect(resourceError("x")).toMatchObject({ code: "RESOURCE_ERROR", exitCode: 2 });
    expect(localAuthenticationError("x")).toMatchObject({
      code: "AUTHENTICATION_FAILED",
      exitCode: 2
    });
    expect(runtimeError("x")).toMatchObject({ code: "IO_ERROR", exitCode: 2 });
    expect(targetError("x")).toMatchObject({ code: "IO_ERROR", exitCode: 3 });
  });

  it("normalizes local, daemon, transport, and unknown failures", () => {
    expect(normalizeError(new CLIError("X", "local", 2, { a: 1 }))).toEqual({
      error: { code: "X", message: "local", details: { a: 1 } },
      exitCode: 2
    });
    expect(
      normalizeError(new KGOSDaemonError({ code: "STATE_NOT_FOUND", message: "missing" }, 404))
    ).toEqual({
      error: { code: "STATE_NOT_FOUND", message: "missing" },
      exitCode: 1
    });
    expect(normalizeError(new KGOSTransportError("socket"))).toEqual({
      error: { code: "IO_ERROR", message: "daemon transport failed" },
      exitCode: 3
    });
    expect(normalizeError(new Error("private"))).toEqual({
      error: { code: "INTERNAL_ERROR", message: "internal KG OS CLI error" },
      exitCode: 2
    });
  });

  it("serializes one-line public errors", () => {
    expect(errorJSON({ code: "X", message: "m" })).toBe('{"code":"X","message":"m"}\n');
  });
});
