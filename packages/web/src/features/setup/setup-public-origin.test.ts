import { expect, it } from "vitest";

import { normalizePublicOrigin } from "./setup-public-origin.js";

it("accepts HTTPS origins and local loopback HTTP, normalizing a trailing slash", () => {
  expect(normalizePublicOrigin("https://kgos.example.com/")).toBe("https://kgos.example.com");
  expect(normalizePublicOrigin("https://kgos.example.com:8443")).toBe(
    "https://kgos.example.com:8443"
  );
  expect(normalizePublicOrigin("http://localhost:5184/")).toBe("http://localhost:5184");
  expect(normalizePublicOrigin("http://127.0.0.1:5184")).toBe("http://127.0.0.1:5184");
  expect(normalizePublicOrigin("http://[::1]:5184/")).toBe("http://[::1]:5184");
});

it.each([
  "",
  "kgos.example.com",
  "ftp://kgos.example.com",
  "http://kgos.example.com",
  "http://10.0.0.1",
  "https://user@kgos.example.com",
  "https://kgos.example.com/mcp",
  "https://kgos.example.com/?key=abc",
  "https://kgos.example.com/?",
  "https://kgos.example.com/#",
  "https://kgos.example.com/#abc",
  "https://kgos.example.com/oauth/authorize",
  "https://kgos.example.com:invalid"
])("rejects unsafe or non-origin values: %s", (value) => {
  expect(normalizePublicOrigin(value)).toBeNull();
});
