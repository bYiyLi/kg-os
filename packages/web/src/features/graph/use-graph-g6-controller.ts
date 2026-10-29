import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { GraphG6Controller } from "./graph-g6-controller.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useGraphG6Controller(props: GraphSceneProps) {
  const surface = useRef<HTMLDivElement>(null);
  const renderer = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [reduced, setReduced] = useState(reducedMotion);
  const [controller] = useState(
    () =>
      new GraphG6Controller(
        props,
        {
          ready: setReady,
          pins: setPinned,
          scale: setScale
        },
        reduced
      )
  );

  useLayoutEffect(() => {
    if (surface.current === null || renderer.current === null) return;
    controller.mount(renderer.current, surface.current);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            controller.resizeCanvas();
          });
    observer?.observe(renderer.current);
    return () => {
      observer?.disconnect();
      controller.unmount();
    };
  }, [controller]);

  // G6 can settle before React commits newly loaded keyboard proxies. Position
  // them after the commit as well as on subsequent G6 drawing/view events.
  useLayoutEffect(() => {
    if (ready) controller.syncAccessibleNodes();
  }, [controller, ready, props.data]);

  useEffect(() => {
    controller.setProps(props);
  }, [controller, props, ready, pinned]);

  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (media === null) return;
    const changed = () => {
      setReduced(media.matches);
    };
    media.addEventListener("change", changed);
    return () => {
      media.removeEventListener("change", changed);
    };
  }, []);

  useEffect(() => {
    controller.setReduced(reduced);
  }, [controller, reduced]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      controller.refreshColors();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });
    return () => {
      observer.disconnect();
    };
  }, [controller]);

  return { surface, renderer, controller, scale, ready };
}
