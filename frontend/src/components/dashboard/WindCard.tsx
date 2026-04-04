"use client";

import { RiWindyLine } from "@remixicon/react";
import type { Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { fmt, degToCompass } from "@/lib/utils";
import { convertSpeed, convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";

function beaufort(kmh: number | null | undefined): { force: number; label: string } | null {
  if (kmh == null) return null;
  const scale: [number, string][] = [
    [1, "Calm"], [6, "Light air"], [12, "Light breeze"],
    [20, "Gentle breeze"], [29, "Moderate breeze"], [39, "Fresh breeze"],
    [50, "Strong breeze"], [62, "Near gale"], [75, "Gale"],
    [89, "Strong gale"], [103, "Storm"], [118, "Violent storm"],
    [Infinity, "Hurricane force"],
  ];
  for (let i = 0; i < scale.length; i++) {
    if (kmh < scale[i][0]) return { force: i, label: scale[i][1] };
  }
  return { force: 12, label: "Hurricane force" };
}

const cardinals: [number, string][] = [[0, "N"], [90, "E"], [180, "S"], [270, "W"]];
const intercardinals = [45, 135, 225, 315];

function CompassRose({ degrees }: { degrees: number | null | undefined }) {
  const hasDeg = degrees != null;
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0">
      <defs>
        <radialGradient id="cmp-fill" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="var(--color-surface-hover)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-surface-hover)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background disc */}
      <circle cx="50" cy="50" r="43" fill="url(#cmp-fill)" />

      {/* Outer ring */}
      <circle cx="50" cy="50" r="43" fill="none" stroke="var(--color-border)" strokeWidth="0.75" />

      {/* Intercardinal ticks */}
      {intercardinals.map((a) => (
        <line
          key={a}
          x1="50" y1="9" x2="50" y2="15"
          stroke="var(--color-border)"
          strokeWidth="0.75"
          strokeLinecap="round"
          transform={`rotate(${a} 50 50)`}
        />
      ))}

      {/* Cardinal labels (no ticks — the letters are the markers) */}
      {cardinals.map(([angle, label]) => {
        const r = 36;
        const rad = ((angle - 90) * Math.PI) / 180;
        return (
          <text
            key={label}
            x={50 + r * Math.cos(rad)}
            y={50 + r * Math.sin(rad)}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            fontSize="7.5"
            fontWeight={label === "N" ? "700" : "400"}
            fill={label === "N" ? "var(--color-primary)" : "var(--color-text-faint)"}
          >
            {label}
          </text>
        );
      })}

      {/* Needle */}
      {hasDeg && (
        <g
          className="compass-needle"
          style={{ transform: `rotate(${degrees}deg)`, transformOrigin: "50px 50px" }}
        >
          {/* North — warm amber, tapered */}
          <polygon
            points="50,17 48.4,47 50,44 51.6,47"
            fill="var(--color-primary)"
            opacity="0.9"
          />
          {/* South — muted tail */}
          <polygon
            points="50,83 48.8,53 50,56 51.2,53"
            fill="var(--color-text-faint)"
            opacity="0.25"
          />
        </g>
      )}

      {/* Center cap */}
      <circle cx="50" cy="50" r="2.5" fill="var(--color-surface-alt)" stroke="var(--color-border)" strokeWidth="0.75" />
      <circle cx="50" cy="50" r="1.25" fill="var(--color-primary)" />
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
          {(() => {
            const bf = beaufort(data?.wind_speed);
            return bf ? (
              <p className="mt-0.5 text-xs text-text-faint">
                Force {bf.force} &mdash; {bf.label}
              </p>
            ) : null;
          })()}
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
