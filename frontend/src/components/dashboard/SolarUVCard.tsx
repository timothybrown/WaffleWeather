"use client";

import { RiSunLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { cn, fmt } from "@/lib/utils";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

function uvLevel(uv: number | null | undefined): {
  label: string;
  className: string;
} {
  if (uv == null) return { label: "\u2014", className: "text-text-muted" };
  if (uv < 3) return { label: "Low", className: "text-success" };
  if (uv < 6) return { label: "Moderate", className: "text-warning" };
  if (uv < 8) return { label: "High", className: "text-warning" };
  if (uv < 11) return { label: "Very High", className: "text-danger" };
  return { label: "Extreme", className: "text-danger" };
}

export default function SolarUVCard({ data, solarTrend, uvTrend }: { data: Observation | null; solarTrend: TrendDirection; uvTrend: TrendDirection }) {
  const uv = uvLevel(data?.uv_index);

  return (
    <WeatherCard
      title="Solar & UV"
      icon={<RiSunLine className="h-4 w-4" />}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-faint">Solar Radiation</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {fmt(data?.solar_radiation, 0)}
            </span>
            <span className="text-xs text-text-faint">W/m&sup2;</span>
            <TrendIndicator trend={solarTrend} className="h-4 w-4" />
          </div>
        </div>
        <div>
          <p className="text-xs text-text-faint">UV Index</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {fmt(data?.uv_index, 1)}
            </span>
            <TrendIndicator trend={uvTrend} className="h-4 w-4" />
          </div>
          <p className={cn("text-sm font-medium", uv.className)}>{uv.label}</p>
        </div>
      </div>
    </WeatherCard>
  );
}
