"use client";

import { useMemo } from "react";
import type { ClimateReport } from "@/generated/models";
import type { UnitSystem } from "@/lib/units";
import { convertTemp, convertSpeed, convertPressure, convertRain } from "@/lib/units";
import { fmt } from "@/lib/utils";

interface ReportTableProps {
  report: ClimateReport;
  system: UnitSystem;
}

/** Column group definition for the two-tier header. */
interface ColGroup {
  label: string;
  cols: { key: string; sub: string }[];
}

function buildGroups(system: UnitSystem): ColGroup[] {
  const tempUnit = system === "metric" ? "\u00b0C" : "\u00b0F";
  const windUnit = system === "metric" ? "km/h" : "mph";
  const pressUnit = system === "metric" ? "hPa" : "inHg";
  const rainUnit = system === "metric" ? "mm" : "in";

  return [
    {
      label: `Temperature (${tempUnit})`,
      cols: [
        { key: "temp_avg", sub: "avg" },
        { key: "temp_max", sub: "hi" },
        { key: "temp_min", sub: "lo" },
      ],
    },
    {
      label: `Dewpoint (${tempUnit})`,
      cols: [
        { key: "dewpoint_avg", sub: "avg" },
        { key: "dewpoint_max", sub: "hi" },
        { key: "dewpoint_min", sub: "lo" },
      ],
    },
    {
      label: "Humidity (%)",
      cols: [{ key: "humidity_avg", sub: "avg" }],
    },
    {
      label: `Pressure (${pressUnit})`,
      cols: [{ key: "pressure_avg", sub: "avg" }],
    },
    {
      label: `Wind (${windUnit})`,
      cols: [
        { key: "wind_speed_avg", sub: "avg" },
        { key: "wind_gust_max", sub: "gust" },
        { key: "wind_dir_prevailing", sub: "dir" },
      ],
    },
    {
      label: `Rain (${rainUnit})`,
      cols: [{ key: "rain_total", sub: "total" }],
    },
    {
      label: "Degree Days",
      cols: [
        { key: "hdd", sub: "HDD" },
        { key: "cdd", sub: "CDD" },
      ],
    },
  ];
}

/** Return decimal places for a given column key. */
function decimalsFor(key: string, system: UnitSystem): number {
  if (key.startsWith("temp_") || key.startsWith("dewpoint_")) return 1;
  if (key === "humidity_avg") return 0;
  if (key === "pressure_avg") return system === "metric" ? 1 : 2;
  if (key === "wind_speed_avg" || key === "wind_gust_max") return 1;
  if (key === "rain_total") return system === "metric" ? 1 : 3;
  if (key === "hdd" || key === "cdd") return 1;
  return 1;
}

/** Convert a raw metric value based on column key. */
function convertValue(
  key: string,
  raw: number | string | null | undefined,
  system: UnitSystem,
): number | string | null {
  if (raw == null) return null;
  if (key === "wind_dir_prevailing") return raw as string;
  const num = raw as number;
  if (key.startsWith("temp_") || key.startsWith("dewpoint_")) return convertTemp(num, system).value;
  if (key === "wind_speed_avg" || key === "wind_gust_max") return convertSpeed(num, system).value;
  if (key === "pressure_avg") return convertPressure(num, system).value;
  if (key === "rain_total") return convertRain(num, system).value;
  return num; // hdd, cdd, humidity — no conversion
}

export default function ReportTable({ report, system }: ReportTableProps) {
  const groups = useMemo(() => buildGroups(system), [system]);
  const isMonthly = report.period.type === "monthly";
  const firstColLabel = isMonthly ? "Day" : "Mon";

  // Convert all rows
  const convertedRows = useMemo(() => {
    return report.rows.map((row) => {
      const out: Record<string, number | string | null> = {};
      for (const g of groups) {
        for (const col of g.cols) {
          out[col.key] = convertValue(col.key, (row as Record<string, unknown>)[col.key] as number | string | null | undefined, system);
        }
      }
      out._label = isMonthly ? (row.day ?? null) : (row.month ?? null);
      return out;
    });
  }, [report.rows, groups, system, isMonthly]);

  // Find extreme values for highlighting: max of temp_max, min of temp_min
  const extremes = useMemo(() => {
    let maxTempVal = -Infinity;
    let minTempVal = Infinity;
    const maxRows: Set<number> = new Set();
    const minRows: Set<number> = new Set();

    convertedRows.forEach((row, i) => {
      const hi = row.temp_max;
      const lo = row.temp_min;
      if (typeof hi === "number" && hi > maxTempVal) {
        maxTempVal = hi;
        maxRows.clear();
        maxRows.add(i);
      } else if (typeof hi === "number" && hi === maxTempVal) {
        maxRows.add(i);
      }
      if (typeof lo === "number" && lo < minTempVal) {
        minTempVal = lo;
        minRows.clear();
        minRows.add(i);
      } else if (typeof lo === "number" && lo === minTempVal) {
        minRows.add(i);
      }
    });

    return { maxRows, minRows };
  }, [convertedRows]);

  // Month names for yearly label column
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          {/* Top row: group labels */}
          <tr className="border-b border-border bg-surface-alt">
            <th
              className="sticky left-0 z-10 border-r border-border bg-surface-alt px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-primary"
              rowSpan={2}
            >
              {firstColLabel}
            </th>
            {groups.map((g) => (
              <th
                key={g.label}
                colSpan={g.cols.length}
                className="border-r border-border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-primary last:border-r-0"
              >
                {g.label}
              </th>
            ))}
          </tr>
          {/* Bottom row: sub-headers */}
          <tr className="border-b border-border bg-surface-alt">
            {groups.map((g) =>
              g.cols.map((col, ci) => (
                <th
                  key={col.key}
                  className={`px-3 py-1.5 text-center font-mono text-xs font-normal text-text-faint ${ci === g.cols.length - 1 ? "border-r border-border last:border-r-0" : ""}`}
                >
                  {col.sub}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {convertedRows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-hover ${ri % 2 === 1 ? "bg-surface-alt/50" : ""}`}
            >
              {/* Label column */}
              <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2 font-mono text-xs font-medium text-text-muted">
                {isMonthly
                  ? row._label
                  : typeof row._label === "number"
                    ? monthNames[(row._label as number) - 1] ?? row._label
                    : row._label}
              </td>
              {/* Data columns */}
              {groups.map((g) =>
                g.cols.map((col, ci) => {
                  const val = row[col.key];
                  const isHigh = col.key === "temp_max" && extremes.maxRows.has(ri);
                  const isLow = col.key === "temp_min" && extremes.minRows.has(ri);

                  let displayVal: string;
                  if (val == null) {
                    displayVal = "\u2014";
                  } else if (col.key === "wind_dir_prevailing") {
                    displayVal = val as string;
                  } else {
                    displayVal = fmt(val as number, decimalsFor(col.key, system));
                  }

                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-center font-mono text-xs tabular-nums ${ci === g.cols.length - 1 ? "border-r border-border last:border-r-0" : ""} ${isHigh ? "font-semibold text-danger" : isLow ? "font-semibold text-[color-mix(in_srgb,var(--color-primary)_40%,#4a90d9)]" : "text-text"}`}
                    >
                      {displayVal}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
