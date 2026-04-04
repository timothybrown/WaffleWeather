"use client";

import { useMemo } from "react";
import type { WindRoseDataPoint } from "@/generated/models";

const SECTORS = 16;
const SECTOR_SIZE = 360 / SECTORS;
const SPEED_BANDS = ["0-5", "5-15", "15-25", "25-40", "40+"];
const BAND_COLORS = [
  "var(--color-primary-light)",
  "var(--color-primary)",
  "#c88a30",
  "#c45050",
  "#8b2252",
];
const DIRECTION_LABELS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

interface Props {
  data: WindRoseDataPoint[];
}

export default function WindRoseChart({ data }: Props) {
  const { wedges, maxCount, rings } = useMemo(() => {
    // Build a map: direction → [band counts in order]
    const sectorMap = new Map<number, Map<string, number>>();
    for (let i = 0; i < SECTORS; i++) {
      const dir = i * SECTOR_SIZE;
      const bandMap = new Map<string, number>();
      for (const b of SPEED_BANDS) bandMap.set(b, 0);
      sectorMap.set(dir, bandMap);
    }

    for (const d of data) {
      const bandMap = sectorMap.get(d.direction);
      if (bandMap) {
        bandMap.set(d.speed_range, (bandMap.get(d.speed_range) ?? 0) + d.count);
      }
    }

    // Find max total count for any sector (for scaling)
    let maxCount = 0;
    for (const bandMap of sectorMap.values()) {
      let total = 0;
      for (const c of bandMap.values()) total += c;
      maxCount = Math.max(maxCount, total);
    }
    if (maxCount === 0) maxCount = 1;

    // Build wedge segments
    const wedges: {
      dir: number;
      band: string;
      innerR: number;
      outerR: number;
      color: string;
    }[] = [];

    const maxR = 0.85; // max radius fraction (leave room for labels)

    for (const [dir, bandMap] of sectorMap) {
      let cumulative = 0;
      for (let bi = 0; bi < SPEED_BANDS.length; bi++) {
        const count = bandMap.get(SPEED_BANDS[bi]) ?? 0;
        if (count === 0) continue;
        const innerR = (cumulative / maxCount) * maxR;
        cumulative += count;
        const outerR = (cumulative / maxCount) * maxR;
        wedges.push({
          dir,
          band: SPEED_BANDS[bi],
          innerR,
          outerR,
          color: BAND_COLORS[bi],
        });
      }
    }

    // Concentric ring values (e.g. 25%, 50%, 75%, 100%)
    const rings = [0.25, 0.5, 0.75, 1.0].map((f) => ({
      r: f * maxR,
      label: `${Math.round(f * maxCount)}`,
    }));

    return { wedges, maxCount, rings };
  }, [data]);

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 8; // pixel radius

  function polarToXY(angleDeg: number, rFrac: number): [number, number] {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + rFrac * R * Math.cos(rad), cy + rFrac * R * Math.sin(rad)];
  }

  function wedgePath(dir: number, innerR: number, outerR: number): string {
    const halfSector = SECTOR_SIZE / 2 - 1; // small gap between wedges
    const a1 = dir - halfSector;
    const a2 = dir + halfSector;

    const [ix1, iy1] = polarToXY(a1, innerR);
    const [ox1, oy1] = polarToXY(a1, outerR);
    const [ix2, iy2] = polarToXY(a2, innerR);
    const [ox2, oy2] = polarToXY(a2, outerR);

    const outerArcR = outerR * R;
    const innerArcR = innerR * R;

    return [
      `M ${ox1} ${oy1}`,
      `A ${outerArcR} ${outerArcR} 0 0 1 ${ox2} ${oy2}`,
      `L ${ix2} ${iy2}`,
      innerR > 0
        ? `A ${innerArcR} ${innerArcR} 0 0 0 ${ix1} ${iy1}`
        : `L ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto max-h-[400px] w-full max-w-[400px]">
      {/* Concentric rings */}
      {rings.map((ring) => (
        <circle
          key={ring.r}
          cx={cx}
          cy={cy}
          r={ring.r * R}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
      ))}

      {/* Sector lines (every 22.5°) */}
      {Array.from({ length: SECTORS }, (_, i) => {
        const angle = i * SECTOR_SIZE;
        const [x, y] = polarToXY(angle, 0.85);
        return (
          <line
            key={angle}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth="0.25"
          />
        );
      })}

      {/* Wedges */}
      {wedges.map((w, i) => (
        <path
          key={i}
          d={wedgePath(w.dir, w.innerR, w.outerR)}
          fill={w.color}
          opacity={0.85}
          stroke="var(--color-surface)"
          strokeWidth="0.5"
        />
      ))}

      {/* Direction labels */}
      {DIRECTION_LABELS.map((label, i) => {
        const angle = i * SECTOR_SIZE;
        const isCardinal = i % 4 === 0;
        if (!isCardinal && i % 2 !== 0) return null; // Only show every other label
        const [x, y] = polarToXY(angle, 0.95);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            fontSize={isCardinal ? "11" : "8"}
            fontWeight={isCardinal ? "600" : "400"}
            fill={label === "N" ? "var(--color-primary)" : "var(--color-text-faint)"}
          >
            {label}
          </text>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="2" fill="var(--color-primary)" />
    </svg>
  );
}
