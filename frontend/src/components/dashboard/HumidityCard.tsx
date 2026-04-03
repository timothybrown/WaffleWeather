"use client";

import { RiDropLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

function comfortLevel(humidity: number | null | undefined): string {
  if (humidity == null) return "\u2014";
  if (humidity < 30) return "Dry";
  if (humidity < 60) return "Comfortable";
  if (humidity < 80) return "Humid";
  return "Very humid";
}

export default function HumidityCard({ data, trend }: { data: Observation | null; trend: TrendDirection }) {
  return (
    <WeatherCard
      title="Humidity"
      icon={<RiDropLine className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(data?.humidity_outdoor, 0)}
        </span>
        <span className="text-lg text-text-faint">%</span>
        <TrendIndicator trend={trend} />
      </div>
      <p className="mt-1 text-sm text-text-muted">
        {comfortLevel(data?.humidity_outdoor)}
      </p>
      <div className="mt-3 text-sm">
        <p className="text-xs text-text-faint">Indoor</p>
        <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data?.humidity_indoor, 0)}%</p>
      </div>
    </WeatherCard>
  );
}
