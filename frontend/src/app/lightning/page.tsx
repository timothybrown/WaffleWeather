"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { Observation, Station, LightningSummary, LightningEventPage } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useListStations } from "@/generated/stations/stations";
import { useGetLightningSummary, useListLightningEvents } from "@/generated/lightning/lightning";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { RiFlashlightLine } from "@remixicon/react";
import { fmt, timeAgo } from "@/lib/utils";
import { convertDistance } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";

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

const tooltipStyle = {
  background: "var(--color-surface-alt)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
};

function formatBucket(value: string, range: TimeRange) {
  const d = new Date(value);
  if (range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function LightningPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const { data: obsResponse } = useGetLatestObservation();
  const { latestObservation: wsData } = useWebSocket();
  const { data: stationsResponse } = useListStations();
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

  // Summary for the selected time range
  const summaryParams = useMemo(() => {
    const end = new Date();
    const ms = range === "24h" ? 24 * 3600000 : range === "7d" ? 7 * 24 * 3600000 : 30 * 24 * 3600000;
    const start = new Date(end.getTime() - ms);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [range]);
  const { data: summaryResponse } = useGetLightningSummary(summaryParams);
  const summary = summaryResponse?.data as LightningSummary | undefined;

  // Recent events for the timeline
  const eventsParams = useMemo(() => {
    const end = new Date();
    const ms = range === "24h" ? 24 * 3600000 : range === "7d" ? 7 * 24 * 3600000 : 30 * 24 * 3600000;
    const start = new Date(end.getTime() - ms);
    return { start: start.toISOString(), end: end.toISOString(), limit: 50 };
  }, [range]);
  const { data: eventsResponse } = useListLightningEvents(eventsParams);
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
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Sensor Count
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
        <div className="weather-card rounded-xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            {range === "24h" ? "24h" : range === "7d" ? "7d" : "30d"} Total
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
            {summary?.total_strikes ?? "\u2014"}
          </p>
          {summary != null && summary.closest_distance != null && (
            <p className="mt-0.5 text-xs text-text-faint">
              Closest: {fmt(convertDistance(summary.closest_distance, system).value)} {distUnit}
            </p>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Strike rate chart */}
        <div className="weather-card rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Strike Activity
          </h3>
          <div className="h-44">
            {chartData.hourly.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={chartData.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(v) => formatBucket(v, range)}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="strikes" fill="var(--color-warning)" radius={[2, 2, 0, 0]} name="Strikes" />
                </BarChart>
              </ResponsiveContainer>
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
            Storm Distance ({distUnit})
          </h3>
          <div className="h-44">
            {chartData.distance.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={chartData.distance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(v) => formatBucket(v, range)}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v} ${distUnit}`, "Distance"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="distance"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    name="Distance"
                  />
                </LineChart>
              </ResponsiveContainer>
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
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Recent Events
        </h3>
        {events.length > 0 ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {events.map((event, i) => {
              const d = convertDistance(event.distance_km, system);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-hover"
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
