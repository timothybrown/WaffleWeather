"use client";

import { RiTempHotLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import { fmt } from "@/lib/utils";
import { convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import InfoTip from "@/components/ui/InfoTip";

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

function utciToFraction(utciC: number): number {
  return Math.max(0, Math.min(1, (utciC + 40) / 90));
}

function StressGauge({ utciC }: { utciC: number }) {
  const fraction = utciToFraction(utciC);
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

      <rect
        x="4" y="8" width="192" height="8" rx="4"
        fill="var(--color-surface-hover)"
      />

      <rect
        x="4" y="8" width="192" height="8"
        clipPath="url(#utci-clip)"
        fill="url(#utci-grad)"
        opacity="0.85"
      />

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
  const globe = convertTemp(data?.bgt, system);
  const wetBulb = convertTemp(data?.wbgt, system);

  return (
    <WeatherCard
      title="Thermal Comfort"
      icon={<RiTempHotLine className="h-4 w-4" />}
      info="Universal Thermal Climate Index accounts for wind, humidity, and solar radiation to model how your body actually perceives conditions outdoors. Globe (BGT) and Wet Bulb (WBGT) are the intermediate measurements that feed UTCI."
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
      {data?.bgt != null && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-text-faint">Globe <InfoTip text="Black Globe Temperature measures radiant heat from the sun and surroundings. Used to compute precise UTCI thermal comfort." side="bottom" /></p>
            <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(globe.value, 1)}&deg;</p>
          </div>
          <div>
            <p className="text-xs text-text-faint">Wet Bulb <InfoTip text="Wet Bulb Globe Temperature combines heat, humidity, wind, and solar radiation into a single safety index. Used by OSHA and military for heat stress limits." side="bottom" /></p>
            <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(wetBulb.value, 1)}&deg;</p>
          </div>
        </div>
      )}
    </WeatherCard>
  );
}
