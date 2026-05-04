"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { convertTemp, convertSpeed, convertPressure, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { useHistoryData, type TimeRange } from "@/hooks/useHistoryData";
import { useResolvedColors } from "@/hooks/useResolvedColors";
import { useElementSize } from "@/hooks/useElementSize";
import { useAdaptiveBucket } from "@/hooks/useAdaptiveBucket";
import type { SeriesSpec } from "@/lib/adaptive-bucket";
import { toColumnar } from "@/lib/uplot-data";
import UPlotChart from "@/components/charts/UPlotChart";
import {
  temperatureOpts,
  humidityOpts,
  pressureOpts,
  windOpts,
  windOptsBucketed,
  rainOpts,
  solarUvOpts,
  temperatureSeriesMeta,
  humiditySeriesMeta,
  pressureSeriesMeta,
  windSeriesMeta,
  rainSeriesMeta,
  solarUvSeriesMeta,
  temperatureDefaultVisibility,
  type ResolvedColors,
} from "@/components/charts/chartConfigs";
import ChartLegend from "@/components/charts/ChartLegend";
import { useChartLegend } from "@/components/charts/useChartLegend";
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
  legend,
  panelRef,
}: {
  title: string;
  children: React.ReactNode;
  legend: React.ReactNode;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="weather-card rounded-xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div ref={panelRef} className="h-52">{children}</div>
      {legend}
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

  const isRaw = resolution === "raw";

  const dataUnix = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        time:
          typeof d.time === "number"
            ? d.time
            : new Date(d.time as string).getTime() / 1000,
      })),
    [data],
  );

  const visibleSpanS = useMemo(() => {
    if (zoomRange) return zoomRange.max - zoomRange.min;
    if (dataUnix.length === 0) return 0;
    return dataUnix[dataUnix.length - 1].time - dataUnix[0].time;
  }, [zoomRange, dataUnix]);

  const tempMeta = useMemo(() => temperatureSeriesMeta(), []);
  const humMeta = useMemo(() => humiditySeriesMeta(), []);
  const presMeta = useMemo(() => pressureSeriesMeta(), []);
  const wndMeta = useMemo(() => windSeriesMeta(), []);
  const rnMeta = useMemo(() => rainSeriesMeta(), []);
  const suvMeta = useMemo(() => solarUvSeriesMeta(), []);

  const windBucketSpec = useMemo<SeriesSpec<typeof dataUnix[number]>[]>(
    () => [
      { field: "wind_avg", agg: "avg" },
      { field: "wind_gust_max", agg: "max" },
    ],
    [],
  );
  const windPanelRef = useRef<HTMLDivElement>(null);
  const windSize = useElementSize(windPanelRef);

  const windBucket = useAdaptiveBucket({
    rawData: dataUnix,
    visibleSpanS,
    chartWidthPx: windSize.width,
    series: windBucketSpec,
    enabled: isRaw,
  });

  const useWindBars = isRaw && windBucket.bucketMeta != null;

  // Stable initial-visibility arrays. Temp depends on resolution (raw mode
  // hides Max/Min by default — see chartConfigs.ts and the design spec).
  const tempInitial = useMemo(
    () => temperatureDefaultVisibility(isRaw),
    [isRaw],
  );
  const tempLegendMeta = isRaw ? [tempMeta[1]!] : tempMeta;
  const allTrue1 = useMemo(() => [true], []);
  const allTrue2 = useMemo(() => [true, true], []);

  // Legend visibility per chart.
  // - Temp keys on `resolution` so range changes restore range-appropriate defaults.
  // - Wind/Solar persist for the session (no resetKey).
  // - Single-series charts (Hum/Pres/Rain) drive non-interactive chips with stable [true].
  const tempLegend = useChartLegend(tempInitial, resolution);
  const humLegend = useChartLegend(allTrue1);
  const presLegend = useChartLegend(allTrue1);
  const wndLegend = useChartLegend(allTrue2);
  const rnLegend = useChartLegend(allTrue1);
  const suvLegend = useChartLegend(allTrue2);
  const tempLegendVisibility = isRaw ? [tempLegend.visibility[1] ?? true] : tempLegend.visibility;

  // Convert to uPlot columnar format
  const columnar = useMemo(() => ({
    temp: toColumnar(data, "time", ["temp_max", "temp_avg", "temp_min"]),
    humidity: toColumnar(data, "time", ["humidity_avg"]),
    pressure: toColumnar(data, "time", ["pressure_avg"]),
    wind: useWindBars
      ? toColumnar(windBucket.rows, "time", ["wind_avg", "wind_gust_max"])
      : toColumnar(data, "time", ["wind_avg", "wind_gust_max"]),
    rain: toColumnar(data, "time", ["rain_max"]),
    solarUv: toColumnar(data, "time", ["solar_avg", "uv_max"]),
  }), [data, useWindBars, windBucket.rows]);

  const tickFmt = useCallback(
    (v: number) => formatTime(v, resolution),
    [resolution],
  );

  // Chart options — rebuilt when resolution, units, or theme change
  const tempOpts = useMemo(() => temperatureOpts(colors, tickFmt, isRaw), [colors, tickFmt, isRaw]);
  const humOpts = useMemo(() => humidityOpts(colors, tickFmt), [colors, tickFmt]);
  const presOpts = useMemo(() => pressureOpts(colors, tickFmt), [colors, tickFmt]);
  const wndOpts = useMemo(
    () => (useWindBars ? windOptsBucketed(colors, tickFmt) : windOpts(colors, tickFmt)),
    [colors, tickFmt, useWindBars],
  );
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
          <ChartPanel
            title={`Temperature (${tempUnit})`}
            legend={
              <ChartLegend
                series={tempLegendMeta}
                visibility={tempLegendVisibility}
                onToggle={isRaw ? undefined : tempLegend.toggle}
              />
            }
          >
            <UPlotChart
              options={tempZoomedOpts}
              data={columnar.temp}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={tempLegend.visibility}
            />
          </ChartPanel>

          <ChartPanel
            title="Humidity (%)"
            legend={<ChartLegend series={humMeta} visibility={humLegend.visibility} />}
          >
            <UPlotChart
              options={humZoomedOpts}
              data={columnar.humidity}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={humLegend.visibility}
            />
          </ChartPanel>

          <ChartPanel
            title={`Pressure (${pressureUnit})`}
            legend={<ChartLegend series={presMeta} visibility={presLegend.visibility} />}
          >
            <UPlotChart
              options={presZoomedOpts}
              data={columnar.pressure}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={presLegend.visibility}
            />
          </ChartPanel>

          <ChartPanel
            title={`Wind (${windUnit})`}
            panelRef={windPanelRef}
            legend={
              <ChartLegend
                series={wndMeta}
                visibility={wndLegend.visibility}
                onToggle={wndLegend.toggle}
              />
            }
          >
            <UPlotChart
              options={wndZoomedOpts}
              data={columnar.wind}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={wndLegend.visibility}
              bucketMeta={useWindBars ? windBucket.bucketMeta ?? undefined : undefined}
              aggregationLabels={useWindBars ? ["Avg Speed", "Peak Gust"] : undefined}
            />
          </ChartPanel>

          <ChartPanel
            title={`Rain (${rainUnit})`}
            legend={<ChartLegend series={rnMeta} visibility={rnLegend.visibility} />}
          >
            <UPlotChart
              options={rnZoomedOpts}
              data={columnar.rain}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={rnLegend.visibility}
            />
          </ChartPanel>

          <ChartPanel
            title="Solar (W/m²) & UV Index"
            legend={
              <ChartLegend
                series={suvMeta}
                visibility={suvLegend.visibility}
                onToggle={suvLegend.toggle}
              />
            }
          >
            <UPlotChart
              options={suvZoomedOpts}
              data={columnar.solarUv}
              syncKey="history"
              onZoom={handleZoom}
              seriesVisibility={suvLegend.visibility}
            />
          </ChartPanel>
        </div>
      )}
    </div>
  );
}
