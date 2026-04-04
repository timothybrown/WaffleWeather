"use client";

import { RiTempColdLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { cn, fmt } from "@/lib/utils";
import { convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

function dewpointComfort(dewC: number | null | undefined): { label: string; color: string } {
  if (dewC == null) return { label: "\u2014", color: "text-text-muted" };
  if (dewC < 10) return { label: "Dry", color: "text-primary" };
  if (dewC < 15) return { label: "Comfortable", color: "text-success" };
  if (dewC < 18) return { label: "Slightly humid", color: "text-text-muted" };
  if (dewC < 21) return { label: "Humid", color: "text-warning" };
  if (dewC < 24) return { label: "Oppressive", color: "text-danger" };
  return { label: "Miserable", color: "text-danger" };
}

export default function TemperatureCard({ data, trend }: { data: Observation | null; trend: TrendDirection }) {
  const { system } = useUnits();
  const temp = convertTemp(data?.temp_outdoor, system);
  const feels = convertTemp(data?.feels_like, system);
  const dew = convertTemp(data?.dewpoint, system);
  const indoor = convertTemp(data?.temp_indoor, system);

  return (
    <WeatherCard
      title="Temperature"
      icon={<RiTempColdLine className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(temp.value)}
        </span>
        <span className="text-lg text-text-faint">{temp.unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Feels like</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(feels.value)}&deg;</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Dewpoint</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(dew.value)}&deg;</p>
          <p className={cn("text-xs font-medium", dewpointComfort(data?.dewpoint).color)}>{dewpointComfort(data?.dewpoint).label}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Indoor</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(indoor.value)}&deg;</p>
        </div>
      </div>
    </WeatherCard>
  );
}
