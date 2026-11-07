import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import { describe, expect, it } from "vitest";

import { diagnosticFailureRef } from "./observability-data.js";

const requestID = "req_" + "a".repeat(32);

describe("diagnostic failure references", () => {
  it("shows a validated public code and trusted request ID", () => {
    expect(
      diagnosticFailureRef(
        new KGOSDaemonError({ code: "IO_ERROR", message: "secret" }, 500, requestID)
      )
    ).toBe(`IO_ERROR · ${requestID}`);
  });

  it("never displays private messages or malformed identifiers", () => {
    expect(
      diagnosticFailureRef(
        new KGOSDaemonError(
          { code: "INVALID secret=token", message: "private/path" },
          500,
          "req_private/credential"
        )
      )
    ).toBe("INTERNAL_ERROR");
    expect(diagnosticFailureRef(new Error("secret url?password=123"))).toBeNull();
  });

  it("distinguishes transport errors without exposing their causes", () => {
    expect(
      diagnosticFailureRef(
        new KGOSTransportError("private connection details", {
          cause: new Error("Authorization: Bearer secret"),
          requestId: requestID
        })
      )
    ).toBe(`TRANSPORT_ERROR · ${requestID}`);
    expect(diagnosticFailureRef(new KGOSTransportError("private details"))).toBe("TRANSPORT_ERROR");
  });
});
