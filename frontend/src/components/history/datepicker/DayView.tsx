"use client";

import { useState } from "react";
import {
  addCalendarDays,
  dayLabel,
  dayOfWeek,
  daysInMonth,
  formatYyyyMmDd,
  parseYyyyMmDd,
  startOfContainingWeek,
  weekLabel,
} from "@/lib/calendarDate";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/historyPeriod";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

function startOfWeek(value: string | null): string | null {
  if (!value) return null;
  const date = parseYyyyMmDd(value);
  if (!date) return null;

  return formatYyyyMmDd(startOfContainingWeek(date));
}

function formatWeekLabel(weekStart: string): string {
  const start = parseYyyyMmDd(weekStart);
  if (!start) return weekStart;

  return weekLabel(start, addCalendarDays(start, 6));
}

function buildRows(visibleYear: number, visibleMonth: number): WeekRow[] {
  const month = visibleMonth + 1;
  const firstDay = { year: visibleYear, month, day: 1 };
  const leadingBlanks = dayOfWeek(firstDay);
  const visibleDays = daysInMonth(visibleYear, month);
  const slotCount = Math.ceil((leadingBlanks + visibleDays) / 7) * 7;
  const firstWeekStart = addCalendarDays(firstDay, -leadingBlanks);
  const rows: WeekRow[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 7) {
    const weekStartDate = addCalendarDays(firstWeekStart, slotIndex);
    const weekStart = formatYyyyMmDd(weekStartDate);
    const cells: Array<DayCell | null> = [];

    for (let weekDay = 0; weekDay < 7; weekDay += 1) {
      const day = slotIndex + weekDay - leadingBlanks + 1;

      if (day < 1 || day > visibleDays) {
        cells.push(null);
      } else {
        cells.push({
          day,
          dateStr: formatYyyyMmDd({ year: visibleYear, month, day }),
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
                        ? `Selected, ${dayLabel({
                            year: visibleYear,
                            month: visibleMonth + 1,
                            day: cell.day,
                          })}`
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
