"use client";

import { useMemo } from "react";
import SunCalc from "suncalc";
import { RiSunLine } from "@remixicon/react";
import { useListStations } from "@/generated/stations/stations";
import type { Station, Observation } from "@/generated/models";
import type { TrendDirection } from "@/hooks/useTrends";
import { cn, fmt } from "@/lib/utils";
import { CADENCES } from "@/lib/queryCadences";
import WeatherCard from "./WeatherCard";
import TrendIndicator from "./TrendIndicator";
import InfoTip from "@/components/ui/InfoTip";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function uvLevel(uv: number | null | undefined): { label: string; className: string } {
  if (uv == null) return { label: "\u2014", className: "text-text-muted" };
  if (uv < 3) return { label: "Low", className: "text-success" };
  if (uv < 6) return { label: "Moderate", className: "text-warning" };
  if (uv < 8) return { label: "High", className: "text-warning" };
  if (uv < 11) return { label: "Very High", className: "text-danger" };
  return { label: "Extreme", className: "text-danger" };
}

function glowRadius(solar: number | null | undefined): number {
  const s = Math.min(Math.max(solar ?? 0, 0), 1000);
  return 6 + Math.sqrt(s / 1000) * 18;
}

export default function SunCard({ data, solarTrend, uvTrend }: { data: Observation | null; solarTrend: TrendDirection; uvTrend: TrendDirection }) {
  const { data: stationsResponse } = useListStations({
    query: { refetchInterval: CADENCES.none },
  });
  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0];
  const hasLocation = station?.latitude != null && station?.longitude != null;

  const minuteKey = Math.floor(Date.now() / 60000);

  const sunData = useMemo(() => {
    if (!hasLocation) return null;

    const lat = station!.latitude!;
    const lon = station!.longitude!;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);

    const times = SunCalc.getTimes(now, lat, lon);
    const position = SunCalc.getPosition(now, lat, lon);
    const yesterdayTimes = SunCalc.getTimes(yesterday, lat, lon);

    const { sunrise, sunset, solarNoon, goldenHour } = times;

    const dayLengthMs = sunset.getTime() - sunrise.getTime();
    const dayLengthMinutes = Math.floor(dayLengthMs / 60000);
    const dayH = Math.floor(dayLengthMinutes / 60);
    const dayM = dayLengthMinutes % 60;
    const dayLengthStr = `${dayH}h ${dayM}m`;

    const yesterdayDayLengthMs =
      yesterdayTimes.sunset.getTime() - yesterdayTimes.sunrise.getTime();
    const deltaSec = Math.round((dayLengthMs - yesterdayDayLengthMs) / 1000);
    const absDelta = Math.abs(deltaSec);
    const deltaMin = Math.floor(absDelta / 60);
    const deltaSRemaining = absDelta % 60;
    const sign = deltaSec >= 0 ? "+" : "\u2212";
    const deltaStr = `${sign}${deltaMin}m ${deltaSRemaining}s`;
    const gaining = deltaSec >= 0;

    const currentAltDeg = (position.altitude * 180) / Math.PI;
    const altitudeDeg = Math.round(currentAltDeg);

    const totalMs = sunset.getTime() - sunrise.getTime();
    const elapsedMs = now.getTime() - sunrise.getTime();
    const rawFraction = totalMs > 0 ? elapsedMs / totalMs : 0;
    const fraction = Math.max(0, Math.min(1, rawFraction));
    const isNight = rawFraction < 0 || rawFraction > 1;

    const ARC_X0 = 20;
    const ARC_WIDTH = 160;
    const HORIZON_Y = 65;
    const ZENITH_Y = -8;
    const ALT_SPAN = HORIZON_Y - ZENITH_Y;
    const altToY = (deg: number) =>
      HORIZON_Y - Math.max(0, deg / 90) * ALT_SPAN;

    const NUM_SAMPLES = 61;
    const coords: string[] = [];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const t = i / (NUM_SAMPLES - 1);
      const sampleTime = new Date(sunrise.getTime() + t * totalMs);
      const sampleAlt =
        (SunCalc.getPosition(sampleTime, lat, lon).altitude * 180) / Math.PI;
      const x = ARC_X0 + t * ARC_WIDTH;
      const y = altToY(sampleAlt);
      coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const arcPath = "M " + coords.join(" L ");

    const sunX = ARC_X0 + fraction * ARC_WIDTH;
    const sunY = altToY(currentAltDeg);

    return {
      sunrise, sunset, solarNoon, goldenHour,
      dayLengthStr, deltaStr, gaining, altitudeDeg,
      arcPath, sunX, sunY, isNight,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, station?.latitude, station?.longitude, minuteKey]);

  const solar = data?.solar_radiation ?? 0;
  const glow = glowRadius(solar);
  const amp = Math.min(solar, 1000) / 1000 * 0.08;
  const uv = uvLevel(data?.uv_index);

  return (
    <WeatherCard title="Solar" icon={<RiSunLine className="h-4 w-4" />} info="Solar radiation, UV index, and sun position. The arc traces the real altitude curve from astronomical algorithms. The sun's glow scales with measured irradiance — brighter outside means a bigger, more active glow. Updates every minute.">
      {!hasLocation || !sunData ? (
        <p className="text-sm text-text-muted">
          Station location not configured. Set latitude and longitude to see sun
          data.
        </p>
      ) : (
        <>
          <svg
            viewBox="0 -8 200 88"
            className="w-full"
            aria-label="Sun arc showing current sun position"
          >
            <defs>
              <radialGradient id="sun-glow">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <line x1="10" y1="65" x2="190" y2="65" stroke="var(--color-border)" strokeWidth="0.5" />

            <path d={sunData.arcPath} stroke="var(--color-border)" strokeWidth="1" fill="none" strokeDasharray="4 3" />

            <circle
              data-testid="sun-glow"
              cx={sunData.sunX}
              cy={sunData.sunY}
              r={glow}
              fill="url(#sun-glow)"
              className="sun-glow-pulse"
              style={{
                "--glow-scale-max": 1 + amp,
                "--glow-opacity-min": 1 - amp * 0.5,
              } as React.CSSProperties}
            />

            <circle
              cx={sunData.sunX}
              cy={sunData.sunY}
              r="5"
              fill="var(--color-primary)"
              opacity={sunData.isNight ? 0.3 : 1}
            />

            <text x="20" y="78" fontSize="8" fill="var(--color-text-faint)" textAnchor="middle">
              {fmtTime(sunData.sunrise)}
            </text>
            <text x="180" y="78" fontSize="8" fill="var(--color-text-faint)" textAnchor="middle">
              {fmtTime(sunData.sunset)}
            </text>
          </svg>

          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-faint">Solar Radiation</p>
              <div className="flex items-center gap-1">
                <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data?.solar_radiation, 0)}</p>
                <span className="text-xs text-text-faint">W/m&sup2;</span>
                <TrendIndicator trend={solarTrend} className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-xs text-text-faint">UV Index <InfoTip text="WHO scale for ultraviolet radiation. 1–2 Low, 3–5 Moderate, 6–7 High, 8–10 Very High, 11+ Extreme. Sun protection needed at 3+." side="bottom" /></p>
              <div className="flex items-center gap-1">
                <p className="font-mono font-medium tabular-nums text-text-muted">{fmt(data?.uv_index, 1)}</p>
                <TrendIndicator trend={uvTrend} className="h-4 w-4" />
              </div>
              <p className={cn("text-xs font-medium", uv.className)}>{uv.label}</p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Day length</p>
              <p className="font-mono font-medium tabular-nums text-text-muted">
                {sunData.dayLengthStr}
              </p>
              <p className={`font-mono text-xs tabular-nums ${sunData.gaining ? "text-primary" : "text-text-faint"}`}>
                {sunData.deltaStr}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Solar noon <InfoTip text="When the sun reaches its highest point in the sky — not always 12:00 due to your longitude within the time zone." side="bottom" /></p>
              <p className="font-mono font-medium tabular-nums text-text-muted">
                {fmtTime(sunData.solarNoon)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Golden hour <InfoTip text="The period before sunset when sunlight is warm and diffused — prized for photography and golden outdoor light." side="bottom" /></p>
              <p className="font-mono font-medium tabular-nums text-text-muted">
                {fmtTime(sunData.goldenHour)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Altitude</p>
              <p className="font-mono font-medium tabular-nums text-text-muted">
                {sunData.altitudeDeg}&deg;
              </p>
            </div>
          </div>
        </>
      )}
    </WeatherCard>
  );
}
