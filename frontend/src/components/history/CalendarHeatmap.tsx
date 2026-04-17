"use client";

import { useCallback, useMemo, useState } from "react";
import { useGetCalendarData, useListDailyObservations } from "@/generated/aggregates/aggregates";
import { GetCalendarDataMetric } from "@/generated/models";
import type { AggregatedObservation, CalendarDataPoint } from "@/generated/models";
import { convertTemp, convertSpeed, convertRain } from "@/lib/units";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";
import { fmt } from "@/lib/utils";

const METRICS: { value: GetCalendarDataMetric; label: string; unitFn: string }[] = [
  { value: GetCalendarDataMetric.temp_outdoor_max, label: "Temp", unitFn: "temp" },
  { value: GetCalendarDataMetric.rain_daily_max, label: "Rainfall", unitFn: "rain" },
  { value: GetCalendarDataMetric.solar_radiation_avg, label: "Solar Radiation", unitFn: "none" },
  { value: GetCalendarDataMetric.wind_gust_max, label: "Wind Gust", unitFn: "speed" },
  { value: GetCalendarDataMetric.humidity_outdoor_avg, label: "Humidity", unitFn: "none" },
  { value: GetCalendarDataMetric.lightning_strikes, label: "Lightning", unitFn: "none" },
];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL_SIZE = 13;
const CELL_GAP = 2;
const LABEL_WIDTH = 28;
const HEADER_HEIGHT = 16;

function interpolateColor(t: number): string {
  const r = Math.round(42 + t * (212 - 42));
  const g = Math.round(35 + t * (165 - 35));
  const b = Math.round(28 + t * (116 - 28));
  return `rgb(${r},${g},${b})`;
}

interface TooltipState {
  date: string;
  mouseX: number;
  mouseY: number;
  day: AggregatedObservation | null;
  metricValue: number | null;
}

function DayTooltip({
  tip,
  metric,
  system,
}: {
  tip: TooltipState;
  metric: GetCalendarDataMetric;
  system: "metric" | "imperial";
}) {
  const d = tip.day;
  const dateLabel = new Date(tip.date + "T12:00:00").toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const tempUnit = "°";
  const rainUnit = system === "metric" ? "mm" : "in";
  const windUnit = system === "metric" ? "km/h" : "mph";

  let content: React.ReactNode = null;

  if (metric === GetCalendarDataMetric.temp_outdoor_max && d) {
    content = (
      <table className="border-separate border-spacing-x-2 border-spacing-y-0 text-text-muted">
        <thead>
          <tr className="text-text-faint">
            <td className="text-[#7aaccc]">Lo</td>
            <td>Avg</td>
            <td className="text-[#d47272]">Hi</td>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          <tr>
            <td className="text-[#7aaccc]">{fmt(d.temp_outdoor_min)}{tempUnit}</td>
            <td>{fmt(d.temp_outdoor_avg)}{tempUnit}</td>
            <td className="text-[#d47272]">{fmt(d.temp_outdoor_max)}{tempUnit}</td>
          </tr>
        </tbody>
      </table>
    );
  } else if (metric === GetCalendarDataMetric.humidity_outdoor_avg && d) {
    content = (
      <table className="border-separate border-spacing-x-2 border-spacing-y-0 text-text-muted">
        <thead>
          <tr className="text-text-faint">
            <td>Lo</td>
            <td>Avg</td>
            <td>Hi</td>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          <tr>
            <td>{fmt(d.humidity_outdoor_min, 0)}%</td>
            <td>{fmt(d.humidity_outdoor_avg, 0)}%</td>
            <td>{fmt(d.humidity_outdoor_max, 0)}%</td>
          </tr>
        </tbody>
      </table>
    );
  } else if (tip.metricValue != null) {
    const metricInfo = METRICS.find((m) => m.value === metric);
    let unit = "";
    if (metric === GetCalendarDataMetric.rain_daily_max) unit = ` ${rainUnit}`;
    else if (metric === GetCalendarDataMetric.wind_gust_max) unit = ` ${windUnit}`;
    else if (metric === GetCalendarDataMetric.solar_radiation_avg) unit = " W/m²";
    else if (metric === GetCalendarDataMetric.lightning_strikes) unit = " strikes";
    let decimals = 1;
    if (metric === GetCalendarDataMetric.lightning_strikes) decimals = 0;
    else if (metric === GetCalendarDataMetric.rain_daily_max) decimals = system === "imperial" ? 3 : 1;
    content = (
      <p className="font-mono tabular-nums text-text-muted">
        {metricInfo?.label}: {fmt(tip.metricValue, decimals)}{unit}
      </p>
    );
  } else {
    content = <p className="text-text-faint">No data</p>;
  }

  return (
    <div
      className="pointer-events-none fixed z-[100] rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.mouseX + 12, top: tip.mouseY - 8 }}
    >
      <p className="mb-1 font-semibold text-text">{dateLabel}</p>
      {content}
    </div>
  );
}

function HeatmapSVG({
  data,
  year,
  onHover,
  onLeave,
}: {
  data: CalendarDataPoint[];
  year: number;
  onHover: (date: string, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const valueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const d of data) {
      map.set(d.date, d.value ?? null);
    }
    return map;
  }, [data]);

  const { cells, monthLabels, numWeeks } = useMemo(() => {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const startDow = startDate.getDay();

    const values = data.filter((d) => d.value != null).map((d) => d.value!);
    const minVal = values.length > 0 ? Math.min(...values) : 0;
    const maxVal = values.length > 0 ? Math.max(...values) : 1;
    const range = maxVal - minVal || 1;

    const cells: { x: number; y: number; date: string; color: string; value: number | null }[] = [];
    const monthStarts: { week: number; label: string }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let lastMonth = -1;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayOfYear = Math.floor((current.getTime() - startDate.getTime()) / 86400000);
      const totalDayIndex = dayOfYear + startDow;
      const week = Math.floor(totalDayIndex / 7);
      const dow = totalDayIndex % 7;

      const dateStr = current.toISOString().slice(0, 10);
      const val = valueMap.get(dateStr) ?? null;
      const t = val != null ? (val - minVal) / range : -1;

      if (current.getMonth() !== lastMonth) {
        lastMonth = current.getMonth();
        monthStarts.push({ week, label: monthNames[lastMonth] });
      }

      cells.push({
        x: LABEL_WIDTH + week * (CELL_SIZE + CELL_GAP),
        y: HEADER_HEIGHT + dow * (CELL_SIZE + CELL_GAP),
        date: dateStr,
        color: t >= 0 ? interpolateColor(t) : "var(--color-surface-hover)",
        value: val,
      });

      current.setDate(current.getDate() + 1);
    }

    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const numWeeks = Math.ceil((totalDays + startDow) / 7);

    return { cells, monthLabels: monthStarts, numWeeks };
  }, [data, year, valueMap]);

  const svgWidth = LABEL_WIDTH + numWeeks * (CELL_SIZE + CELL_GAP);
  const svgHeight = HEADER_HEIGHT + 7 * (CELL_SIZE + CELL_GAP);

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full">
      {monthLabels.map((m, i) => (
        <text
          key={i}
          x={LABEL_WIDTH + m.week * (CELL_SIZE + CELL_GAP)}
          y={10}
          fontSize="8"
          fill="var(--color-text-faint)"
          className="font-mono"
        >
          {m.label}
        </text>
      ))}

      {DAY_LABELS.map((label, i) =>
        label ? (
          <text
            key={i}
            x={LABEL_WIDTH - 4}
            y={HEADER_HEIGHT + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE * 0.75}
            fontSize="7"
            fill="var(--color-text-faint)"
            textAnchor="end"
            className="font-mono"
          >
            {label}
          </text>
        ) : null,
      )}

      {cells.map((c) => (
        <rect
          key={c.date}
          x={c.x}
          y={c.y}
          width={CELL_SIZE}
          height={CELL_SIZE}
          rx={2}
          fill={c.color}
          opacity={c.value != null ? 1 : 0.4}
          onMouseEnter={(e) => onHover(c.date, e)}
          onMouseLeave={onLeave}
          className="cursor-default"
        />
      ))}
    </svg>
  );
}

export default function CalendarHeatmap() {
  const { system } = useUnits();
  const [metric, setMetric] = useState<GetCalendarDataMetric>(GetCalendarDataMetric.temp_outdoor_max);
  const year = new Date().getFullYear();

  // 365-day calendar heatmap + daily aggregates are a static annual view.
  // Re-runs naturally on metric/year/unit changes — no background polling.
  const { data: response, isLoading } = useGetCalendarData(
    { metric, year },
    { query: { refetchInterval: CADENCES.none } },
  );
  const rawData = (response?.data as CalendarDataPoint[] | undefined) ?? [];

  // Fetch daily aggregates for tooltip detail (temp & humidity min/avg/max)
  const dailyParams = useMemo(() => ({
    start: `${year}-01-01T00:00:00Z`,
    end: `${year}-12-31T23:59:59Z`,
  }), [year]);
  const { data: dailyResponse } = useListDailyObservations(dailyParams, {
    query: { refetchInterval: CADENCES.none },
  });
  const dailyRows = (dailyResponse?.data ?? []) as AggregatedObservation[];

  // Convert daily aggregates to correct unit system and index by date
  const dailyMap = useMemo(() => {
    const map = new Map<string, AggregatedObservation>();
    for (const row of dailyRows) {
      const dateStr = new Date(row.bucket).toISOString().slice(0, 10);
      map.set(dateStr, {
        ...row,
        temp_outdoor_min: convertTemp(row.temp_outdoor_min, system).value,
        temp_outdoor_avg: convertTemp(row.temp_outdoor_avg, system).value,
        temp_outdoor_max: convertTemp(row.temp_outdoor_max, system).value,
      });
    }
    return map;
  }, [dailyRows, system]);

  // Convert calendar values for heatmap coloring
  const data = useMemo(() => {
    const metricInfo = METRICS.find((m) => m.value === metric);
    if (!metricInfo || metricInfo.unitFn === "none") return rawData;

    return rawData.map((d) => {
      if (d.value == null) return d;
      let converted = d.value;
      switch (metricInfo.unitFn) {
        case "temp":
          converted = convertTemp(d.value, system).value ?? d.value;
          break;
        case "speed":
          converted = convertSpeed(d.value, system).value ?? d.value;
          break;
        case "rain":
          converted = convertRain(d.value, system).value ?? d.value;
          break;
      }
      return { ...d, value: converted };
    });
  }, [rawData, metric, system]);

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleHover = useCallback(
    (date: string, e: React.MouseEvent) => {
      setTooltip({
        date,
        mouseX: e.clientX,
        mouseY: e.clientY,
        day: dailyMap.get(date) ?? null,
        metricValue: data.find((d) => d.date === date)?.value ?? null,
      });
    },
    [dailyMap, data],
  );

  const handleLeave = useCallback(() => setTooltip(null), []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMetric(m.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              metric === m.value
                ? "bg-primary/15 text-primary"
                : "text-text-faint hover:text-text-muted"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-text-muted">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-text-muted">
          No data for {year}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <HeatmapSVG
            data={data}
            year={year}
            onHover={handleHover}
            onLeave={handleLeave}
          />
        </div>
      )}

      {tooltip && (
        <DayTooltip tip={tooltip} metric={metric} system={system} />
      )}
    </div>
  );
}
