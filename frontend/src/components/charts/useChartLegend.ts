import { useCallback, useRef, useState } from "react";

export interface ChartLegendState {
  visibility: boolean[];
  toggle: (idx: number) => void;
}

/**
 * Visibility state for a chart's legend chips.
 *
 * - `initial` is consulted on mount and whenever `resetKey` changes.
 * - Without a `resetKey`, state persists across re-renders for the session,
 *   even if the `initial` array reference changes (caller-side memoization
 *   is therefore not required to avoid resets).
 * - With a `resetKey`, a change in the key re-seeds visibility from the
 *   then-current `initial`. Used by the Temperature chart to restore
 *   range-appropriate defaults on resolution change.
 */
export function useChartLegend(
  initial: boolean[],
  resetKey?: string | number,
): ChartLegendState {
  const [visibility, setVisibility] = useState<boolean[]>(() => [...initial]);
  const lastKeyRef = useRef(resetKey);

  if (resetKey !== lastKeyRef.current) {
    lastKeyRef.current = resetKey;
    setVisibility([...initial]);
  }

  const toggle = useCallback((idx: number) => {
    setVisibility((prev) => {
      const next = prev.slice();
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  return { visibility, toggle };
}
