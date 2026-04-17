import { useMemo } from "react";
import type { AggregatedObservation } from "@/generated/models";
import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
import { CADENCES } from "@/lib/queryCadences";

interface SparklineData {
  temperature: (number | null)[];
  humidity: (number | null)[];
  pressure: (number | null)[];
}

const EMPTY: SparklineData = { temperature: [], humidity: [], pressure: [] };

export function useSparklineData(): SparklineData {
  const params = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);

  const { data: response } = useListHourlyObservations(params, {
    query: { refetchInterval: CADENCES.aggregate5m },
  });
  const rows = (response?.data ?? []) as AggregatedObservation[];

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
