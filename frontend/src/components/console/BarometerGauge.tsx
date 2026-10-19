"use client";

import { useMemo } from "react";
import type { AggregatedObservation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { useTimeBucket } from "@/hooks/useTimeBucket";
import { fmt } from "@/lib/utils";
import { convertPressure } from "@/lib/units";
import type { UnitSystem } from "@/lib/units";
import VFDDisplay from "./VFDDisplay";

const TREND_SYMBOLS: Record<string, string> = {
  up: "\u25B2",
  down: "\u25BC",
  flat: "\u25C6",
};

// Chart geometry
const VB_W = 220;
const VB_H = 120;
const PLOT_X = 24;
const PLOT_Y = 22;
const PLOT_W = 180;
const PLOT_H = 70;
const HOURS = 24;

interface BarometerGaugeProps {
  pressure: number | null | undefined;
  trend: TrendDirection;
  history: AggregatedObservation[];
  system: UnitSystem;
}

interface HourlyPoint {
  hoursAgo: number;
  value: number;
}

/**
 * Convert pre-aggregated hourly observations into chart points.
 * Each AggregatedObservation has a `bucket` timestamp and `pressure_rel_avg`.
 */
function toHourlyPoints(
  obs: AggregatedObservation[],
  system: UnitSystem,
): HourlyPoint[] {
  const now = Date.now();
  const points: HourlyPoint[] = [];
  for (const o of obs) {
    if (o.pressure_rel_avg == null) continue;
    const t = new Date(o.bucket).getTime();
    const h = Math.floor((now - t) / 3_600_000);
    if (h < 0 || h >= HOURS) continue;
    const converted = convertPressure(o.pressure_rel_avg, system);
    if (converted.value == null) continue;
    points.push({ hoursAgo: h, value: converted.value });
  }
  return points.sort((a, b) => b.hoursAgo - a.hoursAgo); // oldest first → left-to-right
}

export default function BarometerGauge({
  pressure,
  trend,
  history,
  system,
}: BarometerGaugeProps) {
  const isMetric = system === "metric";
  const decimals = 2;
  const current = convertPressure(pressure, system);

  const minuteKey = useTimeBucket(60_000);
  const points = useMemo(
    () => toHourlyPoints(history, system),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, system, minuteKey],
  );

  // Y-axis scale — symmetric padding around observed min/max
  const pad = isMetric ? 1 : 0.03;
  const values = points.map((p) => p.value);
  const dataMin = values.length ? Math.min(...values) : current.value ?? 1013;
  const dataMax = values.length ? Math.max(...values) : current.value ?? 1013;
  const yMin = dataMin - pad;
  const yMax = dataMax + pad;
  const yRange = Math.max(yMax - yMin, pad * 2);

  const mapX = (hoursAgo: number) =>
    PLOT_X + PLOT_W * ((HOURS - 1 - hoursAgo) / (HOURS - 1));
  const mapY = (v: number) =>
    PLOT_Y + PLOT_H * (1 - (v - yMin) / yRange);

  // Polyline path — skip gaps where adjacent hours are missing
  const linePath = useMemo(() => {
    if (points.length < 2) return "";
    const segments: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const cmd = i === 0 || (prev && prev.hoursAgo - p.hoursAgo > 1) ? "M" : "L";
      segments.push(`${cmd}${mapX(p.hoursAgo).toFixed(2)},${mapY(p.value).toFixed(2)}`);
    }
    return segments.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, yMin, yRange]);

  const scaleLabel = `VERT SCALE: ${yRange.toFixed(isMetric ? 0 : 2)}`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full max-w-[220px] vfd-svg-glow">
        {/* Top labels — Davis-style */}
        <text
          x={PLOT_X}
          y={12}
          fill="#a88860"
          fontSize="7"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", letterSpacing: "0.15em" }}
        >
          LAST 24 HRS
        </text>
        <text
          x={PLOT_X + PLOT_W}
          y={12}
          fill="#a88860"
          fontSize="7"
          textAnchor="end"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", letterSpacing: "0.15em" }}
        >
          EVERY 1 HR
        </text>

        {/* Plot rectangle */}
        <rect
          x={PLOT_X}
          y={PLOT_Y}
          width={PLOT_W}
          height={PLOT_H}
          fill="none"
          stroke="rgba(212, 165, 116, 0.25)"
          strokeWidth="0.75"
        />

        {/* Interior gridlines — 3 vertical (every 6 hours), 1 horizontal midline */}
        {[1, 2, 3].map((i) => {
          const x = PLOT_X + (PLOT_W * i) / 4;
          return (
            <line
              key={`v${i}`}
              x1={x}
              y1={PLOT_Y}
              x2={x}
              y2={PLOT_Y + PLOT_H}
              stroke="rgba(212, 165, 116, 0.12)"
              strokeWidth="0.5"
            />
          );
        })}
        <line
          x1={PLOT_X}
          y1={PLOT_Y + PLOT_H / 2}
          x2={PLOT_X + PLOT_W}
          y2={PLOT_Y + PLOT_H / 2}
          stroke="rgba(212, 165, 116, 0.12)"
          strokeWidth="0.5"
        />

        {/* Faint connecting line between dots */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="rgba(232, 196, 154, 0.25)"
            strokeWidth="0.5"
          />
        )}

        {/* Hourly dots */}
        {points.map((p) => (
          <circle
            key={p.hoursAgo}
            cx={mapX(p.hoursAgo)}
            cy={mapY(p.value)}
            r="1.75"
            fill="#e8c49a"
          />
        ))}

        {/* Empty state placeholder */}
        {points.length === 0 && (
          <text
            x={PLOT_X + PLOT_W / 2}
            y={PLOT_Y + PLOT_H / 2 + 2}
            fill="#a88860"
            fontSize="7"
            textAnchor="middle"
            style={{ fontFamily: "var(--font-ibm-plex-mono)", letterSpacing: "0.3em" }}
          >
            — — —
          </text>
        )}

        {/* Vertical scale label — Davis "Vertical Scale: 3" equivalent */}
        <text
          x={PLOT_X}
          y={PLOT_Y + PLOT_H + 12}
          fill="#a88860"
          fontSize="7"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", letterSpacing: "0.15em" }}
        >
          {scaleLabel}
        </text>
        <text
          x={PLOT_X + PLOT_W}
          y={PLOT_Y + PLOT_H + 12}
          fill="#a88860"
          fontSize="7"
          textAnchor="end"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", letterSpacing: "0.15em" }}
        >
          {isMetric ? "hPa" : "inHg"}
        </text>
      </svg>

      {/* Digital readout below chart */}
      <div className="mt-1 flex items-center gap-2">
        <VFDDisplay
          value={fmt(current.value, decimals)}
          size="md"
          unit={current.unit}
          pulse
        />
        {trend && trend !== "flat" && (
          <span className="vfd-glow text-sm">{TREND_SYMBOLS[trend]}</span>
        )}
        {trend === "flat" && (
          <span className="vfd-glow-dim text-xs">{TREND_SYMBOLS.flat}</span>
        )}
      </div>
    </div>
  );
}
