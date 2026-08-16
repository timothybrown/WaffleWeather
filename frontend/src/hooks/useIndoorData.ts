"use client";

import { useCallback, useMemo } from "react";
import { useListSensorObservations } from "@/generated/sensors/sensors";
import type { SensorMeta, SensorReading } from "@/generated/models";
import { CADENCES } from "@/lib/queryCadences";
import { periodForAnchor, type Range } from "@/lib/historyPeriod";

export type Mode = "live" | "picked";

export type Resolution = "raw" | "hourly" | "daily" | "monthly";

export interface IndoorDataInput {
  range: Range;
  mode: Mode;
  anchor?: string;
  timezone: string;
}

export interface IndoorChartRow {
  time: string;
  temp_avg?: number | null;
  temp_min?: number | null;
  temp_max?: number | null;
  humidity_avg?: number | null;
}

const RESOLUTION_FOR_RANGE: Record<Range, Resolution> = {
  day: "raw",
  week: "hourly",
  month: "daily",
  year: "monthly",
};

const EMPTY_ROWS: SensorReading[] = [];
const EMPTY_SENSORS: SensorMeta[] = [];

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

function mapRow(row: SensorReading, resolution: Resolution): IndoorChartRow {
  if (resolution === "raw") {
    return {
      time: row.timestamp ?? "",
      temp_avg: row.temp,
      temp_min: row.temp,
      temp_max: row.temp,
      humidity_avg: row.humidity,
    };
  }

  return {
    time: row.bucket ?? "",
    temp_avg: row.temp_avg,
    temp_min: row.temp_min,
    temp_max: row.temp_max,
    humidity_avg: row.humidity_avg,
  };
}

export function useIndoorData(input: IndoorDataInput) {
  const { range, mode, anchor, timezone } = input;
  const resolution = RESOLUTION_FOR_RANGE[range];

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

  const query = useListSensorObservations(
    {
      start,
      end,
      granularity: resolution,
      ...(resolution === "raw" ? { limit: 10000 } : {}),
    },
    { query: { refetchInterval: CADENCES.none } },
  );

  const activeRefetch = query.refetch;
  const refetch = useCallback(() => {
    return activeRefetch();
  }, [activeRefetch]);

  const rows = query.data?.data?.rows ?? EMPTY_ROWS;
  const sensors = query.data?.data?.sensors ?? EMPTY_SENSORS;

  const data = useMemo(
    () => [...rows].reverse().map((row) => mapRow(row, resolution)),
    [rows, resolution],
  );

  return {
    data,
    sensors,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    resolution,
    refetch,
  };
}
