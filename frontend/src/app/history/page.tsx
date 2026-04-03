"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { convertTemp, convertSpeed, convertPressure, convertRain } from "@/lib/units";
import { useUnits } from "@/providers/UnitsProvider";
import { useHistoryData, type TimeRange } from "@/hooks/useHistoryData";

const tooltipFormatter = (
  value: string | number | readonly (string | number)[] | undefined,
) => (typeof value === "number" ? Math.round(value * 10) / 10 : (value ?? ""));

const pressureFormatter = (
  value: string | number | readonly (string | number)[] | undefined,
) => (typeof value === "number" ? Math.round(value * 100) / 100 : (value ?? ""));

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
];

function formatTime(value: string, resolution: string) {
  const d = new Date(value);
  if (resolution === "raw" || resolution === "hourly") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (resolution === "daily") {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

const tooltipStyle = {
  background: "var(--color-surface-alt)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
};

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
  const [range, setRange] = useState<TimeRange>("24h");
  const { data: rawData, isLoading, resolution } = useHistoryData(range);
  const { system } = useUnits();

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

  const tempUnit = system === "metric" ? "°C" : "°F";
  const pressureUnit = system === "metric" ? "hPa" : "inHg";
  const windUnit = system === "metric" ? "km/h" : "mph";
  const rainUnit = system === "metric" ? "mm" : "in";

  const tickFormatter = (v: string) => formatTime(v, resolution);

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">History</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
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

      {isLoading ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          No data for this time range
        </div>
      ) : (
        <div className="card-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Temperature */}
          <ChartPanel title={`Temperature (${tempUnit})`}>
            <ResponsiveContainer>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                />
                {resolution !== "raw" && (
                  <Area type="monotone" dataKey="temp_max" stroke="#d47272" fill="#d47272" fillOpacity={0.15} name="Max" />
                )}
                <Area type="monotone" dataKey="temp_avg" stroke="#d4a574" fill="#d4a574" fillOpacity={0.25} name="Avg" />
                {resolution !== "raw" && (
                  <Area type="monotone" dataKey="temp_min" stroke="#7aaccc" fill="#7aaccc" fillOpacity={0.15} name="Min" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Humidity */}
          <ChartPanel title="Humidity (%)">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                />
                <Line type="monotone" dataKey="humidity_avg" stroke="#5eada5" dot={false} strokeWidth={2} name="Humidity" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Pressure */}
          <ChartPanel title={`Pressure (${pressureUnit})`}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={pressureFormatter}
                />
                <Line type="monotone" dataKey="pressure_avg" stroke="#a07cc0" dot={false} strokeWidth={2} name="Pressure" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Wind */}
          <ChartPanel title={`Wind (${windUnit})`}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                />
                <Line type="monotone" dataKey="wind_avg" stroke="#6aae7a" dot={false} strokeWidth={2} name="Speed" />
                <Line type="monotone" dataKey="wind_gust_max" stroke="#dba060" dot={false} strokeDasharray="4 2" name="Gust" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Rain */}
          <ChartPanel title={`Rain (${rainUnit})`}>
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                />
                <Bar dataKey="rain_max" fill="#6a9ac4" radius={[3, 3, 0, 0]} name="Rain" />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Solar & UV */}
          <ChartPanel title="Solar (W/m&sup2;) & UV Index">
            <ResponsiveContainer>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="solar" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="uv" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                />
                <Area yAxisId="solar" type="monotone" dataKey="solar_avg" stroke="#d4a574" fill="#d4a574" fillOpacity={0.25} name="Solar" />
                <Area yAxisId="uv" type="monotone" dataKey="uv_max" stroke="#d47272" fill="#d47272" fillOpacity={0.15} name="UV" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}
    </div>
  );
}
