"use client";

import { useCallback, useMemo } from "react";
import { useListObservations } from "@/generated/observations/observations";
import {
  useListHourlyObservations,
  useListDailyObservations,
  useListMonthlyObservations,
} from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";
import { periodForAnchor, type Range } from "@/lib/historyPeriod";

export type Mode = "live" | "picked";

export interface HistoryDataInput {
  range: Range;
  mode: Mode;
  anchor?: string;
  timezone: string;
}

function rollingWindow(range: Range, now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);
  switch (range) {
    case "day":
      start.setHours(start.getHours() - 24);
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setDate(start.getDate() - 30);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start, end };
}

function serializeInclusiveEnd(end: Date): string {
  return new Date(end.getTime() - 1).toISOString();
}

function serializePickedInclusiveEnd(end: Date, start: Date): string {
  if (end.getTime() <= start.getTime()) {
    return start.toISOString();
  }

  return serializeInclusiveEnd(end);
}

/**
 * Auto-selects the best resolution based on time range:
 * - day → raw observations
 * - week → hourly aggregates
 * - month → daily aggregates
 * - year → monthly aggregates
 */
export function useHistoryData(input: HistoryDataInput) {
  const { range, mode, anchor, timezone } = input;
  const { start, end } = useMemo(() => {
    const now = new Date();

    if (mode === "picked" && anchor) {
      const period = periodForAnchor(anchor, range, timezone, now);
      const clampedEnd = period.isCurrent
        ? new Date(Math.min(period.end.getTime(), now.getTime()))
        : period.end;

      return {
        start: period.start.toISOString(),
        end: serializePickedInclusiveEnd(clampedEnd, period.start),
      };
    }

    const window = rollingWindow(range, now);
    return {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
    };
  }, [range, mode, anchor, timezone]);

  // History charts are a long-lived aggregate view — no background polling.
  // Unit toggle + range change invalidate via params; WebSocket delivers live
  // 24h updates separately.
  const rawQuery = useListObservations(
    { start, end, limit: 10000 },
    { query: { enabled: range === "day", refetchInterval: CADENCES.none } },
  );

  const hourlyQuery = useListHourlyObservations(
    { start, end },
    { query: { enabled: range === "week", refetchInterval: CADENCES.none } },
  );

  const dailyQuery = useListDailyObservations(
    { start, end },
    { query: { enabled: range === "month", refetchInterval: CADENCES.none } },
  );

  const monthlyQuery = useListMonthlyObservations(
    { start, end },
    { query: { enabled: range === "year", refetchInterval: CADENCES.none } },
  );

  const activeQuery =
    range === "day"
      ? rawQuery
      : range === "week"
        ? hourlyQuery
        : range === "month"
          ? dailyQuery
          : monthlyQuery;

  const activeRefetch = activeQuery.refetch;
  const refetch = useCallback(() => {
    return activeRefetch();
  }, [activeRefetch]);

  if (range === "day") {
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
      isLoading: activeQuery.isLoading,
      isError: activeQuery.isError,
      error: activeQuery.error,
      resolution: "raw" as const,
      refetch,
    };
  }

  const query =
    range === "week" ? hourlyQuery : range === "month" ? dailyQuery : monthlyQuery;
  const resolution = range === "week" ? "hourly" : range === "month" ? "daily" : "monthly";

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
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    error: activeQuery.error,
    resolution,
    refetch,
  };
}
