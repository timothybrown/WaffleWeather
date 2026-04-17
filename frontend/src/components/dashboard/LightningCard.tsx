"use client";

import { useMemo } from "react";
import { RiFlashlightLine } from "@remixicon/react";
import type { Observation, LightningSummary } from "@/generated/models";
import { useGetLightningSummary } from "@/generated/lightning/lightning";
import { fmt, timeAgo } from "@/lib/utils";
import { convertDistance } from "@/lib/units";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";
import WeatherCard from "./WeatherCard";

/** Determine if lightning is "active" — last strike within 30 minutes. */
function isActive(lightningTime: string | null | undefined): boolean {
  if (!lightningTime) return false;
  const diff = Date.now() - new Date(lightningTime).getTime();
  return diff < 30 * 60 * 1000; // 30 minutes
}

/** Tiny sparkline SVG for last 24h of hourly strike data. */
function Sparkline({ hourly }: { hourly: LightningSummary["hourly"] }) {
  if (hourly.length === 0) return null;

  const maxStrikes = Math.max(...hourly.map((h) => h.strikes), 1);
  const w = 80;
  const h = 20;
  const barW = Math.max(1, (w - hourly.length) / hourly.length);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-20 opacity-70">
      {hourly.map((hour, i) => {
        const barH = (hour.strikes / maxStrikes) * h;
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={0.5}
            fill="var(--color-warning)"
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

export default function LightningCard({ data }: { data: Observation | null }) {
  const { system } = useUnits();
  const dist = convertDistance(data?.lightning_distance, system);
  const active = isActive(data?.lightning_time);

  // Fetch 24h lightning summary for sparkline and context
  const summaryParams = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);
  const { data: summaryResponse } = useGetLightningSummary(summaryParams, {
    query: { refetchInterval: CADENCES.summary },
  });
  const summary = summaryResponse?.data as LightningSummary | undefined;

  // Ghost-only: summary loaded, zero real strikes, but sensor has data
  const ghostOnly = summary != null && summary.total_strikes === 0 && data?.lightning_distance != null;

  // Approach/retreat from hourly distance trend
  const trend = useMemo(() => {
    if (!summary?.hourly || summary.hourly.length < 2) return null;
    const recent = summary.hourly.filter((h) => h.min_distance != null);
    if (recent.length < 2) return null;
    const last = recent[recent.length - 1].min_distance!;
    const prev = recent[recent.length - 2].min_distance!;
    const diff = last - prev;
    if (Math.abs(diff) < 0.5) return "steady";
    return diff < 0 ? "approaching" : "receding";
  }, [summary]);

  return (
    <WeatherCard
      title="Lightning"
      icon={<RiFlashlightLine className="h-4 w-4" />}
      info={`Electromagnetic detection of lightning within ${system === "metric" ? "~40 km" : "~25 mi"} via the WH57 sensor. Estimates distance but not direction. Card pulses amber when a strike was detected in the last 30 minutes.`}
      className={active && !ghostOnly ? "lightning-active" : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {summary?.total_strikes ?? "\u2014"}
        </span>
        <span className="text-lg text-text-faint">in 24h</span>
        {active && !ghostOnly && (
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
        )}
      </div>

      {/* 24h sparkline */}
      {summary && summary.total_strikes > 0 && (
        <div className="mt-1.5">
          <Sparkline hourly={summary.hourly} />
        </div>
      )}

      <div className={`mt-4 grid grid-cols-2 gap-3 text-sm ${ghostOnly ? "opacity-40" : ""}`}>
        <div>
          <p className="text-xs text-text-faint">Distance</p>
          <p className="font-mono font-medium tabular-nums text-text-muted">
            {fmt(dist.value)} {dist.unit}
            {trend === "approaching" && (
              <span className="ml-1 text-warning" title="Storm approaching">&darr;</span>
            )}
            {trend === "receding" && (
              <span className="ml-1 text-text-faint" title="Storm receding">&uarr;</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Last strike</p>
          <p className="font-medium text-text-muted">
            {timeAgo(data?.lightning_time)}
            {ghostOnly && <span className="ml-1 text-[10px]">ghost</span>}
          </p>
        </div>
      </div>
    </WeatherCard>
  );
}
