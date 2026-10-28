import { useEffect, useRef, useState } from "react";

import type { VersionHistory } from "./use-version-history.js";

export function useHistoryDialog(history: VersionHistory, clearDomain: () => void) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!history.available) setOpen(false);
  }, [history.available]);
  return {
    open: open && history.available,
    setOpen,
    trigger,
    onOpenHistory: (name: string, button: HTMLButtonElement) => {
      trigger.current = button;
      history.setMode("world");
      history.openHistory(name);
      setOpen(true);
    },
    onOpenAllHistory: (button: HTMLButtonElement) => {
      trigger.current = button;
      history.setMode("all");
      setOpen(true);
    },
    history: {
      ...history,
      selectWorldCommit: (name: string, state: string) => {
        history.selectWorldSnapshot(name, state, clearDomain);
      }
    }
  };
}
