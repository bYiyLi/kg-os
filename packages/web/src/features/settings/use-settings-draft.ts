import { useEffect, useState } from "react";

import type { SettingsCategory, SettingsExtension, SettingsSnapshot } from "./settings-types.js";
import {
  validSettingsExtension,
  validSettingsKey,
  validSettingsOrigin
} from "./settings-validation.js";

export function useSettingsDraft(snapshot: SettingsSnapshot | null, category: SettingsCategory) {
  const [origin, setOrigin] = useState("");
  const [path, setPath] = useState("");
  const [budget, setBudget] = useState("");
  const [extensions, setExtensions] = useState<SettingsExtension[]>([]);
  const [newKey, setNewKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOrigin(snapshot?.saved.server?.public_origin ?? "");
    setPath(snapshot?.saved.cache.path ?? "");
    setBudget(snapshot === null ? "" : String(snapshot.saved.cache.max_size_mb));
    setExtensions(snapshot?.saved.sqlite.extensions.map((item) => ({ ...item })) ?? []);
    setNewKey("");
    setEditingKey(false);
    setError(null);
  }

  useEffect(reset, [snapshot, category]);

  const connectionDirty = origin !== (snapshot?.saved.server?.public_origin ?? "");
  const cacheDirty =
    snapshot !== null &&
    (path !== snapshot.saved.cache.path || budget !== String(snapshot.saved.cache.max_size_mb));
  const extensionsDirty =
    snapshot !== null &&
    JSON.stringify(extensions) !== JSON.stringify(snapshot.saved.sqlite.extensions);
  const storageDirty = cacheDirty || extensionsDirty;
  const dirty = connectionDirty || storageDirty || newKey.length > 0;

  function patch() {
    if (category === "connection") {
      if (!validSettingsOrigin(origin.trim())) {
        setError("invalidOrigin");
        return null;
      }
      return { server: { public_origin: origin.trim() } };
    }
    if (path.trim() === "" || !Number.isSafeInteger(Number(budget)) || Number(budget) <= 0) {
      setError("invalidCache");
      return null;
    }
    if (!extensions.every(validSettingsExtension)) {
      setError("invalidExtension");
      return null;
    }
    return {
      ...(cacheDirty ? { cache: { path: path.trim(), max_size_mb: Number(budget) } } : {}),
      ...(extensionsDirty ? { sqlite: { extensions } } : {})
    };
  }

  function validateKey() {
    if (validSettingsKey(newKey)) return true;
    setError("invalidKey");
    return false;
  }

  return {
    origin,
    setOrigin,
    path,
    setPath,
    budget,
    setBudget,
    extensions,
    setExtensions,
    newKey,
    setNewKey,
    editingKey,
    setEditingKey,
    dirty,
    error,
    patch,
    validateKey,
    reset
  };
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>;
