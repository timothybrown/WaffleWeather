"use client";

import dynamic from "next/dynamic";
import type { Observation, Station } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useListStations } from "@/generated/stations/stations";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { RiFlashlightLine } from "@remixicon/react";
import { fmt, timeAgo } from "@/lib/utils";
import { convertDistance } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";

const LightningMap = dynamic(
  () => import("@/components/lightning/LightningMap"),
  { ssr: false },
);

export default function LightningPage() {
  const { data: obsResponse } = useGetLatestObservation();
  const { latestObservation: wsData } = useWebSocket();
  const { data: stationsResponse } = useListStations();
  const { system } = useUnits();

  const apiData = obsResponse?.data as Observation | undefined;
  const data: Observation | null = wsData ?? apiData ?? null;

  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0] ?? null;

  const hasLocation =
    station?.latitude != null && station?.longitude != null;
  const hasLightning =
    data?.lightning_distance != null && data.lightning_distance > 0;
  const dist = convertDistance(data?.lightning_distance, system);

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      {/* Header */}
      <div className="page-header mb-4 flex items-center gap-2">
        <RiFlashlightLine className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-semibold text-text">
          Lightning
        </h1>
      </div>

      {/* Map */}
      <div className="weather-card relative mb-4 min-h-[300px] flex-1 overflow-hidden rounded-xl border border-border bg-surface-alt sm:min-h-[400px]">
        {hasLocation ? (
          <LightningMap
            latitude={station!.latitude!}
            longitude={station!.longitude!}
            strikeDistance={data?.lightning_distance ?? null}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <p>
              Station location not configured. Set{" "}
              <code className="font-mono text-sm text-primary">
                WW_STATION_LATITUDE
              </code>{" "}
              and{" "}
              <code className="font-mono text-sm text-primary">
                WW_STATION_LONGITUDE
              </code>{" "}
              in your .env file.
            </p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Strikes
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {data?.lightning_count ?? "\u2014"}
          </p>
        </div>
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Distance
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {hasLightning ? `${fmt(dist.value)} ${dist.unit}` : "\u2014"}
          </p>
        </div>
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Last Strike
          </p>
          <p className="mt-1 text-lg font-medium text-text">
            {data?.lightning_time ? timeAgo(data.lightning_time) : "\u2014"}
          </p>
        </div>
      </div>
    </div>
  );
}
