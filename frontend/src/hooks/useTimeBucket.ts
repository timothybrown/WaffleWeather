"use client";

import { useEffect, useState } from "react";

export function getTimeBucket(intervalMs: number, nowMs = Date.now()): number {
  return Math.floor(nowMs / intervalMs);
}

/**
 * Returns a monotonically advancing bucket for the requested wall-clock
 * interval. The timeout is aligned to the next bucket boundary so components
 * that build rolling query windows do not depend on unrelated re-renders.
 */
export function useTimeBucket(intervalMs: number): number {
  const [bucket, setBucket] = useState(() => getTimeBucket(intervalMs));

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const remainder = Date.now() % intervalMs;
      const delay = remainder === 0 ? intervalMs : intervalMs - remainder;
      timeout = setTimeout(() => {
        setBucket(getTimeBucket(intervalMs));
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [intervalMs]);

  return Math.max(bucket, getTimeBucket(intervalMs));
}
