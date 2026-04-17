"use client";

import { useMemo } from "react";
import { useListObservations } from "@/generated/observations/observations";
import {
  useListHourlyObservations,
  useListDailyObservations,
  useListMonthlyObservations,
} from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";

export type TimeRange = "24h" | "7d" | "30d" | "1y";

function getTimeRange(range: TimeRange): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Auto-selects the best resolution based on time range:
 * - 24h → raw observations
 * - 7d → hourly aggregates
 * - 30d → daily aggregates
 * - 1y → monthly aggregates
 */
export function useHistoryData(range: TimeRange) {
  const { start, end } = useMemo(() => getTimeRange(range), [range]);

  // History charts are a long-lived aggregate view — no background polling.
  // Unit toggle + range change invalidate via params; WebSocket delivers live
  // 24h updates separately.
  const rawQuery = useListObservations(
    { start, end, limit: 10000 },
    { query: { enabled: range === "24h", refetchInterval: CADENCES.none } },
  );

  const hourlyQuery = useListHourlyObservations(
    { start, end },
    { query: { enabled: range === "7d", refetchInterval: CADENCES.none } },
  );

  const dailyQuery = useListDailyObservations(
    { start, end },
    { query: { enabled: range === "30d", refetchInterval: CADENCES.none } },
  );

  const monthlyQuery = useListMonthlyObservations(
    { start, end },
    { query: { enabled: range === "1y", refetchInterval: CADENCES.none } },
  );

  if (range === "24h") {
    const items = rawQuery.data?.data?.items ?? [];
    return {
      data: items
        .map((o) => ({
          time: o.timestamp,
          temp_avg: o.temp_outdoor,
          temp_min: o.temp_outdoor,
          temp_max: o.temp_outdoor,
          humidity_avg: o.humidity_outdoor,
          pressure_avg: o.pressure_rel,
          wind_avg: o.wind_speed,
          wind_gust_max: o.wind_gust,
          rain_max: o.rain_daily,
          solar_avg: o.solar_radiation,
          uv_max: o.uv_index,
        }))
        .reverse(),
      isLoading: rawQuery.isLoading,
      resolution: "raw" as const,
    };
  }

  const query =
    range === "7d" ? hourlyQuery : range === "30d" ? dailyQuery : monthlyQuery;
  const resolution = range === "7d" ? "hourly" : range === "30d" ? "daily" : "monthly";

  const items = query.data?.data ?? [];
  return {
    data: [...items]
      .reverse()
      .map((o) => ({
        time: o.bucket,
        temp_avg: o.temp_outdoor_avg,
        temp_min: o.temp_outdoor_min,
        temp_max: o.temp_outdoor_max,
        humidity_avg: o.humidity_outdoor_avg,
        pressure_avg: o.pressure_rel_avg,
        wind_avg: o.wind_speed_avg,
        wind_gust_max: o.wind_gust_max,
        rain_max: o.rain_daily_max,
        solar_avg: o.solar_radiation_avg,
        uv_max: o.uv_index_max,
      })),
    isLoading: query.isLoading,
    resolution,
  };
}
