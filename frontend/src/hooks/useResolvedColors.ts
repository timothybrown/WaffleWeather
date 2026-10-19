"use client";

import { useEffect, useMemo, useState } from "react";

/** Resolve CSS custom properties to computed hex/rgb values for Canvas rendering. */
export function useResolvedColors(varNames: string[]): Record<string, string> {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setRevision((r) => r + 1);
    mq.addEventListener("change", handler);

    // Also watch for class-based theme changes on documentElement
    const observer = new MutationObserver(handler);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      mq.removeEventListener("change", handler);
      observer.disconnect();
    };
  }, []);

  // Key on the contents so an inline array literal doesn't re-resolve every render.
  const varKey = varNames.join(",");

  return useMemo(() => {
    const style = typeof document !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
    const colors: Record<string, string> = {};
    for (const name of varNames) {
      colors[name] = style?.getPropertyValue(name).trim() || "#888";
    }
    return colors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, varKey]);
}
