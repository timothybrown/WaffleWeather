"use client";

import { RiFlashlightLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import { fmt, timeAgo } from "@/lib/utils";
import { convertDistance } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";

export default function LightningCard({ data }: { data: Observation | null }) {
  const { system } = useUnits();
  const dist = convertDistance(data?.lightning_distance, system);

  return (
    <WeatherCard
      title="Lightning"
      icon={<RiFlashlightLine className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {data?.lightning_count ?? "\u2014"}
        </span>
        <span className="text-lg text-text-faint">strikes</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Distance</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(dist.value)} {dist.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Last strike</p>
          <p className="font-medium text-text-muted">{timeAgo(data?.lightning_time)}</p>
        </div>
      </div>
    </WeatherCard>
  );
}
