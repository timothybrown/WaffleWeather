"use client";

import { RiTempColdLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { cn, fmt } from "@/lib/utils";
import { convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import InfoTip from "@/components/ui/InfoTip";

function dewpointComfort(dewC: number | null | undefined): { label: string; color: string } {
  if (dewC == null) return { label: "\u2014", color: "text-text-muted" };
  if (dewC < 10) return { label: "Dry", color: "text-primary" };
  if (dewC < 15) return { label: "Comfortable", color: "text-success" };
  if (dewC < 18) return { label: "Slightly humid", color: "text-text-muted" };
  if (dewC < 21) return { label: "Humid", color: "text-warning" };
  if (dewC < 24) return { label: "Oppressive", color: "text-danger" };
  return { label: "Miserable", color: "text-danger" };
}

export default function TemperatureCard({ data, trend, dayMin, dayMax }: { data: Observation | null; trend: TrendDirection; dayMin?: number | null; dayMax?: number | null }) {
  const { system } = useUnits();
  const temp = convertTemp(data?.temp_outdoor, system);
  const feels = convertTemp(data?.feels_like, system);
  const dew = convertTemp(data?.dewpoint, system);
  const indoor = convertTemp(data?.temp_indoor, system);
  const globe = convertTemp(data?.bgt, system);
  const wetBulb = convertTemp(data?.wbgt, system);
  const hi = convertTemp(dayMax, system);
  const lo = convertTemp(dayMin, system);
  const hasBgt = data?.bgt != null;

  return (
    <WeatherCard
      title="Temperature"
      icon={<RiTempColdLine className="h-4 w-4" />}
      info="Outdoor temperature with derived comfort metrics. Sensor updates every 30–60 seconds."
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(temp.value)}
        </span>
        <span className="text-lg text-text-faint">{temp.unit}</span>
        <TrendIndicator trend={trend} />
        {(hi.value != null || lo.value != null) && (
          <span className="ml-auto text-xs text-text-faint">
            <span className="text-[#d47272]">{fmt(hi.value)}&deg;</span>
            {" / "}
            <span className="text-[#7aaccc]">{fmt(lo.value)}&deg;</span>
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Feels like <InfoTip text="Heat index when hot, wind chill when cold, actual temperature otherwise." side="bottom" /></p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(feels.value)}&deg;</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Dewpoint <InfoTip text={`The temperature at which dew forms. Lower means drier air. Below ${system === "metric" ? "10°C" : "50°F"} feels dry; above ${system === "metric" ? "21°C" : "70°F"} feels oppressive.`} side="bottom" /></p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(dew.value)}&deg;</p>
          <p className={cn("text-xs font-medium", dewpointComfort(data?.dewpoint).color)}>{dewpointComfort(data?.dewpoint).label}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Indoor</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(indoor.value)}&deg;</p>
        </div>
        {hasBgt && (
          <>
            <div>
              <p className="text-xs text-text-faint">Globe <InfoTip text="Black Globe Temperature measures radiant heat from the sun and surroundings. Used to compute precise UTCI thermal comfort." side="bottom" /></p>
              <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(globe.value, 1)}&deg;</p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Wet Bulb <InfoTip text="Wet Bulb Globe Temperature combines heat, humidity, wind, and solar radiation into a single safety index. Used by OSHA and military for heat stress limits." side="bottom" /></p>
              <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(wetBulb.value, 1)}&deg;</p>
            </div>
            <div>
              <p className="text-xs text-text-faint">VPD <InfoTip text="Vapor Pressure Deficit — the difference between how much moisture the air holds and how much it could hold. Higher values mean drier air and faster plant transpiration." side="bottom" /></p>
              <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data?.vpd != null ? data.vpd / 10 : null, 2)} <span className="text-text-faint">kPa</span></p>
            </div>
          </>
        )}
      </div>
    </WeatherCard>
  );
}
