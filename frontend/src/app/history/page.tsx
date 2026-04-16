"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { convertTemp, convertSpeed, convertPressure, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { useHistoryData, type TimeRange } from "@/hooks/useHistoryData";
import { useResolvedColors } from "@/hooks/useResolvedColors";
import { toColumnar } from "@/lib/uplot-data";
import UPlotChart from "@/components/charts/UPlotChart";
import {
  temperatureOpts,
  humidityOpts,
  pressureOpts,
  windOpts,
  rainOpts,
  solarUvOpts,
  type ResolvedColors,
} from "@/components/charts/chartConfigs";
import CalendarHeatmap from "@/components/history/CalendarHeatmap";

type ViewMode = "charts" | "calendar";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
];

const COLOR_VARS = [
  "--color-border",
  "--color-text-faint",
  "--color-surface-alt",
  "--color-primary",
  "--color-warning",
];

function formatTime(unix: number, resolution: string): string {
  const d = new Date(unix * 1000);
  if (resolution === "raw") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (resolution === "hourly") {
    // 7d view: show weekday at midnight, 24h time otherwise
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      return d.toLocaleDateString([], { weekday: "short" });
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (resolution === "daily") {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="weather-card rounded-xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div className="h-52">{children}</div>
    </div>
  );
}

export default function HistoryPage() {
  const [view, setView] = useState<ViewMode>("charts");
  const [range, setRange] = useState<TimeRange>("24h");
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const { data: rawData, isLoading, resolution } = useHistoryData(range);
  const { system } = useUnits();

  const rawColors = useResolvedColors(COLOR_VARS);
  const colors: ResolvedColors = useMemo(
    () => ({
      border: rawColors["--color-border"],
      textFaint: rawColors["--color-text-faint"],
      surfaceAlt: rawColors["--color-surface-alt"],
      primary: rawColors["--color-primary"],
      warning: rawColors["--color-warning"],
    }),
    [rawColors],
  );

  // Convert data points to selected unit system
  const data = useMemo(
    () =>
      rawData.map((d) => ({
        ...d,
        temp_avg: convertTemp(d.temp_avg, system).value,
        temp_min: convertTemp(d.temp_min, system).value,
        temp_max: convertTemp(d.temp_max, system).value,
        pressure_avg: convertPressure(d.pressure_avg, system).value,
        wind_avg: convertSpeed(d.wind_avg, system).value,
        wind_gust_max: convertSpeed(d.wind_gust_max, system).value,
        rain_max: convertRain(d.rain_max, system).value,
      })),
    [rawData, system],
  );

  // Convert to uPlot columnar format
  const columnar = useMemo(() => ({
    temp: toColumnar(data, "time", ["temp_max", "temp_avg", "temp_min"]),
    humidity: toColumnar(data, "time", ["humidity_avg"]),
    pressure: toColumnar(data, "time", ["pressure_avg"]),
    wind: toColumnar(data, "time", ["wind_avg", "wind_gust_max"]),
    rain: toColumnar(data, "time", ["rain_max"]),
    solarUv: toColumnar(data, "time", ["solar_avg", "uv_max"]),
  }), [data]);

  const tickFmt = useCallback(
    (v: number) => formatTime(v, resolution),
    [resolution],
  );

  const isRaw = resolution === "raw";

  // Chart options — rebuilt when resolution, units, or theme change
  const tempOpts = useMemo(() => temperatureOpts(colors, tickFmt, isRaw), [colors, tickFmt, isRaw]);
  const humOpts = useMemo(() => humidityOpts(colors, tickFmt), [colors, tickFmt]);
  const presOpts = useMemo(() => pressureOpts(colors, tickFmt), [colors, tickFmt]);
  const wndOpts = useMemo(() => windOpts(colors, tickFmt), [colors, tickFmt]);
  const rainDecimals = system === "imperial" ? 3 : 1;
  const rnOpts = useMemo(() => rainOpts(colors, tickFmt, rainDecimals), [colors, tickFmt, rainDecimals]);
  const suvOpts = useMemo(() => solarUvOpts(colors, tickFmt), [colors, tickFmt]);

  // Zoom
  const handleZoom = useCallback((min: number, max: number) => {
    setZoomRange({ min, max });
  }, []);
  const handleResetZoom = useCallback(() => setZoomRange(null), []);

  // Apply zoom to each chart's options — memoized per chart so parent rerenders
  // (WebSocket ticks, unit toggles) don't churn the options reference and cause
  // UPlotChart to destroy/recreate. Only rebuilds when base opts or zoomRange change.
  const applyZoom = useCallback(
    (opts: Omit<uPlot.Options, "width" | "height">) => {
      if (!zoomRange) return opts;
      return {
        ...opts,
        scales: {
          ...opts.scales,
          x: { min: zoomRange.min, max: zoomRange.max },
        },
      };
    },
    [zoomRange],
  );
  const tempZoomedOpts = useMemo(() => applyZoom(tempOpts), [applyZoom, tempOpts]);
  const humZoomedOpts = useMemo(() => applyZoom(humOpts), [applyZoom, humOpts]);
  const presZoomedOpts = useMemo(() => applyZoom(presOpts), [applyZoom, presOpts]);
  const wndZoomedOpts = useMemo(() => applyZoom(wndOpts), [applyZoom, wndOpts]);
  const rnZoomedOpts = useMemo(() => applyZoom(rnOpts), [applyZoom, rnOpts]);
  const suvZoomedOpts = useMemo(() => applyZoom(suvOpts), [applyZoom, suvOpts]);

  const tempUnit = system === "metric" ? "°C" : "°F";
  const pressureUnit = system === "metric" ? "hPa" : "inHg";
  const windUnit = system === "metric" ? "km/h" : "mph";
  const rainUnit = system === "metric" ? "mm" : "in";

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl font-semibold text-text">History</h1>
          <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
            {(["charts", "calendar"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-all",
                  view === v
                    ? "bg-primary/15 text-primary"
                    : "text-text-faint hover:text-text-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {view === "charts" && (
          <div className="flex items-center gap-2">
            {zoomRange && (
              <button
                onClick={handleResetZoom}
                className="rounded-md border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                Reset Zoom
              </button>
            )}
            <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => { setRange(r.value); setZoomRange(null); }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
                    range === r.value
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {view === "calendar" ? (
        <div className="weather-card rounded-xl p-5">
          <CalendarHeatmap />
        </div>
      ) : isLoading ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          No data for this time range
        </div>
      ) : (
        <div className="card-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartPanel title={`Temperature (${tempUnit})`}>
            <UPlotChart options={tempZoomedOpts} data={columnar.temp} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>

          <ChartPanel title="Humidity (%)">
            <UPlotChart options={humZoomedOpts} data={columnar.humidity} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>

          <ChartPanel title={`Pressure (${pressureUnit})`}>
            <UPlotChart options={presZoomedOpts} data={columnar.pressure} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>

          <ChartPanel title={`Wind (${windUnit})`}>
            <UPlotChart options={wndZoomedOpts} data={columnar.wind} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>

          <ChartPanel title={`Rain (${rainUnit})`}>
            <UPlotChart options={rnZoomedOpts} data={columnar.rain} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>

          <ChartPanel title="Solar (W/m&sup2;) & UV Index">
            <UPlotChart options={suvZoomedOpts} data={columnar.solarUv} syncKey="history" onZoom={handleZoom} />
          </ChartPanel>
        </div>
      )}
    </div>
  );
}
