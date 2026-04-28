import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { AggregatedObservation } from "@/generated/models";
import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";
import { useStationTimezone, getStationToday } from "@/hooks/useStationTimezone";
import { useTimeBucket } from "@/hooks/useTimeBucket";

interface TodayExtremes {
  tempMin: number | null;
  tempMax: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
}

const REFRESH_MS = 300_000;

/** Fetch today's hourly aggregates and derive daily extremes for temp & humidity. */
export function useTodayExtremes(): TodayExtremes {
  const timezone = useStationTimezone();
  const timeBucket = useTimeBucket(REFRESH_MS);

  const params = useMemo(() => {
    const end = new Date(timeBucket * REFRESH_MS);
    const start = getStationToday(timezone, end);
    return { start: start.toISOString(), end: end.toISOString() };
    // Re-evaluate every 5 minutes so the window tracks "now" and crosses
    // station-local midnight without needing a page refresh.
  }, [timezone, timeBucket]);

  const { data: response } = useListHourlyObservations(params, {
    query: { refetchInterval: CADENCES.aggregate5m, placeholderData: keepPreviousData },
  });
  const rows = useMemo(
    () => (response?.data ?? []) as AggregatedObservation[],
    [response],
  );

  return useMemo(() => {
    let tempMin: number | null = null;
    let tempMax: number | null = null;
    let humMin: number | null = null;
    let humMax: number | null = null;

    for (const r of rows) {
      if (r.temp_outdoor_min != null) {
        tempMin = tempMin == null ? r.temp_outdoor_min : Math.min(tempMin, r.temp_outdoor_min);
      }
      if (r.temp_outdoor_max != null) {
        tempMax = tempMax == null ? r.temp_outdoor_max : Math.max(tempMax, r.temp_outdoor_max);
      }
      if (r.humidity_outdoor_min != null) {
        humMin = humMin == null ? r.humidity_outdoor_min : Math.min(humMin, r.humidity_outdoor_min);
      }
      if (r.humidity_outdoor_max != null) {
        humMax = humMax == null ? r.humidity_outdoor_max : Math.max(humMax, r.humidity_outdoor_max);
      }
    }

    return { tempMin, tempMax, humidityMin: humMin, humidityMax: humMax };
  }, [rows]);
}
