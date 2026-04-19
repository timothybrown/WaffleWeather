"use client";

import { RiWindyLine } from "@remixicon/react";
import type { Observation, BrokenRecord } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt, degToCompass } from "@/lib/utils";
import { convertSpeed } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import InfoTip from "@/components/ui/InfoTip";
import WindCompassRing from "./WindCompassRing";
import RecordBadge from "@/components/ui/RecordBadge";

function beaufort(kmh: number | null | undefined): { force: number; label: string } | null {
  if (kmh == null) return null;
  const scale: [number, string][] = [
    [1, "Calm"], [6, "Light air"], [12, "Light breeze"],
    [20, "Gentle breeze"], [29, "Moderate breeze"], [39, "Fresh breeze"],
    [50, "Strong breeze"], [62, "Near gale"], [75, "Gale"],
    [89, "Strong gale"], [103, "Storm"], [118, "Violent storm"],
    [Infinity, "Hurricane force"],
  ];
  for (let i = 0; i < scale.length; i++) {
    if (kmh < scale[i][0]) return { force: i, label: scale[i][1] };
  }
  return { force: 12, label: "Hurricane force" };
}

export default function WindCard({ data, trend, brokenRecords }: { data: Observation | null; trend: TrendDirection; brokenRecords?: Record<string, BrokenRecord | null> }) {
  const { system } = useUnits();
  const speed = convertSpeed(data?.wind_speed, system);
  const gust = convertSpeed(data?.wind_gust, system);

  const relevantMetrics = ["highest_wind_gust", "highest_wind_speed"];
  const firstBroken = relevantMetrics.find((m) => brokenRecords?.[m]);
  const badgeNode = firstBroken && brokenRecords?.[firstBroken]
    ? <RecordBadge metric={firstBroken} record={brokenRecords[firstBroken]} />
    : undefined;

  return (
    <WeatherCard
      title="Wind"
      icon={<RiWindyLine className="h-4 w-4" />}
      info="Wind speed and direction from the anemometer. Speed is a 1-minute average; gust is the peak in the current interval."
      badge={badgeNode}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(speed.value)}
        </span>
        <span className="text-lg text-text-faint">{speed.unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium text-text-muted">
            {degToCompass(data?.wind_dir)} ({fmt(data?.wind_dir, 0)}&deg;)
          </p>
          {(() => {
            const bf = beaufort(data?.wind_speed);
            return bf ? (
              <p className="mt-0.5 text-xs text-text-faint">
                Force {bf.force} &mdash; {bf.label}
              </p>
            ) : null;
          })()}
          <div className="mt-2">
            <p className="text-xs text-text-faint">
              Gust{" "}
              <InfoTip
                text="Highest instantaneous wind speed in the current reporting interval."
                side="bottom"
              />
            </p>
            <p className="font-mono text-sm font-medium tabular-nums text-text-muted">
              {fmt(gust.value)} {gust.unit}
            </p>
          </div>
        </div>
        <div className="h-32 w-32 shrink-0">
          <WindCompassRing
            windDir={data?.wind_dir}
            windSpeed={data?.wind_speed}
            windGust={data?.wind_gust}
          />
        </div>
      </div>
    </WeatherCard>
  );
}
