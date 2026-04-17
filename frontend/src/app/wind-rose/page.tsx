"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useGetWindRoseData } from "@/generated/aggregates/aggregates";
import type { WindRoseDataPoint } from "@/generated/models";
import WindRoseChart, { type SelectedWedge } from "@/components/wind-rose/WindRoseChart";
import WindRoseSelectionCard from "@/components/wind-rose/WindRoseSelectionCard";
import InfoTip from "@/components/ui/InfoTip";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";

type TimeRange = "24h" | "7d" | "30d" | "1y";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
];

const SPEED_BAND_THRESHOLDS = [
  { metric: "0–5", imperial: "0–3", color: "var(--color-primary-light)" },
  { metric: "5–15", imperial: "3–9", color: "var(--color-primary)" },
  { metric: "15–25", imperial: "9–16", color: "#c88a30" },
  { metric: "25–40", imperial: "16–25", color: "#c45050" },
  { metric: "40+", imperial: "25+", color: "#8b2252" },
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
  const { system } = useUnits();
  const [range, setRange] = useState<TimeRange>("7d");
  const [selected, setSelected] = useState<SelectedWedge | null>(null);
  const selectedKey = selected ? `${selected.direction}|${selected.band}` : null;
  const { start, end } = useMemo(() => getTimeRange(range), [range]);
  const speedUnit = system === "metric" ? "km/h" : "mph";

  // Wind rose aggregates over 24h+ windows — no polling needed; re-fetches on
  // range change via the new params.
  const { data: response, isLoading } = useGetWindRoseData(
    { start, end },
    { query: { refetchInterval: CADENCES.none } },
  );
  const data = (response?.data as WindRoseDataPoint[] | undefined) ?? [];

  const totalObs = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">Wind Rose <InfoTip text="A polar chart showing wind direction frequency and speed distribution. Each spoke represents a compass direction; longer spokes mean wind blows from that direction more often. Colors indicate speed bands." /></h1>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setRange(r.value);
                setSelected(null);
              }}
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
            <WindRoseChart
              data={data}
              onSelect={setSelected}
              selectedKey={selectedKey}
            />
          )}
        </div>

        {/* Legend + stats + selection */}
        <div className="flex flex-col gap-4">
          {/* Legend */}
          <div className="weather-card order-2 rounded-xl p-5 lg:order-1">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Speed Bands
            </h3>
            <div className="space-y-2">
              {SPEED_BAND_THRESHOLDS.map((b) => (
                <div key={b.metric} className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="font-mono text-text-muted">
                    {system === "metric" ? b.metric : b.imperial} {speedUnit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div className="weather-card order-3 rounded-xl p-5 lg:order-2">
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

          {/* Selection — order-1 on mobile (appears first in the sidebar stack, which
              itself sits directly under the chart) and order-3 on desktop (below Stats) */}
          <div className="order-1 lg:order-3">
            <WindRoseSelectionCard selection={selected} totalObs={totalObs} />
          </div>
        </div>
      </div>
    </div>
  );
}
