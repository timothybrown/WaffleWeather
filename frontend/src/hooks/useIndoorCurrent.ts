"use client";

import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useListSensorObservations } from "@/generated/sensors/sensors";
import type { Observation, SensorReading } from "@/generated/models";
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
  /** Timestamp of the reading currently displayed — from the WebSocket when it
   *  is supplying live values, otherwise from the newest fetched row. */
  timestamp: string | null;
  windowStart: string;
  isLoading: boolean;
}

function timestampMs(row: SensorReading): number | null {
  if (!row.timestamp) return null;
  const ms = Date.parse(row.timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function hasObservationField(
  observation: Observation | null,
  key: "temp_indoor" | "humidity_indoor",
): boolean {
  return (
    observation != null &&
    Object.prototype.hasOwnProperty.call(observation, key)
  );
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
    {
      query: {
        refetchInterval: CADENCES.summary,
        placeholderData: keepPreviousData,
      },
    },
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
  const liveTemp = hasObservationField(latestObservation, "temp_indoor")
    ? latestObservation?.temp_indoor ?? null
    : latestRow?.temp ?? null;
  const liveHumidity = hasObservationField(latestObservation, "humidity_indoor")
    ? latestObservation?.humidity_indoor ?? null
    : latestRow?.humidity ?? null;

  // Track the timestamp of whichever source supplied the displayed values, so
  // "Last update" reflects live WebSocket freshness rather than the age of the
  // 60s-polled query.
  const timestamp = hasObservationField(latestObservation, "temp_indoor")
    ? latestObservation?.timestamp ?? null
    : latestRow?.timestamp ?? null;

  return {
    temp: liveTemp,
    humidity: liveHumidity,
    tempTrend,
    humidityTrend,
    tempSparkline,
    humiditySparkline,
    timestamp,
    windowStart: start,
    isLoading: query.isLoading,
  };
}
