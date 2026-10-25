import { useCallback, useEffect, useRef, useState } from "react";

import {
  readSettings,
  SettingsRequestError,
  updateEmbeddingKey,
  updateSettings
} from "./settings-api.js";
import type { SettingsFetch, SettingsPatch, SettingsSnapshot } from "./settings-types.js";

export type SettingsMessage = "saved" | "loadFailed" | "saveFailed" | "conflict" | "unknownResult";

function failureMessage(error: unknown): SettingsMessage {
  if (error instanceof SettingsRequestError) {
    if (error.status === 409) return "conflict";
    return error.status >= 500 ? "unknownResult" : "saveFailed";
  }
  return "unknownResult";
}

export function useSettingsData(open: boolean, fetcher: SettingsFetch | null) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<SettingsMessage | null>(null);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const writing = useRef(false);
  const blocked = useRef(false);

  useEffect(() => {
    generation.current += 1;
    setSnapshot(null);
    setMessage(null);
    if (!open || fetcher === null) return;
    const controller = new AbortController();
    setLoading(true);
    void readSettings(fetcher, controller.signal)
      .then(
        (next) => {
          if (!controller.signal.aborted) {
            blocked.current = false;
            setSnapshot(next);
          }
        },
        () => {
          if (!controller.signal.aborted) setMessage("loadFailed");
        }
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [open, fetcher, reload]);

  const write = useCallback(
    async (patch: SettingsPatch | string) => {
      if (snapshot === null || fetcher === null || writing.current || blocked.current) return false;
      writing.current = true;
      const current = generation.current;
      setBusy(true);
      setMessage(null);
      try {
        const next =
          typeof patch === "string"
            ? await updateEmbeddingKey(fetcher, snapshot.revision, patch)
            : await updateSettings(fetcher, snapshot.revision, patch);
        if (generation.current !== current) return false;
        setSnapshot(next);
        setMessage("saved");
        return true;
      } catch (error) {
        if (generation.current === current) {
          const failure = failureMessage(error);
          blocked.current = failure === "conflict" || failure === "unknownResult";
          setMessage(failure);
        }
        return false;
      } finally {
        writing.current = false;
        if (generation.current === current) setBusy(false);
      }
    },
    [snapshot, fetcher]
  );

  return {
    snapshot,
    loading,
    busy,
    message,
    writeBlocked: message === "conflict" || message === "unknownResult",
    write,
    reload: () => {
      setReload((value) => value + 1);
    }
  };
}
