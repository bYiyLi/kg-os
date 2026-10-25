import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { VersionHistory } from "./use-version-history.js";

interface FillAttempt {
  scope: string;
  page: string | null;
  count: number;
  pendingSeen: boolean;
  load: () => void;
}

function visibleNavigation(element: HTMLElement): boolean {
  return (
    element.clientHeight > 0 &&
    element.closest('[aria-hidden="true"], [inert]') === null &&
    window.getComputedStyle(element).visibility !== "hidden"
  );
}

function observeNavigation(scroll: HTMLElement, content: HTMLElement, measure: () => void) {
  measure();
  window.addEventListener("resize", measure);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(scroll);
  observer?.observe(content);
  return () => {
    window.removeEventListener("resize", measure);
    observer?.disconnect();
  };
}

export function useHistoryFill({
  history,
  scrollRef,
  contentRef,
  moreRef,
  enabled
}: {
  history: VersionHistory;
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  moreRef: RefObject<HTMLButtonElement | null>;
  enabled: boolean;
}) {
  const [overflowing, setOverflowing] = useState(false);
  const [stalled, setStalled] = useState(false);
  const attempts = useRef(new Set<string>());
  const previous = useRef<FillAttempt | null>(null);
  const blocked = useRef(false);
  const scope = JSON.stringify([
    history.mode,
    history.expandedWorld,
    history.topologyCommits[0]?.state
  ]);
  const page = history.expandedPageKey;
  const count = history.commits.length;
  const reset = useCallback(() => {
    attempts.current.clear();
    previous.current = null;
    blocked.current = false;
    setStalled(false);
  }, []);

  useEffect(reset, [scope, history.available, reset]);
  useEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (scroll === null || content === null) return;
    const measure = () => {
      if (!visibleNavigation(scroll)) return;
      const naturalHeight = scroll.scrollHeight - (moreRef.current?.offsetHeight ?? 0);
      const overflow = naturalHeight > scroll.clientHeight + 1;
      setOverflowing(overflow);
      const attempt = previous.current;
      if (history.loadingMore && attempt !== null) attempt.pendingSeen = true;
      if (!enabled || !history.ready || history.loading || history.loadingMore || history.error)
        return;
      if (
        attempt !== null &&
        attempt.scope === scope &&
        (attempt.pendingSeen ||
          attempt.page !== page ||
          attempt.load !== history.loadMoreExpandedWorld)
      ) {
        previous.current = null;
        if (count <= attempt.count) {
          blocked.current = true;
          setStalled(true);
        }
      }
      if (overflow || !history.canLoadMore || blocked.current || page === null) return;
      const signature = JSON.stringify([scope, page, count]);
      if (attempts.current.has(signature)) return;
      attempts.current.add(signature);
      previous.current = {
        scope,
        page,
        count,
        pendingSeen: false,
        load: history.loadMoreExpandedWorld
      };
      history.loadMoreExpandedWorld();
    };
    return observeNavigation(scroll, content, measure);
  }, [
    enabled,
    history.ready,
    history.loading,
    history.loadingMore,
    history.error,
    history.canLoadMore,
    history.loadMoreExpandedWorld,
    scope,
    page,
    count,
    scrollRef,
    contentRef,
    moreRef
  ]);

  return { overflowing, stalled, reset };
}
