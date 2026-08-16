"use client";

import { useMemo } from "react";
import { useListSensorObservations } from "@/generated/sensors/sensors";
import type { SensorReading } from "@/generated/models";
import { useRollingTimeRange } from "@/hooks/useRollingTimeRange";
import { CADENCES } from "@/lib/queryCadences";
import { useWebSocket } from "@/providers/WebSocketProvider";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const TREND_MS = 15 * 60 * 1000;
const TICK_MS = 60_000;
const EMPTY_ROWS: SensorReading[] = [];

interface IndoorCurrent {
  temp: number | null;
  humidity: number | null;
  tempTrend: number | null;
  humidityTrend: number | null;
  tempSparkline: (number | null)[];
  humiditySparkline: (number | null)[];
  windowStart: string;
  isLoading: boolean;
}

function timestampMs(row: SensorReading): number | null {
  if (!row.timestamp) return null;
  const ms = Date.parse(row.timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function metricTrend(
  orderedRows: SensorReading[],
  key: "temp" | "humidity",
): number | null {
  const newest = orderedRows.at(-1);
  if (!newest) return null;

  const newestTime = timestampMs(newest);
  const newestValue = newest[key];
  if (newestTime == null || newestValue == null) return null;

  const cutoff = newestTime - TREND_MS;
  const older = [...orderedRows]
    .reverse()
    .find((row) => {
      const ms = timestampMs(row);
      return ms != null && ms <= cutoff && row[key] != null;
    });

  const olderValue = older?.[key];
  if (olderValue == null) return null;

  return newestValue - olderValue;
}

export function useIndoorCurrent(): IndoorCurrent {
  const { start, end } = useRollingTimeRange(WINDOW_MS, TICK_MS);
  const query = useListSensorObservations(
    {
      start,
      end,
      granularity: "raw",
      sensor_key: "gw",
      limit: 10000,
    },
    { query: { refetchInterval: CADENCES.summary } },
  );
  const { latestObservation } = useWebSocket();

  const rows = query.data?.data?.rows ?? EMPTY_ROWS;
  const orderedRows = useMemo(() => [...rows].reverse(), [rows]);
  const latestRow = orderedRows.at(-1);

  const tempSparkline = useMemo(
    () => orderedRows.map((row) => row.temp ?? null),
    [orderedRows],
  );
  const humiditySparkline = useMemo(
    () => orderedRows.map((row) => row.humidity ?? null),
    [orderedRows],
  );

  const tempTrend = useMemo(
    () => metricTrend(orderedRows, "temp"),
    [orderedRows],
  );
  const humidityTrend = useMemo(
    () => metricTrend(orderedRows, "humidity"),
    [orderedRows],
  );

  return {
    temp: latestObservation?.temp_indoor ?? latestRow?.temp ?? null,
    humidity: latestObservation?.humidity_indoor ?? latestRow?.humidity ?? null,
    tempTrend,
    humidityTrend,
    tempSparkline,
    humiditySparkline,
    windowStart: start,
    isLoading: query.isLoading,
  };
}
