"use client";

import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTH_LABELS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export interface MonthViewProps {
  visibleYear: number;
  selectedAnchor: string | null;
  maxDate: string;
  onTileClick: (event: { year: number; monthIndex: number }) => void;
}

function yearMonthOfYyyyMmDd(value: string | null): { year: number; monthIndex: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

function maxDateYearMonth(maxDate: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})-/.exec(maxDate);
  if (!match) {
    throw new Error(`Invalid maxDate: ${maxDate}`);
  }
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

function isAfterMaxDate(
  year: number,
  monthIndex: number,
  max: { year: number; monthIndex: number },
): boolean {
  if (year !== max.year) return year > max.year;
  return monthIndex > max.monthIndex;
}

export default function MonthView({
  visibleYear,
  selectedAnchor,
  maxDate,
  onTileClick,
}: MonthViewProps) {
  const selected = yearMonthOfYyyyMmDd(selectedAnchor);
  const max = maxDateYearMonth(maxDate);

  return (
    <div
      data-testid="datepicker-month-view"
      className="grid grid-cols-4 gap-1"
    >
      {MONTH_LABELS.map((label, monthIndex) => {
        const isDisabled = isAfterMaxDate(visibleYear, monthIndex, max);
        const isSelected =
          selected !== null &&
          selected.year === visibleYear &&
          selected.monthIndex === monthIndex;
        const isCurrent =
          visibleYear === max.year && monthIndex === max.monthIndex;

        return (
          <button
            key={label}
            type="button"
            disabled={isDisabled}
            aria-disabled={isDisabled ? "true" : "false"}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={
              isSelected
                ? `Selected, ${MONTH_LABELS_LONG[monthIndex]} ${visibleYear}`
                : `${MONTH_LABELS_LONG[monthIndex]} ${visibleYear}`
            }
            data-selected={isSelected ? "true" : undefined}
            onClick={() => {
              if (isDisabled) return;
              onTileClick({ year: visibleYear, monthIndex });
            }}
            className={cn(
              "flex h-10 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors",
              isSelected
                ? "bg-primary text-white shadow-sm"
                : "text-text-muted hover:bg-surface-hover hover:text-text",
              isCurrent && !isSelected && "ring-1 ring-primary/30",
              isDisabled &&
                "cursor-not-allowed text-text-faint opacity-40 hover:bg-transparent hover:text-text-faint",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
