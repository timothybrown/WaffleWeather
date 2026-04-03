"use client";

import { RiRainyLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import { convertRainRate, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

export default function RainCard({ data, trend }: { data: Observation | null; trend: TrendDirection }) {
  const { system } = useUnits();
  const rate = convertRainRate(data?.rain_rate, system);
  const daily = convertRain(data?.rain_daily, system);
  const weekly = convertRain(data?.rain_weekly, system);
  const monthly = convertRain(data?.rain_monthly, system);
  const yearly = convertRain(data?.rain_yearly, system);

  return (
    <WeatherCard
      title="Rain"
      icon={<RiRainyLine className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(rate.value, 1)}
        </span>
        <span className="text-lg text-text-faint">{rate.unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Today</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(daily.value)} {daily.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This week</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(weekly.value)} {weekly.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This month</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(monthly.value)} {monthly.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">This year</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(yearly.value)} {yearly.unit}</p>
        </div>
      </div>
    </WeatherCard>
  );
}
