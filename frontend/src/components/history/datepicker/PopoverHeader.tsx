"use client";

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

export type ViewLevel = "day" | "month" | "year";

export interface PopoverHeaderProps {
  viewLevel: ViewLevel;
  visibleYear: number;
  visibleMonth: number;
  pageStartYear: number;
  maxDate: string;
  onPrev: () => void;
  onNext: () => void;
  onDrillUp: () => void;
}

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function maxYear(maxDate: string): number {
  return Number(maxDate.slice(0, 4));
}

function maxMonthIndex(maxDate: string): number {
  return Number(maxDate.slice(5, 7)) - 1;
}

function isNextDisabledForDay(
  visibleYear: number,
  visibleMonth: number,
  maxDate: string,
): boolean {
  const nextYear = visibleMonth === 11 ? visibleYear + 1 : visibleYear;
  const nextMonthIndex = visibleMonth === 11 ? 0 : visibleMonth + 1;
  const my = maxYear(maxDate);
  const mm = maxMonthIndex(maxDate);

  if (nextYear !== my) return nextYear > my;
  return nextMonthIndex > mm;
}

function isNextDisabledForMonth(visibleYear: number, maxDate: string): boolean {
  return visibleYear + 1 > maxYear(maxDate);
}

function isNextDisabledForYear(pageStartYear: number, maxDate: string): boolean {
  return pageStartYear + 12 > maxYear(maxDate);
}

export default function PopoverHeader({
  viewLevel,
  visibleYear,
  visibleMonth,
  pageStartYear,
  maxDate,
  onPrev,
  onNext,
  onDrillUp,
}: PopoverHeaderProps) {
  const label =
    viewLevel === "day"
      ? `${MONTH_NAMES_LONG[visibleMonth]} ${visibleYear}`
      : viewLevel === "month"
        ? String(visibleYear)
        : `${pageStartYear} – ${pageStartYear + 11}`;

  const drillUpAriaLabel =
    viewLevel === "day"
      ? "Choose month"
      : viewLevel === "month"
        ? "Choose year"
        : null;

  const isNextDisabled =
    viewLevel === "day"
      ? isNextDisabledForDay(visibleYear, visibleMonth, maxDate)
      : viewLevel === "month"
        ? isNextDisabledForMonth(visibleYear, maxDate)
        : isNextDisabledForYear(pageStartYear, maxDate);

  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Previous"
        onClick={onPrev}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:text-text"
      >
        <RiArrowLeftSLine className="h-4 w-4" aria-hidden="true" />
      </button>

      {drillUpAriaLabel ? (
        <button
          type="button"
          aria-label={drillUpAriaLabel}
          onClick={onDrillUp}
          className="rounded-md px-2 py-1 font-medium text-text transition-colors hover:bg-surface-hover"
        >
          {label}
        </button>
      ) : (
        <span className="px-2 py-1 font-medium text-text">{label}</span>
      )}

      <button
        type="button"
        aria-label="Next"
        onClick={onNext}
        disabled={isNextDisabled}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:text-text",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <RiArrowRightSLine className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
