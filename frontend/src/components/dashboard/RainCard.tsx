"use client";

import { RiRainyLine } from "@remixicon/react";
import type { Observation, BrokenRecord } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import { convertRainRate, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import RecordBadge from "@/components/ui/RecordBadge";

export default function RainCard({ data, trend, brokenRecords }: { data: Observation | null; trend: TrendDirection; brokenRecords?: Record<string, BrokenRecord | null> }) {
  const { system } = useUnits();
  const rate = convertRainRate(data?.rain_rate, system);
  const daily = convertRain(data?.rain_daily, system);
  const weekly = convertRain(data?.rain_weekly, system);
  const monthly = convertRain(data?.rain_monthly, system);
  const yearly = convertRain(data?.rain_yearly, system);
  const dp = system === "imperial" ? 3 : 1; // 0.001 in ≈ 0.025 mm

  const relevantMetrics = ["highest_rain_daily", "highest_rain_rate"];
  const firstBroken = relevantMetrics.find((m) => brokenRecords?.[m]);
  const badgeNode = firstBroken && brokenRecords?.[firstBroken]
    ? <RecordBadge metric={firstBroken} record={brokenRecords[firstBroken]} />
    : undefined;

  return (
    <WeatherCard
      title="Rain"
      icon={<RiRainyLine className="h-4 w-4" />}
      info="Rainfall rate and accumulation totals. Rate measures current intensity; totals track accumulation over each period."
      badge={badgeNode}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(rate.value, dp)}
        </span>
        <span className="text-lg text-text-faint">{rate.unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Today</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(daily.value, dp)} {daily.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This week</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(weekly.value, dp)} {weekly.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This month</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(monthly.value, dp)} {monthly.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This year</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(yearly.value, dp)} {yearly.unit}</p>
        </div>
      </div>
    </WeatherCard>
  );
}
