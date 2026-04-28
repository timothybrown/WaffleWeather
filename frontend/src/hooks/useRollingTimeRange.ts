"use client";

import { useMemo } from "react";
import { useTimeBucket } from "./useTimeBucket";

export interface RollingTimeRange {
  start: string;
  end: string;
}

export function getRollingTimeRange(durationMs: number, now = new Date()): RollingTimeRange {
  return {
    start: new Date(now.getTime() - durationMs).toISOString(),
    end: now.toISOString(),
  };
}

export function useRollingTimeRange(
  durationMs: number,
  refreshMs = 60_000,
): RollingTimeRange {
  const bucket = useTimeBucket(refreshMs);

  return useMemo(
    () => getRollingTimeRange(durationMs, new Date(bucket * refreshMs)),
    [durationMs, refreshMs, bucket],
  );
}
