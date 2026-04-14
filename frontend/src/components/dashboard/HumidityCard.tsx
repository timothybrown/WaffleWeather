"use client";

import { RiDropLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import InfoTip from "@/components/ui/InfoTip";
import Sparkline from "./Sparkline";

function comfortLevel(humidity: number | null | undefined): string {
  if (humidity == null) return "\u2014";
  if (humidity < 30) return "Dry";
  if (humidity < 60) return "Comfortable";
  if (humidity < 80) return "Humid";
  return "Very humid";
}

export default function HumidityCard({ data, trend, dayMin, dayMax, sparkline }: { data: Observation | null; trend: TrendDirection; dayMin?: number | null; dayMax?: number | null; sparkline?: (number | null)[] }) {
  return (
    <WeatherCard
      title="Humidity"
      icon={<RiDropLine className="h-4 w-4" />}
      info="Relative humidity — how saturated the air is with moisture. 30–60% is generally comfortable indoors."
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(data?.humidity_outdoor, 0)}
        </span>
        <span className="text-lg text-text-faint">%</span>
        <TrendIndicator trend={trend} />
        {(dayMax != null || dayMin != null) && (
          <span className="ml-auto text-xs text-text-faint">
            <span className="text-[#5eada5]">{fmt(dayMax, 0)}%</span>
            {" / "}
            <span className="text-[#5eada5]/60">{fmt(dayMin, 0)}%</span>
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-text-muted">
        {comfortLevel(data?.humidity_outdoor)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Indoor</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data?.humidity_indoor, 0)}%</p>
        </div>
        {data?.vpd != null && (
          <div>
            <p className="text-xs text-text-faint">VPD <InfoTip text="Vapor Pressure Deficit — the difference between how much moisture the air holds and how much it could hold. Higher values mean drier air and faster plant transpiration." side="bottom" /></p>
            <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data.vpd / 10, 2)} <span className="text-text-faint">kPa</span></p>
          </div>
        )}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-3">
          <Sparkline
            data={sparkline}
            color="var(--color-success)"
            label="Humidity trend over the last 24 hours"
          />
        </div>
      )}
    </WeatherCard>
  );
}
