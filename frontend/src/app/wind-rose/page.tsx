"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useGetWindRoseData } from "@/generated/aggregates/aggregates";
import type { WindRoseDataPoint } from "@/generated/models";
import WindRoseChart from "@/components/wind-rose/WindRoseChart";

type TimeRange = "24h" | "7d" | "30d" | "1y";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
];

const SPEED_BANDS = [
  { label: "0-5 km/h", color: "var(--color-primary-light)" },
  { label: "5-15 km/h", color: "var(--color-primary)" },
  { label: "15-25 km/h", color: "#c88a30" },
  { label: "25-40 km/h", color: "#c45050" },
  { label: "40+ km/h", color: "#8b2252" },
];

function getTimeRange(range: TimeRange): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  const ms: Record<TimeRange, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  };
  const start = new Date(now.getTime() - ms[range]).toISOString();
  return { start, end };
}

export default function WindRosePage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const { start, end } = useMemo(() => getTimeRange(range), [range]);

  const { data: response, isLoading } = useGetWindRoseData({ start, end });
  const data = (response?.data as WindRoseDataPoint[] | undefined) ?? [];

  const totalObs = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">Wind Rose</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
                range === r.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart */}
        <div className="weather-card rounded-xl p-5 lg:col-span-2">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center text-text-muted">
              Loading...
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-96 items-center justify-center text-text-muted">
              No wind data for this period
            </div>
          ) : (
            <WindRoseChart data={data} />
          )}
        </div>

        {/* Legend + stats */}
        <div className="space-y-4">
          <div className="weather-card rounded-xl p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Speed Bands
            </h3>
            <div className="space-y-2">
              {SPEED_BANDS.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="font-mono text-text-muted">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="weather-card rounded-xl p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Statistics
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-faint">Observations</span>
                <span className="font-mono font-medium text-text-muted">{totalObs.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-faint">Period</span>
                <span className="font-mono font-medium text-text-muted">
                  {RANGES.find((r) => r.value === range)?.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
