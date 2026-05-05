"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

interface DateParts {
  year: number;
  monthIndex: number;
  day: number;
}

export interface DatePickerPopoverProps {
  selectedDate?: string;
  maxDate: string;
  onSelect: (yyyymmdd: string) => void;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

const MONTH_NAMES = [
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
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseYmd(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return {
    year,
    monthIndex: month - 1,
    day,
  };
}

function toDateKey(year: number, monthIndex: number, day: number): number {
  return year * 10000 + (monthIndex + 1) * 100 + day;
}

function formatYmd(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  const dayOfMonth = String(day).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function formatAccessibleDate(year: number, monthIndex: number, day: number): string {
  return `${MONTH_NAMES[monthIndex]} ${day}, ${year}`;
}

function addMonths(year: number, monthIndex: number, offset: number) {
  const date = new Date(year, monthIndex + offset, 1);
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
  };
}

function getInitialMonth(selectedDate: string | undefined, maxDate: string) {
  const parts = parseYmd(selectedDate ?? maxDate);
  return {
    year: parts.year,
    monthIndex: parts.monthIndex,
  };
}

export default function DatePickerPopover({
  selectedDate,
  maxDate,
  onSelect,
  onClose,
  triggerRef,
}: DatePickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getInitialMonth(selectedDate, maxDate),
  );

  const maxParts = useMemo(() => parseYmd(maxDate), [maxDate]);
  const selectedParts = useMemo(
    () => (selectedDate ? parseYmd(selectedDate) : null),
    [selectedDate],
  );
  const maxDateKey = toDateKey(
    maxParts.year,
    maxParts.monthIndex,
    maxParts.day,
  );
  const selectedDateKey = selectedParts
    ? toDateKey(
      selectedParts.year,
      selectedParts.monthIndex,
      selectedParts.day,
    )
    : null;

  const daysInMonth = new Date(
    visibleMonth.year,
    visibleMonth.monthIndex + 1,
    0,
  ).getDate();
  const leadingBlanks = new Date(
    visibleMonth.year,
    visibleMonth.monthIndex,
    1,
  ).getDay();

  const nextMonth = addMonths(
    visibleMonth.year,
    visibleMonth.monthIndex,
    1,
  );
  const isNextDisabled =
    toDateKey(nextMonth.year, nextMonth.monthIndex, 1) > maxDateKey;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleOutsideStart = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (popoverRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;

      onClose();
    };

    document.addEventListener("mousedown", handleOutsideStart);
    document.addEventListener("touchstart", handleOutsideStart);
    return () => {
      document.removeEventListener("mousedown", handleOutsideStart);
      document.removeEventListener("touchstart", handleOutsideStart);
    };
  }, [onClose, triggerRef]);

  const handleSelect = (day: number, disabled: boolean) => {
    if (disabled) return;

    onSelect(formatYmd(visibleMonth.year, visibleMonth.monthIndex, day));
    onClose();
  };

  const handleToday = () => {
    onSelect(maxDate);
    onClose();
  };

  const goToPreviousMonth = () => {
    setVisibleMonth((month) => addMonths(month.year, month.monthIndex, -1));
  };

  const goToNextMonth = () => {
    if (isNextDisabled) return;
    setVisibleMonth(nextMonth);
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Pick a date"
      data-testid="history-popover"
      className="w-72 rounded-xl border border-border bg-surface-alt p-3 text-sm shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={goToPreviousMonth}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:text-text"
        >
          <RiArrowLeftSLine className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="font-medium text-text">
          {MONTH_NAMES[visibleMonth.monthIndex]} {visibleMonth.year}
        </div>

        <button
          type="button"
          aria-label="Next month"
          onClick={goToNextMonth}
          disabled={isNextDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40"
        >
          <RiArrowRightSLine className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-text-faint">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} aria-hidden="true" className="h-8" />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateKey = toDateKey(
            visibleMonth.year,
            visibleMonth.monthIndex,
            day,
          );
          const isDisabled = dateKey > maxDateKey;
          const isSelected = selectedDateKey === dateKey;
          const isMaxDate = dateKey === maxDateKey;

          return (
            <button
              key={day}
              type="button"
              disabled={isDisabled}
              aria-current={isMaxDate ? "date" : undefined}
              aria-label={
                isSelected
                  ? `Selected, ${formatAccessibleDate(
                    visibleMonth.year,
                    visibleMonth.monthIndex,
                    day,
                  )}`
                  : undefined
              }
              aria-disabled={isDisabled ? "true" : "false"}
              data-selected={isSelected ? "true" : undefined}
              onClick={() => handleSelect(day, isDisabled)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors",
                isSelected
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
                isMaxDate && !isSelected && "ring-1 ring-primary/30",
                isDisabled &&
                  "cursor-not-allowed text-text-faint opacity-40 hover:bg-transparent hover:text-text-faint",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <button
          type="button"
          onClick={handleToday}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
        >
          Today
        </button>
      </div>
    </div>
  );
}
