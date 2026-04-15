"use client";

import type { ClimateReport } from "@/generated/models";
import type { UnitSystem } from "@/lib/units";
import { convertTemp, convertSpeed, convertRain } from "@/lib/units";
import { fmt } from "@/lib/utils";

interface ReportSummaryProps {
  report: ClimateReport;
  system: UnitSystem;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-faint">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums text-text">{value}</span>
      {sub && <span className="text-xs text-text-faint">{sub}</span>}
    </div>
  );
}

export default function ReportSummary({ report, system }: ReportSummaryProps) {
  const { summary, period } = report;
  const isMonthly = period.type === "monthly";
  const tempUnit = system === "metric" ? "\u00b0C" : "\u00b0F";
  const windUnit = system === "metric" ? "km/h" : "mph";
  const rainUnit = system === "metric" ? "mm" : "in";
  const rainDp = system === "metric" ? 1 : 3;

  const title = isMonthly
    ? `${MONTH_NAMES[(period.month ?? 1) - 1]} ${period.year} Summary`
    : `${period.year} Summary`;

  const tempAvg = convertTemp(summary.temp_avg, system).value;
  const tempMax = convertTemp(summary.temp_max, system).value;
  const tempMin = convertTemp(summary.temp_min, system).value;
  const gustMax = convertSpeed(summary.wind_gust_max, system).value;
  const rainTotal = convertRain(summary.rain_total, system).value;

  return (
    <div className="weather-card rounded-xl p-5">
      <h3 className="mb-4 font-display text-lg font-semibold text-text">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        <StatItem
          label="Mean Temperature"
          value={`${fmt(tempAvg, 1)}${tempUnit}`}
        />
        <StatItem
          label="Highest Temperature"
          value={`${fmt(tempMax, 1)}${tempUnit}`}
          sub={formatDate(summary.temp_max_date)}
        />
        <StatItem
          label="Lowest Temperature"
          value={`${fmt(tempMin, 1)}${tempUnit}`}
          sub={formatDate(summary.temp_min_date)}
        />
        <StatItem
          label="Total Rainfall"
          value={`${fmt(rainTotal, rainDp)} ${rainUnit}`}
          sub={summary.rain_days != null ? `${summary.rain_days} rain day${summary.rain_days === 1 ? "" : "s"}` : undefined}
        />
        <StatItem
          label="Max Gust"
          value={`${fmt(gustMax, 1)} ${windUnit}`}
          sub={formatDate(summary.wind_gust_max_date)}
        />
        <StatItem
          label="Prevailing Wind"
          value={summary.wind_dir_prevailing ?? "\u2014"}
        />
        <StatItem
          label="Heating Degree Days"
          value={fmt(summary.hdd_total, 1)}
        />
        <StatItem
          label="Cooling Degree Days"
          value={fmt(summary.cdd_total, 1)}
        />
      </div>
    </div>
  );
}
