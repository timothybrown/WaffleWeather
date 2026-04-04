"use client";

import { useMemo, useState } from "react";
import { useGetCalendarData } from "@/generated/aggregates/aggregates";
import { GetCalendarDataMetric } from "@/generated/models";
import type { CalendarDataPoint } from "@/generated/models";
import { convertTemp, convertSpeed, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";

const METRICS: { value: GetCalendarDataMetric; label: string; unitFn: string }[] = [
  { value: GetCalendarDataMetric.temp_outdoor_max, label: "Max Temp", unitFn: "temp" },
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
  // Warm amber gradient: dark surface → amber → warm white
  const r = Math.round(42 + t * (212 - 42));
  const g = Math.round(35 + t * (165 - 35));
  const b = Math.round(28 + t * (116 - 28));
  return `rgb(${r},${g},${b})`;
}

function HeatmapSVG({ data, year }: { data: CalendarDataPoint[]; year: number }) {
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
    const startDow = startDate.getDay(); // 0=Sun

    // Collect all values for min/max
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
      {/* Month labels */}
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

      {/* Day-of-week labels */}
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

      {/* Cells */}
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
        >
          <title>{`${c.date}: ${c.value != null ? Math.round(c.value * 10) / 10 : "—"}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default function CalendarHeatmap() {
  const { system } = useUnits();
  const [metric, setMetric] = useState<GetCalendarDataMetric>(GetCalendarDataMetric.temp_outdoor_max);
  const year = new Date().getFullYear();

  const { data: response, isLoading } = useGetCalendarData({ metric, year });
  const rawData = (response?.data as CalendarDataPoint[] | undefined) ?? [];

  // Convert values for display based on metric
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

  return (
    <div>
      {/* Metric selector */}
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
          <HeatmapSVG data={data} year={year} />
        </div>
      )}
    </div>
  );
}
