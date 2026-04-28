import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { AggregatedObservation } from "@/generated/models";
import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";
import { useTimeBucket } from "@/hooks/useTimeBucket";

interface SparklineData {
  temperature: (number | null)[];
  humidity: (number | null)[];
  pressure: (number | null)[];
}

const EMPTY: SparklineData = { temperature: [], humidity: [], pressure: [] };
const REFRESH_MS = 300_000;

export function useSparklineData(): SparklineData {
  const timeBucket = useTimeBucket(REFRESH_MS);
  const params = useMemo(() => {
    const end = new Date(timeBucket * REFRESH_MS);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
    // Re-evaluate every 5 minutes so the rolling 24h window slides forward
    // instead of freezing at mount time.
  }, [timeBucket]);

  const { data: response } = useListHourlyObservations(params, {
    query: { refetchInterval: CADENCES.aggregate5m, placeholderData: keepPreviousData },
  });
  const rows = useMemo(
    () => (response?.data ?? []) as AggregatedObservation[],
    [response],
  );

  return useMemo(() => {
    if (rows.length === 0) return EMPTY;

    const sorted = [...rows].sort(
      (a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime(),
    );

    return {
      temperature: sorted.map((r) => r.temp_outdoor_avg ?? null),
      humidity: sorted.map((r) => r.humidity_outdoor_avg ?? null),
      pressure: sorted.map((r) => r.pressure_rel_avg ?? null),
    };
  }, [rows]);
}
