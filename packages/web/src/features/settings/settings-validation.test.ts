import { expect, it } from "vitest";

import {
  validSettingsExtension,
  validSettingsKey,
  validSettingsOrigin
} from "./settings-validation.js";

it.each([
  "https://kg.example.com",
  "https://kg.example.com/",
  "https://kg.example.com:8443",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://[::1]:8787"
])("accepts supported public or loopback origins: %s", (value) => {
  expect(validSettingsOrigin(value)).toBe(true);
});

it.each([
  "",
  "not-a-url",
  "http://kg.example.com",
  "https://name:password@kg.example.com",
  "https://kg.example.com/path",
  "https://kg.example.com?query=1",
  "https://kg.example.com#fragment",
  "file:///tmp/kgos",
  "ftp://kg.example.com"
])("rejects unsupported or ambiguous origins: %s", (value) => {
  expect(validSettingsOrigin(value)).toBe(false);
});

it("accepts a local additional library without an unnecessary checksum", () => {
  expect(
    validSettingsExtension({
      source: "/opt/extensions/example.so",
      entrypoint: "sqlite3_example_init"
    })
  ).toBe(true);
});

it("requires a valid checksum for remote artifacts", () => {
  const base = { source: "https://example.com/extension.so", entrypoint: "sqlite3_example_init" };
  expect(validSettingsExtension(base)).toBe(false);
  expect(validSettingsExtension({ ...base, sha256: "a".repeat(64) })).toBe(true);
  expect(validSettingsExtension({ ...base, sha256: "A".repeat(64) })).toBe(false);
  expect(validSettingsExtension({ ...base, sha256: "abc" })).toBe(false);
});

it("requires an exact library within additional extension archives", () => {
  const base = {
    source: "https://example.com/extension.tar.gz",
    entrypoint: "sqlite3_example_init",
    sha256: "1".repeat(64)
  };
  expect(validSettingsExtension(base)).toBe(false);
  expect(validSettingsExtension({ ...base, library: "lib/extension.so" })).toBe(true);
});

it.each([
  { source: "relative/example.so", entrypoint: "sqlite3_example_init" },
  { source: "http://example.com/example.so", entrypoint: "sqlite3_example_init" },
  { source: "/opt/example.so", entrypoint: " " },
  { source: "/opt/example.zip", entrypoint: "sqlite3_example_init", library: " " }
])("rejects incomplete additional extension configurations", (value) => {
  expect(validSettingsExtension(value)).toBe(false);
});

it("keeps credential input bounded and free of line breaks or NUL", () => {
  expect(validSettingsKey("valid-test-credential")).toBe(true);
  expect(validSettingsKey("a".repeat(8192))).toBe(true);
  expect(validSettingsKey("a".repeat(8193))).toBe(false);
  expect(validSettingsKey("")).toBe(false);
  expect(validSettingsKey("line\nbreak")).toBe(false);
  expect(validSettingsKey("line\rbreak")).toBe(false);
  expect(validSettingsKey("nul\0byte")).toBe(false);
});
