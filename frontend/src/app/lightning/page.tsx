"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Observation, Station, LightningSummary, LightningEventPage } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useListStations } from "@/generated/stations/stations";
import { useGetLightningSummary, useListLightningEvents } from "@/generated/lightning/lightning";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { RiFlashlightLine } from "@remixicon/react";
import { fmt, timeAgo } from "@/lib/utils";
import { convertDistance } from "@/lib/units";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";
import { useResolvedColors } from "@/hooks/useResolvedColors";
import { toColumnar } from "@/lib/uplot-data";
import UPlotChart from "@/components/charts/UPlotChart";
import {
  strikeActivityOpts,
  stormDistanceOpts,
  type ResolvedColors,
} from "@/components/charts/chartConfigs";
import InfoTip from "@/components/ui/InfoTip";

const LightningMap = dynamic(
  () => import("@/components/lightning/LightningMap"),
  { ssr: false },
);

type TimeRange = "24h" | "7d" | "30d";
const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

const COLOR_VARS = [
  "--color-border",
  "--color-text-faint",
  "--color-surface-alt",
  "--color-primary",
  "--color-warning",
];

function formatBucket(unix: number, range: TimeRange): string {
  const d = new Date(unix * 1000);
  if (range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (range === "7d") {
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      return d.toLocaleDateString([], { weekday: "short" });
    }
    return "";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function LightningPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [showFiltered, setShowFiltered] = useState(false);
  const { data: obsResponse } = useGetLatestObservation(undefined, {
    query: { refetchInterval: CADENCES.live },
  });
  const { latestObservation: wsData } = useWebSocket();
  const { data: stationsResponse } = useListStations({
    query: { refetchInterval: CADENCES.none },
  });
  const { system } = useUnits();

  const apiData = obsResponse?.data as Observation | undefined;
  const data: Observation | null = wsData
    ? ({ ...apiData, ...wsData } as Observation)
    : apiData ?? null;

  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0] ?? null;

  const hasLocation =
    station?.latitude != null && station?.longitude != null;
  const hasLightning =
    data?.lightning_distance != null && data.lightning_distance > 0;
  const dist = convertDistance(data?.lightning_distance, system);

  // Resolved colors for canvas
  const rawColors = useResolvedColors(COLOR_VARS);
  const colors: ResolvedColors = useMemo(
    () => ({
      border: rawColors["--color-border"],
      textFaint: rawColors["--color-text-faint"],
      surfaceAlt: rawColors["--color-surface-alt"],
      primary: rawColors["--color-primary"],
      warning: rawColors["--color-warning"],
    }),
    [rawColors],
  );

  const tickFmt = useMemo(
    () => (v: number) => formatBucket(v, range),
    [range],
  );

  // Summary for the selected time range
  const summaryParams = useMemo(() => {
    const end = new Date();
    const ms = range === "24h" ? 24 * 3600000 : range === "7d" ? 7 * 24 * 3600000 : 30 * 24 * 3600000;
    const start = new Date(end.getTime() - ms);
    return { start: start.toISOString(), end: end.toISOString(), include_filtered: showFiltered };
  }, [range, showFiltered]);
  const { data: summaryResponse } = useGetLightningSummary(summaryParams, {
    query: { refetchInterval: CADENCES.summary },
  });
  const summary = summaryResponse?.data as LightningSummary | undefined;

  // Recent events for the timeline
  const eventsParams = useMemo(() => {
    const end = new Date();
    const ms = range === "24h" ? 24 * 3600000 : range === "7d" ? 7 * 24 * 3600000 : 30 * 24 * 3600000;
    const start = new Date(end.getTime() - ms);
    return { start: start.toISOString(), end: end.toISOString(), limit: 50, include_filtered: showFiltered };
  }, [range, showFiltered]);
  const { data: eventsResponse } = useListLightningEvents(eventsParams, {
    query: { refetchInterval: CADENCES.summary },
  });
  const events = (eventsResponse?.data as LightningEventPage | undefined)?.items ?? [];

  // Chart data from summary
  const chartData = useMemo(() => {
    if (!summary) return { hourly: [], distance: [] };
    return {
      hourly: summary.hourly.map((h) => ({
        time: h.bucket,
        strikes: h.strikes,
      })),
      distance: summary.hourly
        .filter((h) => h.min_distance != null)
        .map((h) => ({
          time: h.bucket,
          distance: convertDistance(h.min_distance, system).value,
        })),
    };
  }, [summary, system]);

  // uPlot columnar data
  const strikeData = useMemo(
    () => toColumnar(chartData.hourly, "time", ["strikes"]),
    [chartData.hourly],
  );
  const distanceData = useMemo(
    () => toColumnar(chartData.distance, "time", ["distance"]),
    [chartData.distance],
  );

  // Chart options
  const strikeOpts = useMemo(() => strikeActivityOpts(colors, tickFmt), [colors, tickFmt]);
  const distOpts = useMemo(() => stormDistanceOpts(colors, tickFmt), [colors, tickFmt]);

  const distUnit = system === "metric" ? "km" : "mi";

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      {/* Header */}
      <div className="page-header mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RiFlashlightLine className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold text-text">
            Lightning
          </h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                range === r.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="weather-card relative mb-4 min-h-[250px] flex-shrink-0 overflow-hidden rounded-xl border border-border bg-surface-alt sm:min-h-[300px]">
        {hasLocation ? (
          <LightningMap
            latitude={station!.latitude!}
            longitude={station!.longitude!}
            strikeDistance={summary && summary.total_strikes > 0 ? data?.lightning_distance ?? null : null}
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
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Sensor Count <InfoTip text="Running count from the WH57 sensor since its last daily reset at midnight. This is not the same as the period total below, which tracks actual detected strike events." side="bottom" />
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {data?.lightning_count ?? "\u2014"}
          </p>
        </div>
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Distance <InfoTip text="Estimated distance to the most recently detected lightning strike. The WH57 sensor uses electromagnetic signal strength to approximate range." side="bottom" />
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {hasLightning ? `${fmt(dist.value)} ${dist.unit}` : "\u2014"}
          </p>
        </div>
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Last Strike <InfoTip text="Time elapsed since the WH57 sensor last detected a lightning strike." side="bottom" />
          </p>
          <p className="mt-1 text-lg font-medium text-text">
            {data?.lightning_time ? timeAgo(data.lightning_time) : "\u2014"}
          </p>
        </div>
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            {range === "24h" ? "24h" : range === "7d" ? "7d" : "30d"} Total <InfoTip text="Total detected strike events for the selected time period, based on changes in the sensor's running count." side="bottom" />
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {summary?.total_strikes ?? "\u2014"}
          </p>
          {summary != null && summary.closest_distance != null && (
            <p className="mt-0.5 text-xs text-text-faint">
              Closest: {fmt(convertDistance(summary.closest_distance, system).value)} {distUnit}
            </p>
          )}
          {summary != null && summary.filtered_count > 0 && !showFiltered && (
            <p className="mt-0.5 text-xs text-text-faint">
              {summary.filtered_count} filtered
            </p>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Strike rate chart */}
        <div className="weather-card rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Strike Activity <InfoTip text="Number of detected lightning strikes per time bucket. Derived from changes in the sensor's running count." side="bottom" />
          </h3>
          <div className="h-44">
            {chartData.hourly.length > 0 ? (
              <UPlotChart options={strikeOpts} data={strikeData} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-faint">
                No lightning activity
              </div>
            )}
          </div>
        </div>

        {/* Distance over time */}
        <div className="weather-card rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Storm Distance ({distUnit}) <InfoTip text="Closest detected strike distance per time bucket. A decreasing trend indicates a storm is approaching." side="bottom" />
          </h3>
          <div className="h-44">
            {chartData.distance.length > 0 ? (
              <UPlotChart options={distOpts} data={distanceData} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-faint">
                No distance data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event timeline */}
      <div className="weather-card rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Recent Events
          </h3>
          <button
            onClick={() => setShowFiltered(!showFiltered)}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
              showFiltered
                ? "border-warning/30 text-warning bg-warning/5"
                : "border-border text-text-faint hover:text-text-muted"
            }`}
          >
            {showFiltered ? "Showing all" : "Filtered hidden"}
          </button>
        </div>
        {events.length > 0 ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {events.map((event, i) => {
              const d = convertDistance(event.distance_km, system);
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-hover ${event.filtered ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <RiFlashlightLine className="h-3.5 w-3.5 text-warning" />
                    <span className="font-mono font-medium tabular-nums text-text">
                      {event.new_strikes} {event.new_strikes === 1 ? "strike" : "strikes"}
                    </span>
                    {event.distance_km != null && (
                      <span className="text-text-faint">
                        at {fmt(d.value)} {d.unit}
                      </span>
                    )}
                    {event.filtered && (
                      <span className="text-[10px] text-text-faint">ghost</span>
                    )}
                  </div>
                  <span className="text-xs text-text-faint">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-text-faint">
            No lightning events recorded
          </div>
        )}
      </div>
    </div>
  );
}
