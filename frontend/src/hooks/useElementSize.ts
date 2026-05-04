import { useCallback, useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

export interface UseElementSizeResult<T extends Element> {
  /** Callback ref — attach to the element you want to observe.
   *  Re-attaches the ResizeObserver whenever the element changes (mount,
   *  unmount, conditional remount), so it works even when the observed
   *  element is gated by a parent's loading/data state. */
  ref: (el: T | null) => void;
  size: ElementSize;
}

/**
 * Observes a DOM element via ResizeObserver and returns its content-rect
 * size, debounced to avoid thrashing during resize-drag. Initial size is
 * { 0, 0 } until the first observation fires.
 *
 * Uses a callback-ref pattern (not a ref object) so the observer attaches
 * the moment the element mounts — even if the parent renders it conditionally
 * (e.g. only after a loading spinner clears).
 */
export function useElementSize<T extends Element>(
  debounceMs = 100,
): UseElementSizeResult<T> {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ref = useCallback(
    (el: T | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setSize({ width, height });
        }, debounceMs);
      });

      observer.observe(el);
      observerRef.current = observer;
    },
    [debounceMs],
  );

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { ref, size };
}
