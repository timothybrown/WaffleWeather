"use client";

import { useState, useEffect, useMemo } from "react";
import localFont from "next/font/local";
import SunCalc from "suncalc";
import { keepPreviousData } from "@tanstack/react-query";
import type { AggregatedObservation, Observation, Station } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
import { useListStations } from "@/generated/stations/stations";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useUnits } from "@/providers/UnitsProvider";
import { useTrends } from "@/hooks/useTrends";
import { CADENCES } from "@/lib/queryCadences";
import { fmt, degToCompass } from "@/lib/utils";
import {
  convertTemp,
  convertSpeed,
  convertPressure,
  convertRainRate,
  convertRain,
} from "@/lib/units";

import VFDDisplay from "@/components/console/VFDDisplay";
import BarometerGauge from "@/components/console/BarometerGauge";
import WindCompass from "@/components/console/WindCompass";
import ForecastZone from "@/components/console/ForecastZone";
import ConsoleTicker from "@/components/console/ConsoleTicker";
import MoonPhaseSmall from "@/components/console/MoonPhaseSmall";

const dseg7 = localFont({
  src: "../fonts/DSEG7Modern-Regular.woff2",
  variable: "--font-dseg7",
  display: "swap",
});

const dotrice = localFont({
  src: "../fonts/Dotrice-Regular.woff2",
  variable: "--font-dotrice",
  display: "swap",
});

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Force-dark CSS variable overrides
const DARK_VARS: React.CSSProperties = {
  "--color-primary": "#d4a574",
  "--color-primary-light": "#e8c49a",
  "--color-surface": "#1a1714",
  "--color-surface-alt": "#262220",
  "--color-surface-hover": "#34302c",
  "--color-border": "#3a3530",
  "--color-text": "#f0e8dc",
  "--color-text-muted": "#a89a8a",
  "--color-text-faint": "#706860",
  "--color-success": "#7ec89a",
  "--color-warning": "#dba355",
  "--color-danger": "#d47272",
} as React.CSSProperties;

export default function ConsolePage() {
  // ── Data fetching ─────────────────────────────────────────────
  const { data: apiResponse } = useGetLatestObservation(undefined, {
    query: { refetchInterval: CADENCES.live },
  });
  const { latestObservation: wsData } = useWebSocket();
  const trends = useTrends();
  const { system } = useUnits();
  const { data: stationsResponse } = useListStations({
    query: { refetchInterval: CADENCES.none },
  });

  const apiData = apiResponse?.data as Observation | undefined;
  const data: Observation | null = wsData
    ? ({ ...apiData, ...wsData } as Observation)
    : apiData ?? null;

  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0];
  const hasLocation = station?.latitude != null && station?.longitude != null;

  // ── 24h pressure history for the barometer dot chart ──────────
  // Use hourly aggregates endpoint (one row per hour) instead of raw
  // observations — gives full 24h coverage with ~24 rows, not thousands.
  const pressureRange = useMemo(() => {
    const now = new Date();
    return {
      start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      end: now.toISOString(),
    };
    // Re-compute every minute so the window slides forward
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(Date.now() / 60_000)]);
  const { data: historyResponse } = useListHourlyObservations(
    pressureRange,
    { query: { refetchInterval: CADENCES.summary, placeholderData: keepPreviousData } },
  );
  const pressureHistory = useMemo<AggregatedObservation[]>(() => {
    const items = (historyResponse as { data?: AggregatedObservation[] } | undefined)?.data;
    return items ?? [];
  }, [historyResponse]);

  // ── Live clock (defer to client to avoid hydration mismatch) ──
  const [clockStr, setClockStr] = useState("--:--:--");
  useEffect(() => {
    const tick = () =>
      setClockStr(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Sun data ──────────────────────────────────────────────────
  const minuteKey = Math.floor(Date.now() / 60000);
  const sunData = useMemo(() => {
    if (!hasLocation) return null;
    const lat = station!.latitude!;
    const lon = station!.longitude!;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);

    const times = SunCalc.getTimes(now, lat, lon);
    const yesterdayTimes = SunCalc.getTimes(yesterday, lat, lon);

    const { sunrise, sunset } = times;
    const dayLengthMs = sunset.getTime() - sunrise.getTime();
    const dayLengthMinutes = Math.floor(dayLengthMs / 60000);
    const dayH = Math.floor(dayLengthMinutes / 60);
    const dayM = dayLengthMinutes % 60;

    const yesterdayDayLengthMs = yesterdayTimes.sunset.getTime() - yesterdayTimes.sunrise.getTime();
    const deltaSec = Math.round((dayLengthMs - yesterdayDayLengthMs) / 1000);
    const absDelta = Math.abs(deltaSec);
    const deltaMin = Math.floor(absDelta / 60);
    const deltaSRemaining = absDelta % 60;
    const sign = deltaSec >= 0 ? "+" : "\u2212";

    return {
      sunrise,
      sunset,
      dayLengthStr: `${dayH}h ${dayM}m`,
      deltaStr: `${sign}${deltaMin}m ${deltaSRemaining}s`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, station?.latitude, station?.longitude, minuteKey]);

  // ── Moon data ─────────────────────────────────────────────────
  const moonPhase = useMemo(() => {
    return SunCalc.getMoonIllumination(new Date()).phase;
  }, [minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Converted values ──────────────────────────────────────────
  const temp = convertTemp(data?.temp_outdoor, system);
  const feels = convertTemp(data?.feels_like, system);
  const dew = convertTemp(data?.dewpoint, system);
  const indoor = convertTemp(data?.temp_indoor, system);
  const rainRate = convertRainRate(data?.rain_rate, system);
  const rainDaily = convertRain(data?.rain_daily, system);
  const rainMonthly = convertRain(data?.rain_monthly, system);
  const rainDp = system === "imperial" ? 3 : 1;

  // ── Ticker text ───────────────────────────────────────────────
  const tickerText = [
    data?.zambretti_forecast,
    temp.value != null ? `${fmt(temp.value)}${temp.unit}` : null,
    data?.wind_dir != null ? `${degToCompass(data.wind_dir)} ${fmt(convertSpeed(data?.wind_speed, system).value)} ${convertSpeed(data?.wind_speed, system).unit}` : null,
    data?.pressure_rel != null ? `${fmt(convertPressure(data.pressure_rel, system).value, 2)} ${convertPressure(data.pressure_rel, system).unit}` : null,
    data?.humidity_outdoor != null ? `Humidity ${data.humidity_outdoor}%` : null,
    rainDaily.value != null ? `Rain today ${fmt(rainDaily.value, rainDp)} ${rainDaily.unit}` : null,
  ]
    .filter(Boolean)
    .join(" \u00B7 ");

  return (
    <div className="p-4 sm:p-6">
      <div
        className={`${dseg7.variable} ${dotrice.variable} console-bezel rounded-2xl mx-auto max-w-5xl overflow-hidden`}
        style={DARK_VARS}
      >
        {/* ── Header bar ──────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-[rgba(212,165,116,0.08)] px-5 py-3">
          <h1 className="font-display text-lg font-semibold tracking-wide vfd-glow">
            WaffleWeather Console
          </h1>
          <div className="flex items-center gap-3">
            <MoonPhaseSmall phase={moonPhase} />
            <VFDDisplay value={clockStr} size="md" pulse />
          </div>
        </div>

        {/* ── Row 1: Forecast / Barometer / Wind ──────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3">
          {/* Forecast */}
          <div className="console-zone vfd-scanlines rounded-none p-4 flex flex-col">
            <ZoneLabel>Forecast</ZoneLabel>
            <div className="flex-1 flex items-center justify-center">
              <ForecastZone forecast={data?.zambretti_forecast} />
            </div>
          </div>

          {/* Barometer */}
          <div className="console-zone vfd-scanlines rounded-none p-4 flex flex-col">
            <ZoneLabel>Barometer</ZoneLabel>
            <div className="flex-1 flex items-center justify-center">
              <BarometerGauge
                pressure={data?.pressure_rel}
                trend={trends.pressure_rel}
                history={pressureHistory}
                system={system}
              />
            </div>
          </div>

          {/* Wind */}
          <div className="console-zone vfd-scanlines rounded-none p-4 flex flex-col">
            <ZoneLabel>Wind</ZoneLabel>
            <div className="flex-1 flex items-center justify-center">
              <WindCompass
                direction={data?.wind_dir}
                speed={data?.wind_speed}
                gust={data?.wind_gust}
                system={system}
              />
            </div>
          </div>
        </div>

        {/* ── Row 2: Outdoor / Indoor / Rain ──────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3">
          {/* Outdoor */}
          <div className="console-zone vfd-scanlines rounded-none p-4">
            <ZoneLabel>Outdoor</ZoneLabel>
            <div className="mt-2">
              <VFDDisplay value={fmt(temp.value)} size="xl" unit={temp.unit} pulse />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <SubValue label="Feels" value={`${fmt(feels.value)}\u00B0`} />
              <SubValue label="Dew" value={`${fmt(dew.value)}\u00B0`} />
              <SubValue label="Hum" value={data?.humidity_outdoor != null ? `${data.humidity_outdoor}%` : "\u2014"} />
            </div>
          </div>

          {/* Indoor */}
          <div className="console-zone vfd-scanlines rounded-none p-4">
            <ZoneLabel>Indoor</ZoneLabel>
            <div className="mt-2">
              <VFDDisplay value={fmt(indoor.value)} size="xl" unit={indoor.unit} pulse />
            </div>
            <div className="mt-3">
              <SubValue label="Humidity" value={data?.humidity_indoor != null ? `${data.humidity_indoor}%` : "\u2014"} />
            </div>
          </div>

          {/* Rain */}
          <div className="console-zone vfd-scanlines rounded-none p-4">
            <ZoneLabel>Rain</ZoneLabel>
            <div className="mt-2">
              <VFDDisplay value={fmt(rainRate.value, rainDp)} size="lg" unit={rainRate.unit} pulse />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SubValue label="Today" value={`${fmt(rainDaily.value, rainDp)} ${rainDaily.unit}`} />
              <SubValue label="Month" value={`${fmt(rainMonthly.value, rainDp)} ${rainMonthly.unit}`} />
            </div>
          </div>
        </div>

        {/* ── Row 3: Sun / UV-Solar-Lightning ─────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Sun */}
          <div className="console-zone vfd-scanlines rounded-none p-4">
            <ZoneLabel>Sun</ZoneLabel>
            {sunData ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <SubValue label="Rise" value={fmtTime(sunData.sunrise)} />
                <SubValue label="Set" value={fmtTime(sunData.sunset)} />
                <SubValue label="Day" value={sunData.dayLengthStr} />
                <SubValue label="Delta" value={sunData.deltaStr} />
              </div>
            ) : (
              <p className="mt-2 font-mono text-xs vfd-glow-dim">No location</p>
            )}
          </div>

          {/* UV / Solar / Lightning */}
          <div className="console-zone vfd-scanlines rounded-none p-4">
            <ZoneLabel>UV / Solar / Lightning</ZoneLabel>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <SubValue label="UV" value={data?.uv_index != null ? String(data.uv_index) : "\u2014"} />
              <SubValue label="Solar" value={data?.solar_radiation != null ? `${fmt(data.solar_radiation, 0)}` : "\u2014"} unit="W/m²" />
              <SubValue
                label="Strikes"
                value={data?.lightning_count != null ? String(data.lightning_count) : "\u2014"}
              />
            </div>
          </div>
        </div>

        {/* ── Ticker ──────────────────────────────────────────── */}
        <div className="border-t border-[rgba(212,165,116,0.08)] px-5 py-2">
          <ConsoleTicker text={tickerText || "Waiting for data\u2026"} />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.2em] vfd-glow-dim">
      {children}
    </div>
  );
}

function SubValue({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] vfd-glow-dim opacity-70">
        {label}
      </p>
      <p className="font-mono text-sm font-medium tabular-nums vfd-glow">
        {value}
        {unit && <span className="ml-1 text-[10px] vfd-glow-dim">{unit}</span>}
      </p>
    </div>
  );
}
