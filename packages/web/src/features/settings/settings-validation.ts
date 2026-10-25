import type { SettingsExtension } from "./settings-types.js";

export function validSettingsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === value.replace(/\/$/u, "")
    );
  } catch {
    return false;
  }
}

export function validSettingsExtension(extension: SettingsExtension): boolean {
  const source = extension.source.trim();
  const remote = source.startsWith("https://");
  const validSource = source.startsWith("/") || remote;
  const archive = /\.(zip|tar\.gz)(?:\?|$)/u.test(source);
  const checksum = extension.sha256 ?? "";
  return (
    validSource &&
    extension.entrypoint.trim().length > 0 &&
    (!remote || /^[a-f0-9]{64}$/u.test(checksum)) &&
    (checksum === "" || /^[a-f0-9]{64}$/u.test(checksum)) &&
    (!archive || (extension.library ?? "").trim().length > 0)
  );
}

export function validSettingsKey(key: string): boolean {
  return key.length > 0 && key.length <= 8192 && !/[\r\n\0]/u.test(key);
}
