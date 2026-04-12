"use client";

import { useMemo } from "react";
import SunCalc from "suncalc";
import { RiSunLine } from "@remixicon/react";
import { useListStations } from "@/generated/stations/stations";
import type { Station } from "@/generated/models";
import WeatherCard from "./WeatherCard";
import InfoTip from "@/components/ui/InfoTip";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function SunCard() {
  const { data: stationsResponse } = useListStations();
  const stations = stationsResponse?.data as Station[] | undefined;
  const station = stations?.[0];
  const hasLocation = station?.latitude != null && station?.longitude != null;

  // Re-compute every minute
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

    // Day length
    const dayLengthMs = sunset.getTime() - sunrise.getTime();
    const dayLengthMinutes = Math.floor(dayLengthMs / 60000);
    const dayH = Math.floor(dayLengthMinutes / 60);
    const dayM = dayLengthMinutes % 60;
    const dayLengthStr = `${dayH}h ${dayM}m`;

    // Yesterday's day length & delta
    const yesterdayDayLengthMs =
      yesterdayTimes.sunset.getTime() - yesterdayTimes.sunrise.getTime();
    const deltaSec = Math.round((dayLengthMs - yesterdayDayLengthMs) / 1000);
    const absDelta = Math.abs(deltaSec);
    const deltaMin = Math.floor(absDelta / 60);
    const deltaSRemaining = absDelta % 60;
    const sign = deltaSec >= 0 ? "+" : "\u2212";
    const deltaStr = `${sign}${deltaMin}m ${deltaSRemaining}s`;
    const gaining = deltaSec >= 0;

    // Altitude in degrees (current)
    const currentAltDeg = (position.altitude * 180) / Math.PI;
    const altitudeDeg = Math.round(currentAltDeg);

    // Sun fraction along the arc
    const totalMs = sunset.getTime() - sunrise.getTime();
    const elapsedMs = now.getTime() - sunrise.getTime();
    const rawFraction = totalMs > 0 ? elapsedMs / totalMs : 0;
    const fraction = Math.max(0, Math.min(1, rawFraction));
    const isNight = rawFraction < 0 || rawFraction > 1;

    // Arc geometry: 0° → horizon (y=65), 90° → top of card (y=-8).
    const ARC_X0 = 20;
    const ARC_WIDTH = 160;
    const HORIZON_Y = 65;
    const ZENITH_Y = -8;
    const ALT_SPAN = HORIZON_Y - ZENITH_Y;
    const altToY = (deg: number) =>
      HORIZON_Y - Math.max(0, deg / 90) * ALT_SPAN;

    // Sample the real astronomical altitude curve from sunrise to sunset.
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

    // Current sun position from the real altitude
    const sunX = ARC_X0 + fraction * ARC_WIDTH;
    const sunY = altToY(currentAltDeg);

    return {
      sunrise,
      sunset,
      solarNoon,
      goldenHour,
      dayLengthStr,
      deltaStr,
      gaining,
      altitudeDeg,
      arcPath,
      sunX,
      sunY,
      isNight,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, station?.latitude, station?.longitude, minuteKey]);

  return (
    <WeatherCard title="Sun" icon={<RiSunLine className="h-4 w-4" />} info="Sunrise, sunset, and sun position calculated from your station's coordinates using astronomical algorithms. The arc is the real altitude curve for today — steep near sunrise/sunset and flatter near solar noon, because the sun's vertical motion slows as it approaches its peak. Updates every minute.">
      {!hasLocation || !sunData ? (
        <p className="text-sm text-text-muted">
          Station location not configured. Set latitude and longitude to see sun
          data.
        </p>
      ) : (
        <>
          {/* Sun Arc SVG */}
          <svg
            viewBox="0 -8 200 88"
            className="w-full"
            aria-label="Sun arc showing current sun position"
          >
            <defs>
              <radialGradient id="sun-glow">
                <stop
                  offset="0%"
                  stopColor="var(--color-primary)"
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-primary)"
                  stopOpacity="0"
                />
              </radialGradient>
            </defs>

            {/* Horizon line */}
            <line
              x1="10"
              y1="65"
              x2="190"
              y2="65"
              stroke="var(--color-border)"
              strokeWidth="0.5"
            />

            {/* Arc path — real astronomical altitude curve for today */}
            <path
              d={sunData.arcPath}
              stroke="var(--color-border)"
              strokeWidth="1"
              fill="none"
              strokeDasharray="4 3"
            />

            {/* Sun glow */}
            <circle
              cx={sunData.sunX}
              cy={sunData.sunY}
              r="12"
              fill="url(#sun-glow)"
              opacity={sunData.isNight ? 0.15 : 1}
            />

            {/* Sun dot */}
            <circle
              cx={sunData.sunX}
              cy={sunData.sunY}
              r="5"
              fill="var(--color-primary)"
              opacity={sunData.isNight ? 0.3 : 1}
            />

            {/* Sunrise label */}
            <text
              x="20"
              y="78"
              fontSize="8"
              fill="var(--color-text-faint)"
              textAnchor="middle"
            >
              {fmtTime(sunData.sunrise)}
            </text>

            {/* Sunset label */}
            <text
              x="180"
              y="78"
              fontSize="8"
              fill="var(--color-text-faint)"
              textAnchor="middle"
            >
              {fmtTime(sunData.sunset)}
            </text>
          </svg>

          {/* Stats grid */}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-faint">Day length</p>
              <p className="font-mono font-medium tabular-nums text-text-muted">
                {sunData.dayLengthStr}{" "}
                <span
                  className={`text-xs ${sunData.gaining ? "text-primary" : "text-text-faint"}`}
                >
                  ({sunData.deltaStr})
                </span>
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
