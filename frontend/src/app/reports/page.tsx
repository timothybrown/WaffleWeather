"use client";

import { useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiDownloadLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/fetcher";
import { convertAltitude } from "@/lib/units";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";
import { useGetMonthlyReport, useGetYearlyReport } from "@/generated/reports/reports";
import ReportTable from "@/components/reports/ReportTable";
import ReportSummary from "@/components/reports/ReportSummary";

type Mode = "monthly" | "yearly";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState<Mode>("monthly");
  const { system } = useUnits();

  // Fetch data based on mode. Reports are historical and don't change after the
  // period ends, so no polling — rely on manual navigation + mode changes.
  const monthlyQuery = useGetMonthlyReport(
    { year, month },
    { query: { enabled: mode === "monthly", refetchInterval: CADENCES.none } },
  );
  const yearlyQuery = useGetYearlyReport(
    { year },
    { query: { enabled: mode === "yearly", refetchInterval: CADENCES.none } },
  );

  const activeQuery = mode === "monthly" ? monthlyQuery : yearlyQuery;
  const report = activeQuery.data?.status === 200 ? activeQuery.data.data : null;
  const isLoading = activeQuery.isLoading;
  // After T18, fetcher.ts throws ApiError on non-2xx, so `data.status === 404`
  // is dead code -- `data` is undefined when the query errors. Inspect the
  // typed error instead so we can differentiate a legitimate "no report for
  // this period" (404) from a server/network failure (5xx / network).
  const error = activeQuery.error as unknown;
  const isNotFound = error instanceof ApiError && error.status === 404;
  const isServerError = error instanceof ApiError && error.status >= 500;
  const isNetworkError = !!error && !(error instanceof ApiError);
  const isErrored = isServerError || isNetworkError;

  // Navigation
  const goNext = () => {
    if (mode === "yearly") {
      setYear((y) => y + 1);
    } else {
      if (month === 12) {
        setMonth(1);
        setYear((y) => y + 1);
      } else {
        setMonth((m) => m + 1);
      }
    }
  };

  const goPrev = () => {
    if (mode === "yearly") {
      setYear((y) => y - 1);
    } else {
      if (month === 1) {
        setMonth(12);
        setYear((y) => y - 1);
      } else {
        setMonth((m) => m - 1);
      }
    }
  };

  const periodLabel = mode === "monthly"
    ? `${MONTH_NAMES[month - 1]} ${year}`
    : `${year}`;

  // Download TXT
  const handleDownload = async () => {
    const params = new URLSearchParams({ year: String(year), units: system });
    if (mode === "monthly") params.set("month", String(month));
    const url = `${BASE_URL}/api/v1/reports/${mode}/txt?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = mode === "monthly"
        ? `report_${year}_${String(month).padStart(2, "0")}.txt`
        : `report_${year}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // silently fail
    }
  };

  // Station header
  const station = report?.station;
  const altConverted = station?.altitude != null ? convertAltitude(station.altitude, system) : null;

  return (
    <div className="p-4 sm:p-6">
      {/* Controls row */}
      <div className="page-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl font-semibold text-text">Climate Reports</h1>
          <div className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1">
            {(["monthly", "yearly"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-all",
                  mode === v
                    ? "bg-primary/15 text-primary"
                    : "text-text-faint hover:text-text-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Prev / Next navigation */}
          <button
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-alt text-text-muted transition-colors hover:text-text"
            aria-label="Previous"
          >
            <RiArrowLeftSLine className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center font-mono text-sm font-medium text-text">
            {periodLabel}
          </span>
          <button
            onClick={goNext}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-alt text-text-muted transition-colors hover:text-text"
            aria-label="Next"
          >
            <RiArrowRightSLine className="h-4 w-4" />
          </button>

          {/* Download TXT */}
          <button
            onClick={handleDownload}
            disabled={!report}
            className="ml-2 flex items-center gap-1.5 rounded-md border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text disabled:opacity-40 disabled:pointer-events-none"
          >
            <RiDownloadLine className="h-3.5 w-3.5" />
            Download TXT
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          Loading...
        </div>
      ) : isErrored ? (
        <div className="flex h-96 flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="font-display text-xl font-semibold text-text">
            Couldn&apos;t load report
          </h2>
          <p className="max-w-sm text-sm text-text-muted">
            {error instanceof Error
              ? error.message
              : "The server returned an error."}
          </p>
          <button
            onClick={() => activeQuery.refetch()}
            className="mt-1 rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
          >
            Try again
          </button>
        </div>
      ) : isNotFound || !report ? (
        <div className="flex h-96 items-center justify-center text-text-muted">
          No data available for {periodLabel}
        </div>
      ) : (
        <div className="card-stagger space-y-4">
          {/* Station header card */}
          {station && (
            <div className="weather-card rounded-xl px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <h2 className="font-display text-base font-semibold text-text">
                  {station.name ?? "Weather Station"}
                </h2>
                {station.latitude != null && station.longitude != null && (
                  <span className="font-mono text-xs text-text-faint">
                    {station.latitude.toFixed(4)}&deg;N, {station.longitude.toFixed(4)}&deg;W
                  </span>
                )}
                {altConverted && altConverted.value != null && (
                  <span className="font-mono text-xs text-text-faint">
                    Elev {altConverted.value.toFixed(0)} {altConverted.unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Report table */}
          <ReportTable report={report} system={system} />

          {/* Summary */}
          <ReportSummary report={report} system={system} />
        </div>
      )}
    </div>
  );
}
