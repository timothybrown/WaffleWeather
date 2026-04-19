"use client";

import type { ReactNode } from "react";
import {
  RiTempColdLine,
  RiWindyLine,
  RiDrizzleLine,
  RiDropLine,
  RiDashboard3Line,
  RiSunLine,
} from "@remixicon/react";
import { useGetRecords } from "@/generated/records/records";
import { CADENCES } from "@/lib/queryCadences";
import { convertTemp, convertSpeed, convertRain, convertRainRate, convertPressure } from "@/lib/units";
import { fmt } from "@/lib/utils";
import RecordCard from "@/components/records/RecordCard";

const CATEGORY_ICONS: Record<string, ReactNode> = {
  temperature: <RiTempColdLine className="h-4 w-4" />,
  wind: <RiWindyLine className="h-4 w-4" />,
  rain: <RiDrizzleLine className="h-4 w-4" />,
  humidity: <RiDropLine className="h-4 w-4" />,
  pressure: <RiDashboard3Line className="h-4 w-4" />,
  solar: <RiSunLine className="h-4 w-4" />,
};

function formatRecordValue(metric: string, value: number, system: "metric" | "imperial"): string {
  if (metric.includes("temp") || metric.includes("dewpoint")) {
    const c = convertTemp(value, system);
    return `${fmt(c.value, 1)} ${c.unit}`;
  }
  if (metric.includes("wind") || metric.includes("gust")) {
    const w = convertSpeed(value, system);
    return `${fmt(w.value, 1)} ${w.unit}`;
  }
  if (metric.includes("rain_daily")) {
    const r = convertRain(value, system);
    return `${fmt(r.value, system === "imperial" ? 3 : 1)} ${r.unit}`;
  }
  if (metric.includes("rain_rate")) {
    const r = convertRainRate(value, system);
    return `${fmt(r.value, system === "imperial" ? 3 : 1)} ${r.unit}`;
  }
  if (metric.includes("pressure")) {
    const p = convertPressure(value, system);
    return `${fmt(p.value, 2)} ${p.unit}`;
  }
  if (metric.includes("humidity")) {
    return `${Math.round(value)}%`;
  }
  if (metric.includes("solar")) {
    return `${Math.round(value)} W/m\u00B2`;
  }
  if (metric.includes("uv")) {
    return fmt(value, 1);
  }
  return fmt(value, 1);
}

export default function RecordsPage() {
  const { data, isLoading, error } = useGetRecords(
    {},
    { query: { refetchInterval: CADENCES.none } },
  );

  const response = data?.data;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="loading-spinner h-6 w-6" />
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="flex h-96 items-center justify-center text-text-muted">
        Failed to load records.
      </div>
    );
  }

  const { categories, records_since, days_of_data } = response;

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Station Records</h1>
        {records_since && (
          <p className="mt-1 text-xs text-text-faint">
            {days_of_data} day{days_of_data !== 1 ? "s" : ""} of data since {records_since}
          </p>
        )}
      </div>

      <div className="card-stagger space-y-4">
        {Object.entries(categories).map(([key, category]) => (
          <RecordCard
            key={key}
            title={category.label}
            icon={CATEGORY_ICONS[key] ?? <RiTempColdLine className="h-4 w-4" />}
            records={category.records}
            formatValue={formatRecordValue}
          />
        ))}
      </div>
    </div>
  );
}
