"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { convertTemp, convertSpeed, convertPressure, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { useHistoryData } from "@/hooks/useHistoryData";
import { useStationTimezoneStatus, getStationTodayString } from "@/hooks/useStationTimezone";
import {
  canonicalizeFutureAnchor,
  isValidYyyyMmDd,
  nextAnchor,
  periodForAnchor,
  prevAnchor,
  type Range,
} from "@/lib/historyPeriod";
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
  solarUvOptsBucketed,
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
import HistoryPager from "@/components/history/HistoryPager";

type ViewMode = "charts" | "calendar";
type Mode = "live" | "picked";
type ZoomRange = { key: string; min: number; max: number };

const VALID_RANGES: readonly Range[] = ["day", "week", "month", "year"];
const VALID_VIEWS: readonly ViewMode[] = ["charts", "calendar"];

const LIVE_RANGE_LABELS: Record<Range, string> = {
  day: "24 Hours",
  week: "7 Days",
  month: "30 Days",
  year: "12 Months",
};

const PICKED_RANGE_LABELS: Record<Range, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

const LIVE_PERIOD_LABELS: Record<Range, string> = {
  day: "Last 24 Hours",
  week: "Last 7 Days",
  month: "Last 30 Days",
  year: "Last 12 Months",
};

const COLOR_VARS = [
  "--color-border",
  "--color-text-faint",
  "--color-surface-alt",
  "--color-primary",
  "--color-warning",
];

function isRange(value: string | null): value is Range {
  return VALID_RANGES.includes(value as Range);
}

function isViewMode(value: string | null): value is ViewMode {
  return VALID_VIEWS.includes(value as ViewMode);
}

function buildHref(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

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
  /** Accepts either a ref object or a callback ref. Callback refs let
   *  consumers observe ref attachment, which `useElementSize` relies on
   *  to set up its ResizeObserver after conditional parent rendering. */
  panelRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="weather-card rounded-xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div ref={panelRef} className="h-52">{children}</div>
      {legend}
    </div>
  );
}

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { timezone, isSettled: isTimezoneSettled } = useStationTimezoneStatus();
  const todayStr = getStationTodayString(timezone);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);

  const rawRange = searchParams.get("range");
  const range: Range = isRange(rawRange) ? rawRange : "day";

  const rawView = searchParams.get("view");
  const view: ViewMode = isViewMode(rawView) ? rawView : "charts";

  const rawDate = searchParams.get("date");
  const validDate = rawDate && isValidYyyyMmDd(rawDate) ? rawDate : null;
  const canonicalDate = useMemo(
    () => (validDate ? canonicalizeFutureAnchor(validDate, timezone) : null),
    [validDate, timezone],
  );
  const anchor = canonicalDate ?? undefined;
  const mode: Mode = anchor ? "picked" : "live";
  const zoomKey = `${view}:${range}:${anchor ?? "live"}`;
  const activeZoomRange = zoomRange?.key === zoomKey ? zoomRange : null;

  useEffect(() => {
    if (!isTimezoneSettled || !validDate || !canonicalDate || validDate === canonicalDate) {
      return;
    }

    const next = new URLSearchParams(searchParamString);
    next.set("date", canonicalDate);
    router.replace(buildHref(next));
  }, [canonicalDate, isTimezoneSettled, router, searchParamString, validDate]);

  const period = useMemo(
    () => (anchor ? periodForAnchor(anchor, range, timezone) : null),
    [anchor, range, timezone],
  );
  const periodLabel = period?.label ?? LIVE_PERIOD_LABELS[range];
  const canGoNext = period ? !period.isCurrent : false;

  const dataInput = useMemo(
    () => ({ range, mode, anchor, timezone }),
    [range, mode, anchor, timezone],
  );
  const {
    data: rawData,
    isLoading,
    isError,
    error,
    resolution,
    refetch,
  } = useHistoryData(dataInput);
  const { system } = useUnits();

  const setRange = useCallback((nextRange: Range) => {
    const next = new URLSearchParams(searchParamString);
    next.set("range", nextRange);
    router.push(buildHref(next));
    setZoomRange(null);
  }, [router, searchParamString]);

  const setView = useCallback((nextView: ViewMode) => {
    const next = new URLSearchParams(searchParamString);
    if (nextView === "charts") {
      next.delete("view");
    } else {
      next.set("view", nextView);
    }
    router.push(buildHref(next));
    setZoomRange(null);
  }, [router, searchParamString]);

  const setDate = useCallback((date: string) => {
    const next = new URLSearchParams(searchParamString);
    next.set("date", date);
    router.push(buildHref(next));
    setZoomRange(null);
  }, [router, searchParamString]);

  const moveAnchor = useCallback((date: string) => {
    const next = new URLSearchParams(searchParamString);
    next.set("date", date);
    router.replace(buildHref(next));
    setZoomRange(null);
  }, [router, searchParamString]);

  const clearDate = useCallback(() => {
    const next = new URLSearchParams(searchParamString);
    next.delete("date");
    router.push(buildHref(next));
    setZoomRange(null);
  }, [router, searchParamString]);

  const handlePagerPrev = useCallback(() => {
    if (!anchor) return;
    moveAnchor(prevAnchor(anchor, range));
  }, [anchor, moveAnchor, range]);

  const handlePagerNext = useCallback(() => {
    if (!anchor || !canGoNext) return;
    moveAnchor(nextAnchor(anchor, range));
  }, [anchor, canGoNext, moveAnchor, range]);

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
    if (activeZoomRange) return activeZoomRange.max - activeZoomRange.min;
    if (dataUnix.length === 0) return 0;
    return dataUnix[dataUnix.length - 1].time - dataUnix[0].time;
  }, [activeZoomRange, dataUnix]);

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
  const { ref: windPanelRef, size: windSize } = useElementSize<HTMLDivElement>();

  const windBucket = useAdaptiveBucket({
    rawData: dataUnix,
    visibleSpanS,
    chartWidthPx: windSize.width,
    series: windBucketSpec,
    enabled: isRaw,
  });

  const useWindBars = isRaw && windBucket.bucketMeta != null;

  const solarBucketSpec = useMemo<SeriesSpec<typeof dataUnix[number]>[]>(
    () => [
      { field: "solar_avg", agg: "avg" },
      { field: "uv_max", agg: "max" },
    ],
    [],
  );
  const { ref: solarPanelRef, size: solarSize } = useElementSize<HTMLDivElement>();

  const solarBucket = useAdaptiveBucket({
    rawData: dataUnix,
    visibleSpanS,
    chartWidthPx: solarSize.width,
    series: solarBucketSpec,
    enabled: isRaw,
  });

  const useSolarBars = isRaw && solarBucket.bucketMeta != null;

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
    solarUv: useSolarBars
      ? toColumnar(solarBucket.rows, "time", ["solar_avg", "uv_max"])
      : toColumnar(data, "time", ["solar_avg", "uv_max"]),
  }), [data, useWindBars, windBucket.rows, useSolarBars, solarBucket.rows]);

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
  const suvOpts = useMemo(
    () => (useSolarBars ? solarUvOptsBucketed(colors, tickFmt) : solarUvOpts(colors, tickFmt)),
    [colors, tickFmt, useSolarBars],
  );

  // Zoom
  const handleZoom = useCallback((min: number, max: number) => {
    setZoomRange({ key: zoomKey, min, max });
  }, [zoomKey]);
  const handleResetZoom = useCallback(() => setZoomRange(null), []);

  // Apply zoom to each chart's options — memoized per chart so parent rerenders
  // (WebSocket ticks, unit toggles) don't churn the options reference and cause
  // UPlotChart to destroy/recreate. Only rebuilds when base opts or zoomRange change.
  const applyZoom = useCallback(
    (opts: Omit<uPlot.Options, "width" | "height">) => {
      if (!activeZoomRange) return opts;
      return {
        ...opts,
        scales: {
          ...opts.scales,
          x: { min: activeZoomRange.min, max: activeZoomRange.max },
        },
      };
    },
    [activeZoomRange],
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
  const rangeLabels = mode === "picked" ? PICKED_RANGE_LABELS : LIVE_RANGE_LABELS;

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
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-2">
            {activeZoomRange && (
              <button
                onClick={handleResetZoom}
                className="rounded-md border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                Reset Zoom
              </button>
            )}
            <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
              {VALID_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
                    range === r
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {rangeLabels[r]}
                </button>
              ))}
            </div>
            <HistoryPager
              mode={mode}
              label={periodLabel}
              canGoNext={canGoNext}
              maxDate={todayStr}
              selectedDate={anchor}
              onPrev={handlePagerPrev}
              onNext={handlePagerNext}
              onPickDate={setDate}
              onReturnToLive={clearDate}
            />
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
      ) : isError ? (
        <div className="flex h-96 flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="font-display text-xl font-semibold text-text">
            Couldn&apos;t load history
          </h2>
          <p className="max-w-sm text-sm text-text-muted">
            {error instanceof Error
              ? error.message
              : "The server returned an error."}
          </p>
          <button
            onClick={() => {
              void refetch();
            }}
            className="mt-1 rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
          >
            Try again
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          No data for {periodLabel}
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
            panelRef={solarPanelRef}
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
              bucketMeta={useSolarBars ? solarBucket.bucketMeta ?? undefined : undefined}
              aggregationLabels={useSolarBars ? ["Avg Solar", "Peak UV"] : undefined}
            />
          </ChartPanel>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <HistoryPageInner />
    </Suspense>
  );
}
