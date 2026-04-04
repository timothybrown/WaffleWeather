"use client";

import { RiDashboard3Line } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import { convertPressure } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

export default function PressureCard({ data, trend }: { data: Observation | null; trend: TrendDirection }) {
  const { system } = useUnits();
  const rel = convertPressure(data?.pressure_rel, system);
  const abs = convertPressure(data?.pressure_abs, system);
  const decimals = system === "metric" ? 2 : 2;

  return (
    <WeatherCard
      title="Pressure"
      icon={<RiDashboard3Line className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(rel.value, decimals)}
        </span>
        <span className="text-lg text-text-faint">{rel.unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Absolute</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(abs.value, decimals)} {abs.unit}</p>
        </div>
        {data?.zambretti_forecast && (
          <div>
            <p className="text-xs text-text-faint">Forecast</p>
            <p className="text-sm font-medium text-text-muted">{data.zambretti_forecast}</p>
          </div>
        )}
      </div>
    </WeatherCard>
  );
}
