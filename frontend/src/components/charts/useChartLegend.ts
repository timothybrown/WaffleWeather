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

  // React docs §"Adjusting state while rendering": this is the recommended
  // pattern for deriving state from props. The ref read+write is guarded by
  // the key-change check, so it cannot recurse, and writing the ref before
  // setVisibility ensures the next render (scheduled by setVisibility) sees
  // the updated key. The lint rule treats render-time ref access as suspect
  // by default — we suppress it here for this specific guarded pattern.
  /* eslint-disable react-hooks/refs */
  if (resetKey !== lastKeyRef.current) {
    lastKeyRef.current = resetKey;
    setVisibility([...initial]);
  }
  /* eslint-enable react-hooks/refs */

  const toggle = useCallback((idx: number) => {
    setVisibility((prev) => {
      const next = prev.slice();
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  return { visibility, toggle };
}
