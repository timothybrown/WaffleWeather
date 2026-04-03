"use client";

import { RiWindyLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt, degToCompass } from "@/lib/utils";
import { convertSpeed, convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

/** 30° major ticks (excluding cardinals which get labels) */
const majorAngles = [30, 60, 120, 150, 210, 240, 300, 330];
/** 15° minor ticks (excluding positions with major ticks or cardinals) */
const minorAngles = [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345];

const cardinals: [number, string][] = [
  [0, "N"],
  [90, "E"],
  [180, "S"],
  [270, "W"],
];

function CompassRose({ degrees }: { degrees: number | null | undefined }) {
  const hasDeg = degrees != null;
  return (
    <svg viewBox="0 0 120 120" className="compass-rose h-24 w-24 shrink-0">
      <defs>
        {/* Subtle inner shadow for glass depth */}
        <radialGradient id="compass-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-surface-hover)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-surface)" stopOpacity="0" />
        </radialGradient>
        {/* Warm glow behind needle tip */}
        <radialGradient id="needle-glow" cx="50%" cy="20%" r="30%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background fill */}
      <circle cx="60" cy="60" r="52" fill="url(#compass-bg)" />

      {/* Outer ring — double stroke for depth */}
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-border)" strokeWidth="1" />
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--color-border)" strokeWidth="0.5" opacity="0.4" />

      {/* Minor ticks — every 15° */}
      {minorAngles.map((a) => (
        <line
          key={a}
          x1="60" y1="11" x2="60" y2="16"
          stroke="var(--color-border)"
          strokeWidth="0.75"
          transform={`rotate(${a} 60 60)`}
        />
      ))}

      {/* Major ticks — every 30° (excluding cardinals) */}
      {majorAngles.map((a) => (
        <line
          key={a}
          x1="60" y1="10" x2="60" y2="18"
          stroke="var(--color-text-faint)"
          strokeWidth="1"
          transform={`rotate(${a} 60 60)`}
        />
      ))}

      {/* Cardinal ticks — thicker */}
      {cardinals.map(([a]) => (
        <line
          key={a}
          x1="60" y1="9" x2="60" y2="19"
          stroke="var(--color-text-muted)"
          strokeWidth="1.5"
          transform={`rotate(${a} 60 60)`}
        />
      ))}

      {/* Cardinal labels — all in SVG for precise placement */}
      {cardinals.map(([angle, label]) => {
        const r = 24;
        const rad = ((angle - 90) * Math.PI) / 180;
        const x = 60 + r * Math.cos(rad);
        const y = 60 + r * Math.sin(rad);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            fontSize="9"
            fontWeight={label === "N" ? "700" : "500"}
            fill={label === "N" ? "var(--color-primary)" : "var(--color-text-faint)"}
          >
            {label}
          </text>
        );
      })}

      {/* Needle group — rotates with wind direction */}
      {hasDeg && (
        <g
          className="compass-needle"
          style={{ transform: `rotate(${degrees}deg)`, transformOrigin: "60px 60px" }}
        >
          {/* Glow behind north tip */}
          <circle cx="60" cy="60" r="30" fill="url(#needle-glow)" />
          {/* North half — warm amber, tapered */}
          <polygon
            points="60,18 57,58 60,54 63,58"
            fill="var(--color-primary)"
            opacity="0.85"
          />
          {/* South half — muted, thinner */}
          <polygon
            points="60,102 57.5,62 60,66 62.5,62"
            fill="var(--color-text-faint)"
            opacity="0.35"
          />
        </g>
      )}

      {/* Center cap — layered for depth */}
      <circle cx="60" cy="60" r="4" fill="var(--color-surface-alt)" stroke="var(--color-border)" strokeWidth="1" />
      <circle cx="60" cy="60" r="2" fill="var(--color-primary)" />
    </svg>
  );
}

export default function WindCard({ data, trend }: { data: Observation | null; trend: TrendDirection }) {
  const { system } = useUnits();
  const speed = convertSpeed(data?.wind_speed, system);
  const gust = convertSpeed(data?.wind_gust, system);
  const chill = convertTemp(data?.wind_chill, system);

  return (
    <WeatherCard
      title="Wind"
      icon={<RiWindyLine className="h-4 w-4" />}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-4xl font-semibold tabular-nums text-text">
              {fmt(speed.value)}
            </span>
            <span className="text-lg text-text-faint">{speed.unit}</span>
            <TrendIndicator trend={trend} />
          </div>
          <p className="mt-1 font-mono text-sm font-medium text-text-muted">
            {degToCompass(data?.wind_dir)} ({fmt(data?.wind_dir, 0)}&deg;)
          </p>
        </div>
        <CompassRose degrees={data?.wind_dir} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-faint">Gust</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(gust.value)} {gust.unit}</p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Wind chill</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">
            {chill.value != null ? `${fmt(chill.value)}\u00B0` : "\u2014"}
          </p>
        </div>
      </div>
    </WeatherCard>
  );
}
