"use client";

import { useUnits } from "@/providers/UnitsProvider";
import type { SelectedWedge } from "./WindRoseChart";

interface Props {
  selection: SelectedWedge | null;
  totalObs: number;
}

const DIRECTION_LABELS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
];

const METRIC_BAND_LABELS: Record<string, string> = {
  "0-5": "0–5",
  "5-15": "5–15",
  "15-25": "15–25",
  "25-40": "25–40",
  "40+": "40+",
};

const BAND_COLORS: Record<string, string> = {
  "0-5": "var(--color-primary-light)",
  "5-15": "var(--color-primary)",
  "15-25": "#c88a30",
  "25-40": "#c45050",
  "40+": "#8b2252",
};

function directionLabel(degrees: number): string {
  const idx = Math.round(degrees / 22.5) % 16;
  return DIRECTION_LABELS[idx];
}

export default function WindRoseSelectionCard({ selection, totalObs }: Props) {
  const { system } = useUnits();
  const speedUnit = system === "metric" ? "km/h" : "mph";

  return (
    <div className="weather-card rounded-xl p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Selection
      </h3>
      {selection === null ? (
        <p className="text-sm text-text-faint">
          Hover or tap a segment to see details.
        </p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-faint">Direction</span>
            <span className="font-mono font-medium text-text-muted">
              {directionLabel(selection.direction)}{" "}
              <span className="text-text-faint">({selection.direction}°)</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-faint">Speed band</span>
            <span className="flex items-center gap-2 font-mono font-medium text-text-muted">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: BAND_COLORS[selection.band] }}
              />
              {METRIC_BAND_LABELS[selection.band]} {speedUnit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-faint">Observations</span>
            <span className="font-mono font-medium text-text-muted">
              {selection.count.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-faint">Frequency</span>
            <span className="font-mono font-medium text-text-muted">
              {totalObs > 0
                ? `${((selection.count / totalObs) * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
