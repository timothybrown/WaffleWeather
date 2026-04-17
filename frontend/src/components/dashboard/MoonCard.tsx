"use client";

import { useMemo } from "react";
import SunCalc from "suncalc";
import { RiMoonLine } from "@remixicon/react";
import { useListStations } from "@/generated/stations/stations";
import type { Station } from "@/generated/models";
import { CADENCES } from "@/lib/queryCadences";
import WeatherCard from "./WeatherCard";

function getPhaseName(phase: number): string {
  if (phase < 0.033 || phase >= 0.967) return "New Moon";
  if (phase < 0.217) return "Waxing Crescent";
  if (phase < 0.283) return "First Quarter";
  if (phase < 0.467) return "Waxing Gibbous";
  if (phase < 0.533) return "Full Moon";
  if (phase < 0.717) return "Waning Gibbous";
  if (phase < 0.783) return "Last Quarter";
  return "Waning Crescent";
}

function fmtTime(d: Date | undefined): string {
  if (!d) return "\u2014";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MoonPhaseSVG({ phase }: { phase: number }) {
  // Convert phase to terminator position
  // phase 0 = new, 0.5 = full
  const sweepFraction = phase <= 0.5 ? phase * 2 : (1 - phase) * 2; // 0 to 1 to 0
  const terminatorRx = 22 * Math.abs(1 - sweepFraction * 2); // inner ellipse x-radius
  const isWaxing = phase <= 0.5;

  // Top of moon: (30, 8), Bottom: (30, 52)
  // Outer arc sweeps along the lit side, inner arc (terminator) returns
  const top = "30,8";
  const bottom = "30,52";

  // Determine the sweep and arc flags for the lit portion
  // For waxing phases, the right side is lit
  // For waning phases, the left side is lit
  let litPath: string;

  if (phase < 0.01 || phase > 0.99) {
    // New moon — nothing lit
    litPath = "";
  } else if (phase > 0.49 && phase < 0.51) {
    // Full moon — entire circle lit
    litPath = `M30,8 A22,22 0 1,1 30,52 A22,22 0 1,1 30,8 Z`;
  } else {
    // The outer arc always follows the full circle (radius 22)
    // The terminator is an ellipse with variable rx
    const outerSweep = isWaxing ? 0 : 1; // which side the outer arc curves to
    const terminatorSweep = sweepFraction > 0.5 ? (isWaxing ? 1 : 0) : (isWaxing ? 0 : 1);

    litPath = [
      `M${top}`,
      `A22,22 0 0,${outerSweep} ${bottom}`,
      `A${terminatorRx},22 0 0,${terminatorSweep} ${top}`,
      "Z",
    ].join(" ");
  }

  return (
    <svg
      viewBox="0 0 60 60"
      className="mx-auto h-16 w-16"
      aria-hidden="true"
    >
      {/* Dim base circle */}
      <circle cx="30" cy="30" r="22" fill="var(--color-text)" opacity="0.15" />
      {/* Illuminated portion */}
      {litPath && (
        <path d={litPath} fill="var(--color-text)" opacity="0.85" />
      )}
      {/* Subtle outer ring */}
      <circle
        cx="30"
        cy="30"
        r="22"
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

export default function MoonCard() {
  const { data: stationsResponse } = useListStations({
    query: { refetchInterval: CADENCES.none },
  });
  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0];

  const {
    phase,
    phaseName,
    fraction,
    moonrise,
    moonset,
    nextFullMoon,
    nextNewMoon,
  } = useMemo(() => {
    const now = new Date();
    const illum = SunCalc.getMoonIllumination(now);

    const hasLocation =
      station?.latitude != null && station?.longitude != null;

    let rise: Date | undefined;
    let set: Date | undefined;

    if (hasLocation) {
      const times = SunCalc.getMoonTimes(
        now,
        station!.latitude!,
        station!.longitude!,
      );
      rise = times.rise;
      set = times.set;
    }

    // Find next full moon and next new moon by iterating day by day
    let nextFull: Date | undefined;
    let nextNew: Date | undefined;

    for (let i = 1; i <= 30; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);
      const checkIllum = SunCalc.getMoonIllumination(checkDate);

      if (!nextFull && checkIllum.phase >= 0.467 && checkIllum.phase <= 0.533) {
        nextFull = checkDate;
      }
      if (!nextNew && (checkIllum.phase < 0.033 || checkIllum.phase >= 0.967)) {
        nextNew = checkDate;
      }
      if (nextFull && nextNew) break;
    }

    return {
      phase: illum.phase,
      phaseName: getPhaseName(illum.phase),
      fraction: illum.fraction,
      moonrise: rise,
      moonset: set,
      nextFullMoon: nextFull,
      nextNewMoon: nextNew,
    };
  }, [station]);

  return (
    <WeatherCard title="Lunar" icon={<RiMoonLine className="h-4 w-4" />} info="Lunar phase, illumination percentage, and rise/set times. Phase and illumination are location-independent; rise/set times use your station's coordinates.">
      {/* Top row: SVG + phase info */}
      <div className="flex items-center gap-4">
        <MoonPhaseSVG phase={phase} />
        <div>
          <p className="text-sm font-medium text-text">{phaseName}</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-text">
            {Math.round(fraction * 100)}%
          </p>
        </div>
      </div>

      {/* 2x2 detail grid */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-text-faint">Moonrise</p>
          <p className="font-mono text-sm font-medium tabular-nums text-text-muted">
            {fmtTime(moonrise)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Moonset</p>
          <p className="font-mono text-sm font-medium tabular-nums text-text-muted">
            {fmtTime(moonset)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-faint">Full Moon</p>
          <p className="font-mono text-sm font-medium tabular-nums text-text-muted">
            {nextFullMoon ? fmtDate(nextFullMoon) : "\u2014"}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-faint">New Moon</p>
          <p className="font-mono text-sm font-medium tabular-nums text-text-muted">
            {nextNewMoon ? fmtDate(nextNewMoon) : "\u2014"}
          </p>
        </div>
      </div>
    </WeatherCard>
  );
}
