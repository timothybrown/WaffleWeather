"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Range } from "@/lib/historyPeriod";
import DayView from "./datepicker/DayView";
import MonthView from "./datepicker/MonthView";
import PopoverHeader, { type ViewLevel } from "./datepicker/PopoverHeader";
import YearView from "./datepicker/YearView";

interface DateParts {
  year: number;
  monthIndex: number;
  day: number;
}

export interface DatePickerPopoverProps {
  range: Range;
  selectedDate?: string;
  maxDate: string;
  onSelect: (yyyymmdd: string) => void;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

const PAGE_ANCHOR_YEAR = 2020;

type PendingFocusKind = "drill-up" | "first-tile";
type PendingFocus = { kind: PendingFocusKind; requestId: number } | null;

function parseYmd(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return {
    year,
    monthIndex: month - 1,
    day,
  };
}

function formatYmd(year: number, monthIndex: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(monthIndex + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function addMonths(year: number, monthIndex: number, offset: number) {
  const absoluteMonth = year * 12 + monthIndex + offset;
  const nextYear = Math.floor(absoluteMonth / 12);
  return {
    year: nextYear,
    monthIndex: absoluteMonth - nextYear * 12,
  };
}

function entryViewFor(range: Range): ViewLevel {
  if (range === "month") return "month";
  if (range === "year") return "year";
  return "day";
}

function pageStartYearForYear(year: number): number {
  return (
    PAGE_ANCHOR_YEAR +
    Math.floor((year - PAGE_ANCHOR_YEAR) / 12) * 12
  );
}

export default function DatePickerPopover({
  range = "day",
  selectedDate,
  maxDate,
  onSelect,
  onClose,
  triggerRef,
}: DatePickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const nextFocusRequestIdRef = useRef(0);
  const handledFocusRequestIdRef = useRef(0);
  const initialParts = parseYmd(selectedDate ?? maxDate);
  const selectedAnchor = selectedDate ?? null;

  const [viewLevel, setViewLevel] = useState<ViewLevel>(() =>
    entryViewFor(range),
  );
  const [visibleYear, setVisibleYear] = useState(() => initialParts.year);
  const [visibleMonth, setVisibleMonth] = useState(
    () => initialParts.monthIndex,
  );
  const [pageStartYear, setPageStartYear] = useState(() =>
    pageStartYearForYear(initialParts.year),
  );
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);

  const requestFocus = (kind: PendingFocusKind) => {
    nextFocusRequestIdRef.current += 1;
    setPendingFocus({
      kind,
      requestId: nextFocusRequestIdRef.current,
    });
  };

  useLayoutEffect(() => {
    if (!pendingFocus) return;
    if (handledFocusRequestIdRef.current === pendingFocus.requestId) return;

    const root = popoverRef.current;
    if (!root) return;

    const target =
      pendingFocus.kind === "drill-up"
        ? root.querySelector<HTMLButtonElement>(
            'button[aria-label^="Choose "]',
          )
        : root
            .querySelector<HTMLElement>(
              `[data-testid="datepicker-${viewLevel}-view"]`,
            )
            ?.querySelector<HTMLButtonElement>("button:not([disabled])");

    target?.focus();
    handledFocusRequestIdRef.current = pendingFocus.requestId;
  }, [pendingFocus, viewLevel]);

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

  const commit = (anchor: string) => {
    onSelect(anchor);
    onClose();
  };

  const handlePrev = () => {
    if (viewLevel === "day") {
      const previous = addMonths(visibleYear, visibleMonth, -1);
      setVisibleYear(previous.year);
      setVisibleMonth(previous.monthIndex);
      return;
    }

    if (viewLevel === "month") {
      setVisibleYear((year) => year - 1);
      return;
    }

    setPageStartYear((year) => year - 12);
  };

  const handleNext = () => {
    if (viewLevel === "day") {
      const next = addMonths(visibleYear, visibleMonth, 1);
      setVisibleYear(next.year);
      setVisibleMonth(next.monthIndex);
      return;
    }

    if (viewLevel === "month") {
      setVisibleYear((year) => year + 1);
      return;
    }

    setPageStartYear((year) => year + 12);
  };

  const handleDrillUp = () => {
    if (viewLevel === "day") {
      setViewLevel("month");
      requestFocus("drill-up");
      return;
    }

    if (viewLevel === "month") {
      setPageStartYear(pageStartYearForYear(visibleYear));
      setViewLevel("year");
      requestFocus("first-tile");
    }
  };

  const handleDayTileClick = (
    event:
      | { kind: "day"; date: string }
      | { kind: "week"; weekStart: string },
  ) => {
    commit(event.kind === "day" ? event.date : event.weekStart);
  };

  const handleMonthTileClick = (event: {
    year: number;
    monthIndex: number;
  }) => {
    if (range === "month") {
      commit(formatYmd(event.year, event.monthIndex, 1));
      return;
    }

    setVisibleYear(event.year);
    setVisibleMonth(event.monthIndex);
    setViewLevel("day");
    requestFocus("first-tile");
  };

  const handleYearTileClick = (event: { year: number }) => {
    if (range === "year") {
      commit(formatYmd(event.year, 0, 1));
      return;
    }

    setVisibleYear(event.year);
    setPageStartYear(pageStartYearForYear(event.year));
    setViewLevel("month");
    requestFocus("first-tile");
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Pick a date"
      data-testid="history-popover"
      className="w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-surface-alt p-3 text-sm shadow-lg"
    >
      <PopoverHeader
        viewLevel={viewLevel}
        visibleYear={visibleYear}
        visibleMonth={visibleMonth}
        pageStartYear={pageStartYear}
        maxDate={maxDate}
        onPrev={handlePrev}
        onNext={handleNext}
        onDrillUp={handleDrillUp}
      />

      {viewLevel === "day" && (range === "day" || range === "week") ? (
        <DayView
          visibleYear={visibleYear}
          visibleMonth={visibleMonth}
          range={range}
          selectedAnchor={selectedAnchor}
          maxDate={maxDate}
          onTileClick={handleDayTileClick}
        />
      ) : null}

      {viewLevel === "month" ? (
        <MonthView
          visibleYear={visibleYear}
          selectedAnchor={selectedAnchor}
          maxDate={maxDate}
          onTileClick={handleMonthTileClick}
        />
      ) : null}

      {viewLevel === "year" ? (
        <YearView
          pageStartYear={pageStartYear}
          selectedAnchor={selectedAnchor}
          maxDate={maxDate}
          onTileClick={handleYearTileClick}
        />
      ) : null}
    </div>
  );
}
