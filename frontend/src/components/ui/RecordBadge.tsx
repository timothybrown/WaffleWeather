"use client";

import { useState } from "react";
import type { BrokenRecord } from "@/generated/models";
import { convertTemp, convertSpeed, convertRain, convertPressure } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { fmt } from "@/lib/utils";

interface RecordBadgeProps {
  metric: string;
  record: BrokenRecord;
}

function formatPrevious(metric: string, value: number, system: "metric" | "imperial"): string {
  if (metric.includes("temp") || metric.includes("dewpoint")) {
    const conv = convertTemp(value, system);
    return `${fmt(conv.value)}${conv.unit}`;
  }
  if (metric.includes("wind") || metric.includes("gust")) {
    const conv = convertSpeed(value, system);
    return `${fmt(conv.value)} ${conv.unit}`;
  }
  if (metric.includes("rain")) {
    const conv = convertRain(value, system);
    return `${fmt(conv.value, 3)} ${conv.unit}`;
  }
  if (metric.includes("pressure")) {
    const conv = convertPressure(value, system);
    return `${fmt(conv.value, 2)} ${conv.unit}`;
  }
  if (metric.includes("humidity")) return `${Math.round(value)}%`;
  if (metric.includes("solar")) return `${Math.round(value)} W/m\u00B2`;
  if (metric.includes("uv")) return `${fmt(value, 1)}`;
  return `${value}`;
}

export default function RecordBadge({ metric, record }: RecordBadgeProps) {
  const { system } = useUnits();
  const [showTip, setShowTip] = useState(false);

  const label = metric.startsWith("lowest") ? "low" : "high";
  const prev = formatPrevious(metric, record.previous_value, system);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="record-badge-star text-amber-400 text-xs leading-none animate-[record-pulse_0.6s_ease-in-out_3]"
        onClick={(e) => { e.stopPropagation(); setShowTip(!showTip); }}
        aria-label="New all-time record"
      >
        &#9733;
      </button>
      {showTip && (
        <span className="absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-alt px-2.5 py-1.5 text-[0.65rem] text-text-muted shadow-lg border border-border">
          New all-time {label}! Previous: {prev} on {record.previous_date}
        </span>
      )}
    </span>
  );
}
