"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/historyPeriod";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTH_LABELS_LONG = [
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

interface DayCell {
  day: number;
  dateStr: string;
  weekStart: string;
}

interface WeekRow {
  weekStart: string;
  weekLabel: string;
  cells: Array<DayCell | null>;
}

type DayViewRange = Extract<Range, "day" | "week">;

export interface DayViewProps {
  visibleYear: number;
  visibleMonth: number;
  range: DayViewRange;
  selectedAnchor: string | null;
  maxDate: string;
  onTileClick: (
    event: { kind: "day"; date: string } | { kind: "week"; weekStart: string },
  ) => void;
}

function formatYyyyMmDd(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dateFromParts(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function dateFromYyyyMmDd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return dateFromParts(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, amount: number): Date {
  return dateFromParts(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount);
}

function startOfWeek(value: string | null): string | null {
  if (!value) return null;
  const date = dateFromYyyyMmDd(value);
  if (!date) return null;

  return formatYyyyMmDd(addDays(date, -date.getUTCDay()));
}

function daysInMonth(year: number, monthIndex: number): number {
  return dateFromParts(year, monthIndex + 1, 0).getUTCDate();
}

function formatWeekLabel(weekStart: string): string {
  const start = dateFromYyyyMmDd(weekStart);
  if (!start) return weekStart;

  const end = addDays(start, 6);
  const startMonth = MONTH_LABELS_LONG[start.getUTCMonth()];
  const endMonth = MONTH_LABELS_LONG[end.getUTCMonth()];

  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return `${startMonth} ${start.getUTCDate()}-${end.getUTCDate()}, ${start.getUTCFullYear()}`;
  }

  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${startMonth} ${start.getUTCDate()} - ${endMonth} ${end.getUTCDate()}, ${start.getUTCFullYear()}`;
  }

  return `${startMonth} ${start.getUTCDate()}, ${start.getUTCFullYear()} - ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

function buildRows(visibleYear: number, visibleMonth: number): WeekRow[] {
  const firstDay = dateFromParts(visibleYear, visibleMonth, 1);
  const leadingBlanks = firstDay.getUTCDay();
  const visibleDays = daysInMonth(visibleYear, visibleMonth);
  const slotCount = Math.ceil((leadingBlanks + visibleDays) / 7) * 7;
  const firstWeekStart = addDays(firstDay, -leadingBlanks);
  const rows: WeekRow[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 7) {
    const weekStartDate = addDays(firstWeekStart, slotIndex);
    const weekStart = formatYyyyMmDd(weekStartDate);
    const cells: Array<DayCell | null> = [];

    for (let weekDay = 0; weekDay < 7; weekDay += 1) {
      const day = slotIndex + weekDay - leadingBlanks + 1;

      if (day < 1 || day > visibleDays) {
        cells.push(null);
      } else {
        cells.push({
          day,
          dateStr: formatYyyyMmDd(dateFromParts(visibleYear, visibleMonth, day)),
          weekStart,
        });
      }
    }

    rows.push({ weekStart, weekLabel: formatWeekLabel(weekStart), cells });
  }

  return rows;
}

export default function DayView({
  visibleYear,
  visibleMonth,
  range,
  selectedAnchor,
  maxDate,
  onTileClick,
}: DayViewProps) {
  const [previewWeekStart, setPreviewWeekStart] = useState<string | null>(null);
  const rows = buildRows(visibleYear, visibleMonth);
  const selectedWeekStart = range === "week" ? startOfWeek(selectedAnchor) : null;

  return (
    <div data-testid="datepicker-day-view" className="space-y-1">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-6 items-center justify-center text-[11px] font-medium text-text-faint"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {rows.map((row) => {
          const isWeekMode = range === "week";
          const isSelectedWeek = isWeekMode && row.weekStart === selectedWeekStart;
          const isDisabledWeek = isWeekMode && row.weekStart > maxDate;
          const isPreviewWeek =
            isWeekMode && !isDisabledWeek && row.weekStart === previewWeekStart;

          return (
            <div
              key={row.weekStart}
              data-testid={isWeekMode ? "datepicker-week-row" : undefined}
              data-selected={isSelectedWeek ? "true" : undefined}
              role={isSelectedWeek ? "group" : undefined}
              aria-label={isSelectedWeek ? `Selected week, ${row.weekLabel}` : undefined}
              onMouseLeave={() => {
                if (isWeekMode && previewWeekStart === row.weekStart) {
                  setPreviewWeekStart(null);
                }
              }}
              className={cn(
                "grid grid-cols-7 gap-1 rounded-md transition-colors",
                isSelectedWeek && "bg-primary/10 ring-1 ring-primary/30",
                isPreviewWeek && "week-row-preview bg-surface-hover",
              )}
            >
              {row.cells.map((cell, cellIndex) => {
                if (!cell) {
                  return <div key={`blank-${cellIndex}`} aria-hidden="true" className="h-8 w-8" />;
                }

                const isDayMode = range !== "week";
                const isSelectedDay = isDayMode && selectedAnchor === cell.dateStr;
                const isDisabled = isWeekMode ? isDisabledWeek : cell.dateStr > maxDate;
                const isCurrent = cell.dateStr === maxDate;

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    disabled={isDisabled}
                    aria-disabled={isDisabled ? "true" : "false"}
                    aria-current={isCurrent ? "date" : undefined}
                    aria-label={
                      isSelectedDay
                        ? `Selected, ${MONTH_LABELS_LONG[visibleMonth]} ${cell.day}, ${visibleYear}`
                        : undefined
                    }
                    data-selected={isSelectedDay ? "true" : undefined}
                    onMouseEnter={() => {
                      if (isWeekMode && !isDisabled) {
                        setPreviewWeekStart(cell.weekStart);
                      }
                    }}
                    onFocus={() => {
                      if (isWeekMode && !isDisabled) {
                        setPreviewWeekStart(cell.weekStart);
                      }
                    }}
                    onBlur={() => {
                      if (isWeekMode && previewWeekStart === cell.weekStart) {
                        setPreviewWeekStart(null);
                      }
                    }}
                    onClick={() => {
                      if (isDisabled) return;

                      if (isWeekMode) {
                        onTileClick({ kind: "week", weekStart: cell.weekStart });
                      } else {
                        onTileClick({ kind: "day", date: cell.dateStr });
                      }
                    }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors",
                      isSelectedDay
                        ? "bg-primary text-white shadow-sm"
                        : "text-text-muted hover:bg-surface-hover hover:text-text",
                      isCurrent && !isSelectedDay && "ring-1 ring-primary/30",
                      isDisabled &&
                        "cursor-not-allowed text-text-faint opacity-40 hover:bg-transparent hover:text-text-faint",
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
