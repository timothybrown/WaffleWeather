import { useMemo } from "react";
import type { AggregatedObservation } from "@/generated/models";
import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";
import { useStationTimezone, getStationToday } from "@/hooks/useStationTimezone";

interface TodayExtremes {
  tempMin: number | null;
  tempMax: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
}

/** Fetch today's hourly aggregates and derive daily extremes for temp & humidity. */
export function useTodayExtremes(): TodayExtremes {
  const timezone = useStationTimezone();

  const params = useMemo(() => {
    const start = getStationToday(timezone);
    const end = new Date();
    return { start: start.toISOString(), end: end.toISOString() };
  }, [timezone]);

  const { data: response } = useListHourlyObservations(params, {
    query: { refetchInterval: CADENCES.aggregate5m },
  });
  const rows = (response?.data ?? []) as AggregatedObservation[];

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
