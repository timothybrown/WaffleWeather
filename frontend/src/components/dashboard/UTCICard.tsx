"use client";

import { RiTempHotLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import { fmt } from "@/lib/utils";
import { convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";

/** UTCI stress categories with °C thresholds (lower bound) and colors */
const stressScale: { min: number; label: string; color: string }[] = [
  { min: -Infinity, label: "Extreme cold",    color: "#1e3a5f" },
  { min: -40,       label: "Very strong cold", color: "#2563eb" },
  { min: -27,       label: "Strong cold",      color: "#3b82f6" },
  { min: -13,       label: "Moderate cold",     color: "#60a5fa" },
  { min: 0,         label: "Slight cold",       color: "#93c5fd" },
  { min: 9,         label: "No stress",         color: "var(--color-success)" },
  { min: 26,        label: "Moderate heat",      color: "#fbbf24" },
  { min: 32,        label: "Strong heat",        color: "#f59e0b" },
  { min: 38,        label: "Very strong heat",   color: "#ea580c" },
  { min: 46,        label: "Extreme heat",       color: "#dc2626" },
];

function getStressCategory(utciC: number) {
  for (let i = stressScale.length - 1; i >= 0; i--) {
    if (utciC >= stressScale[i].min) return stressScale[i];
  }
  return stressScale[0];
}

/** Map UTCI °C to a 0–1 position on the gauge. Range: -40 to 50 */
function utciToFraction(utciC: number): number {
  return Math.max(0, Math.min(1, (utciC + 40) / 90));
}

function StressGauge({ utciC }: { utciC: number }) {
  const fraction = utciToFraction(utciC);
  // Build gradient stops from the stress scale (excluding -Infinity)
  const stops = stressScale.slice(1).map((s) => ({
    offset: utciToFraction(s.min),
    color: s.color,
  }));

  return (
    <svg viewBox="0 0 200 24" className="mt-3 w-full">
      <defs>
        <linearGradient id="utci-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
          ))}
        </linearGradient>
        <clipPath id="utci-clip">
          <rect x="4" y="8" width="192" height="8" rx="4" />
        </clipPath>
      </defs>

      {/* Track */}
      <rect
        x="4" y="8" width="192" height="8" rx="4"
        fill="var(--color-surface-hover)"
      />

      {/* Gradient fill */}
      <rect
        x="4" y="8" width="192" height="8"
        clipPath="url(#utci-clip)"
        fill="url(#utci-grad)"
        opacity="0.85"
      />

      {/* Marker */}
      <circle
        cx={4 + fraction * 192}
        cy="12"
        r="5"
        fill="var(--color-surface)"
        stroke={getStressCategory(utciC).color}
        strokeWidth="2"
      />
    </svg>
  );
}

export default function UTCICard({ data }: { data: Observation | null }) {
  const { system } = useUnits();
  const utciConverted = convertTemp(data?.utci, system);
  const category = data?.utci != null ? getStressCategory(data.utci) : null;

  return (
    <WeatherCard
      title="Thermal Comfort"
      icon={<RiTempHotLine className="h-4 w-4" />}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(utciConverted.value)}
        </span>
        <span className="text-lg text-text-faint">{utciConverted.unit}</span>
      </div>
      {category && (
        <p className="mt-1 text-sm font-medium" style={{ color: category.color }}>
          {category.label}
        </p>
      )}
      {data?.utci != null && <StressGauge utciC={data.utci} />}
      <p className="mt-2 text-xs text-text-faint">UTCI</p>
    </WeatherCard>
  );
}
