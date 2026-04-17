"use client";

import { useMemo } from "react";
import { useListObservations } from "@/generated/observations/observations";
import type { Observation, ObservationPage } from "@/generated/models";
import { CADENCES } from "@/lib/queryCadences";

export type TrendDirection = "up" | "down" | "flat" | null;

interface Trends {
  temp_outdoor: TrendDirection;
  humidity_outdoor: TrendDirection;
  pressure_rel: TrendDirection;
  wind_speed: TrendDirection;
  rain_rate: TrendDirection;
  solar_radiation: TrendDirection;
  uv_index: TrendDirection;
}

const THRESHOLDS: Record<keyof Trends, number> = {
  temp_outdoor: 0.2,
  humidity_outdoor: 1,
  pressure_rel: 0.1,
  wind_speed: 1,
  rain_rate: 0.1,
  solar_radiation: 10,
  uv_index: 0.1,
};

function computeTrend(
  first: number | null | undefined,
  last: number | null | undefined,
  threshold: number,
): TrendDirection {
  if (first == null || last == null) return null;
  const diff = last - first;
  if (Math.abs(diff) < threshold) return "flat";
  return diff > 0 ? "up" : "down";
}

const EMPTY_TRENDS: Trends = {
  temp_outdoor: null,
  humidity_outdoor: null,
  pressure_rel: null,
  wind_speed: null,
  rain_rate: null,
  solar_radiation: null,
  uv_index: null,
};

export function useTrends(): Trends {
  const start = useMemo(
    () => new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    // Re-compute every 60 seconds rather than every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(Date.now() / 60_000)],
  );

  const { data: response } = useListObservations(
    { start, limit: 1000 },
    { query: { refetchInterval: CADENCES.summary } },
  );

  return useMemo(() => {
    const page = (response as { data?: ObservationPage } | undefined)?.data;
    const items: Observation[] | undefined = page?.items;
    if (!items || items.length < 2) return EMPTY_TRENDS;

    const first = items[items.length - 1]; // oldest (API returns newest first)
    const last = items[0]; // newest

    const trends: Trends = {} as Trends;
    for (const key of Object.keys(THRESHOLDS) as (keyof Trends)[]) {
      trends[key] = computeTrend(
        first[key] as number | null | undefined,
        last[key] as number | null | undefined,
        THRESHOLDS[key],
      );
    }
    return trends;
  }, [response]);
}
