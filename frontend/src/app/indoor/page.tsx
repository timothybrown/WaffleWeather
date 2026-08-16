"use client";

import { Suspense, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RiTempColdLine, RiDropLine } from "@remixicon/react";
import { cn, fmt, timeAgo } from "@/lib/utils";
import { convertTemp } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { useIndoorData } from "@/hooks/useIndoorData";
import { useIndoorCurrent } from "@/hooks/useIndoorCurrent";
import {
  useStationTimezoneStatus,
  getStationTodayString,
} from "@/hooks/useStationTimezone";
import {
  canonicalizeFutureAnchor,
  isValidYyyyMmDd,
  nextAnchor,
  periodForAnchor,
  prevAnchor,
  type Range,
} from "@/lib/historyPeriod";
import { formatChartTime } from "@/lib/chartTime";
import { useResolvedColors } from "@/hooks/useResolvedColors";
import { toColumnar } from "@/lib/uplot-data";
import type { TrendDirection } from "@/hooks/useTrends";
import UPlotChart from "@/components/charts/UPlotChart";
import ChartLegend from "@/components/charts/ChartLegend";
import { useChartLegend } from "@/components/charts/useChartLegend";
import {
  temperatureOpts,
  humidityOpts,
  temperatureSeriesMeta,
  humiditySeriesMeta,
  temperatureDefaultVisibility,
  type ResolvedColors,
} from "@/components/charts/chartConfigs";
import HistoryPager from "@/components/history/HistoryPager";
import WeatherCard from "@/components/dashboard/WeatherCard";
import TrendIndicator from "@/components/dashboard/TrendIndicator";
import Sparkline from "@/components/dashboard/Sparkline";

type ViewMode = "current" | "history";

const VALID_RANGES: readonly Range[] = ["day", "week", "month", "year"];

const RANGE_LABELS: Record<Range, string> = {
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

// Matches the outdoor thresholds in useTrends so indoor and outdoor cards
// agree on what counts as "changing" rather than sensor noise.
const TEMP_TREND_THRESHOLD_C = 0.2;
const HUMIDITY_TREND_THRESHOLD_PCT = 1;

function isRange(value: string | null): value is Range {
  return VALID_RANGES.includes(value as Range);
}

/** Convert a signed delta into the direction TrendIndicator expects. */
function toTrendDirection(
  delta: number | null,
  threshold: number,
): TrendDirection {
  if (delta == null) return null;
  if (Math.abs(delta) < threshold) return "flat";
  return delta > 0 ? "up" : "down";
}

function applyUrl(params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const query = params.toString();
  const href = query ? `/indoor?${query}` : "/indoor";
  const current = `${window.location.pathname}${window.location.search}`;
  if (href !== current) {
    window.history.pushState(null, "", href);
  }
}

/** Mirrors the Observatory card body exactly — value, inline unit, trend —
 *  so the two pages read as one system. See TemperatureCard/HumidityCard. */
function ReadingBody({
  value,
  unit,
  decimals,
  trend,
  sparkline,
  sparklineColor,
  sparklineLabel,
}: {
  value: number | null | undefined;
  unit: string;
  decimals: number;
  trend: TrendDirection;
  sparkline: (number | null)[];
  sparklineColor: string;
  sparklineLabel: string;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-text">
          {fmt(value, decimals)}
        </span>
        <span className="text-lg text-text-faint">{unit}</span>
        <TrendIndicator trend={trend} />
      </div>
      {sparkline.length >= 2 && (
        <div className="mt-auto pt-3">
          <Sparkline
            data={sparkline}
            color={sparklineColor}
            label={sparklineLabel}
          />
        </div>
      )}
    </>
  );
}

function ChartPanel({
  title,
  children,
  legend,
}: {
  title: string;
  children: React.ReactNode;
  legend: React.ReactNode;
}) {
  return (
    <div className="weather-card rounded-xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      <div className="h-52">{children}</div>
      {legend}
    </div>
  );
}

function IndoorPageInner() {
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { timezone } = useStationTimezoneStatus();
  const todayStr = getStationTodayString(timezone);
  const { system } = useUnits();

  const view: ViewMode =
    searchParams.get("view") === "history" ? "history" : "current";

  const rawRange = searchParams.get("range");
  const range: Range = isRange(rawRange) ? rawRange : "day";

  const rawDate = searchParams.get("date");
  const validDate = rawDate && isValidYyyyMmDd(rawDate) ? rawDate : null;
  const anchor = useMemo(
    () => (validDate ? canonicalizeFutureAnchor(validDate, timezone) : undefined),
    [validDate, timezone],
  );
  const mode = anchor ? ("picked" as const) : ("live" as const);

  const period = useMemo(
    () => (anchor ? periodForAnchor(anchor, range, timezone) : null),
    [anchor, range, timezone],
  );
  const periodLabel = period?.label ?? LIVE_PERIOD_LABELS[range];
  const canGoNext = period ? !period.isCurrent : false;

  const current = useIndoorCurrent();
  const dataInput = useMemo(
    () => ({ range, mode, anchor, timezone }),
    [range, mode, anchor, timezone],
  );
  const { data, isLoading, isError, error, resolution, refetch } =
    useIndoorData(dataInput);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParamString);
      if (value === null) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      applyUrl(next);
    },
    [searchParamString],
  );

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

  const converted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        temp_avg: convertTemp(d.temp_avg, system).value,
        temp_min: convertTemp(d.temp_min, system).value,
        temp_max: convertTemp(d.temp_max, system).value,
      })),
    [data, system],
  );

  const isRaw = resolution === "raw";

  const tickFmt = useCallback(
    (v: number) => formatChartTime(v, resolution, timezone),
    [resolution, timezone],
  );

  const tempMeta = useMemo(() => temperatureSeriesMeta(), []);
  const humMeta = useMemo(() => humiditySeriesMeta(), []);
  const tempInitial = useMemo(
    () => temperatureDefaultVisibility(isRaw),
    [isRaw],
  );
  const allTrue1 = useMemo(() => [true], []);

  const tempLegend = useChartLegend(tempInitial, resolution);
  const humLegend = useChartLegend(allTrue1);

  const columnar = useMemo(
    () => ({
      temp: toColumnar(converted, "time", ["temp_max", "temp_avg", "temp_min"]),
      humidity: toColumnar(converted, "time", ["humidity_avg"]),
    }),
    [converted],
  );

  const tempOpts = useMemo(
    () => temperatureOpts(colors, tickFmt, isRaw),
    [colors, tickFmt, isRaw],
  );
  const humOpts = useMemo(
    () => humidityOpts(colors, tickFmt),
    [colors, tickFmt],
  );

  const tempUnit = system === "metric" ? "°C" : "°F";
  // Unit comes from convertTemp rather than the local constant so the card
  // renders it inline exactly the way the Observatory cards do.
  const currentTempReading = convertTemp(current.temp, system);
  // tempTrend is a delta in °C. It is deliberately NOT passed through
  // convertTemp — that applies the absolute conversion (x9/5 + 32), which
  // would turn a 0.5°C change into 32.9. The arrow renders no number, so
  // comparing the raw °C delta against the °C threshold is both correct and
  // unit-independent.

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-text">
              Indoor Climate
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {current.timestamp
                ? `Last update: ${timeAgo(current.timestamp)}`
                : "Waiting for data..."}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
            {(["current", "history"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setParam("view", v === "current" ? null : v)}
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

        {view === "history" && (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-2">
            <HistoryPager
              range={range}
              mode={mode}
              label={periodLabel}
              canGoNext={canGoNext}
              maxDate={todayStr}
              selectedDate={anchor}
              onPrev={() =>
                anchor && setParam("date", prevAnchor(anchor, range))
              }
              onNext={() =>
                anchor && canGoNext && setParam("date", nextAnchor(anchor, range))
              }
              onPickDate={(d: string) => setParam("date", d)}
              onReturnToLive={() => setParam("date", null)}
            />
            <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
              {VALID_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setParam("range", r)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
                    range === r
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {view === "current" ? (
        <div className="card-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          <WeatherCard
            title="Temperature"
            icon={<RiTempColdLine className="h-4 w-4" />}
            info="Indoor temperature from the gateway's built-in sensor. Trend compares against the reading from 15 minutes ago."
          >
            <ReadingBody
              value={currentTempReading.value}
              unit={currentTempReading.unit}
              decimals={1}
              trend={toTrendDirection(current.tempTrend, TEMP_TREND_THRESHOLD_C)}
              sparkline={current.tempSparkline}
              sparklineColor="var(--color-danger)"
              sparklineLabel="Indoor temperature over the last 24 hours"
            />
          </WeatherCard>

          <WeatherCard
            title="Humidity"
            icon={<RiDropLine className="h-4 w-4" />}
            info="Indoor relative humidity. 30–60% is generally comfortable indoors."
          >
            <ReadingBody
              value={current.humidity}
              unit="%"
              decimals={0}
              trend={toTrendDirection(
                current.humidityTrend,
                HUMIDITY_TREND_THRESHOLD_PCT,
              )}
              sparkline={current.humiditySparkline}
              sparklineColor="var(--color-success)"
              sparklineLabel="Indoor humidity over the last 24 hours"
            />
          </WeatherCard>
        </div>
      ) : isLoading ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          Loading...
        </div>
      ) : isError ? (
        <div className="flex h-96 flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="font-display text-xl font-semibold text-text">
            Couldn&apos;t load indoor history
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
      ) : converted.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          No data for {periodLabel}
        </div>
      ) : (
        <div className="card-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartPanel
            title={`Temperature (${tempUnit})`}
            legend={
              <ChartLegend
                series={isRaw ? [tempMeta[1]!] : tempMeta}
                visibility={
                  isRaw
                    ? [tempLegend.visibility[1] ?? true]
                    : tempLegend.visibility
                }
                onToggle={isRaw ? undefined : tempLegend.toggle}
              />
            }
          >
            <UPlotChart
              options={tempOpts}
              data={columnar.temp}
              syncKey="indoor"
              seriesVisibility={tempLegend.visibility}
            />
          </ChartPanel>

          <ChartPanel
            title="Humidity (%)"
            legend={
              <ChartLegend series={humMeta} visibility={humLegend.visibility} />
            }
          >
            <UPlotChart
              options={humOpts}
              data={columnar.humidity}
              syncKey="indoor"
              seriesVisibility={humLegend.visibility}
            />
          </ChartPanel>
        </div>
      )}
    </div>
  );
}

export default function IndoorPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <IndoorPageInner />
    </Suspense>
  );
}
