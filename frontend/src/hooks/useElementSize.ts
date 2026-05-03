import { useEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Observes a ref'd element via ResizeObserver and returns its content-rect
 * size, debounced to avoid thrashing during resize-drag. Initial size is
 * { 0, 0 } until the first observation fires.
 */
export function useElementSize<T extends Element>(
  ref: RefObject<T | null>,
  debounceMs = 100,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setSize({ width, height });
      }, debounceMs);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref, debounceMs]);

  return size;
}
