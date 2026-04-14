"use client";

import { RiDashboard3Line } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt } from "@/lib/utils";
import { convertPressure } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import Sparkline from "./Sparkline";
import InfoTip from "@/components/ui/InfoTip";

export default function PressureCard({ data, trend, sparkline }: { data: Observation | null; trend: TrendDirection; sparkline?: (number | null)[] }) {
  const { system } = useUnits();
  const rel = convertPressure(data?.pressure_rel, system);
  const abs = convertPressure(data?.pressure_abs, system);
  const decimals = system === "metric" ? 2 : 2;

  return (
    <WeatherCard
      title="Pressure"
      icon={<RiDashboard3Line className="h-4 w-4" />}
      info="Atmospheric pressure adjusted to sea level. Falling pressure often signals approaching storms; rising pressure suggests clearing."
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
          <p className="text-xs text-text-faint">Absolute <InfoTip text="Raw sensor pressure at your elevation, not adjusted for altitude." side="bottom" /></p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(abs.value, decimals)} {abs.unit}</p>
        </div>
        {data?.zambretti_forecast && (
          <div>
            <p className="text-xs text-text-faint">Forecast <InfoTip text="Zambretti algorithm — predicts weather from the 3-hour pressure trend, wind direction, and season." side="bottom" /></p>
            <p className="text-sm font-medium text-text-muted">{data.zambretti_forecast}</p>
          </div>
        )}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-3">
          <Sparkline
            data={sparkline}
            color="var(--color-primary)"
            label="Pressure trend over the last 24 hours"
          />
        </div>
      )}
    </WeatherCard>
  );
}
