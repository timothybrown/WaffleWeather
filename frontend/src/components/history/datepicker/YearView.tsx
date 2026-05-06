"use client";

import { cn } from "@/lib/utils";

export interface YearViewProps {
  pageStartYear: number;
  selectedAnchor: string | null;
  maxDate: string;
  onTileClick: (event: { year: number }) => void;
}

function yearOfYyyyMmDd(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-/.exec(value);
  return match ? Number(match[1]) : null;
}

function maxDateYear(maxDate: string): number {
  return Number(maxDate.slice(0, 4));
}

export default function YearView({
  pageStartYear,
  selectedAnchor,
  maxDate,
  onTileClick,
}: YearViewProps) {
  const selectedYear = yearOfYyyyMmDd(selectedAnchor);
  const maxYear = maxDateYear(maxDate);
  const years: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    years.push(pageStartYear + i);
  }

  return (
    <div
      data-testid="datepicker-year-view"
      className="grid grid-cols-4 gap-1"
    >
      {years.map((year) => {
        const isDisabled = year > maxYear;
        const isSelected = selectedYear === year;
        const isCurrent = year === maxYear;

        return (
          <button
            key={year}
            type="button"
            disabled={isDisabled}
            aria-disabled={isDisabled ? "true" : "false"}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={isSelected ? `Selected, ${year}` : String(year)}
            data-selected={isSelected ? "true" : undefined}
            onClick={() => {
              if (isDisabled) return;
              onTileClick({ year });
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
            {year}
          </button>
        );
      })}
    </div>
  );
}
