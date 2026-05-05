"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCalendar2Line,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import DatePickerPopover from "./DatePickerPopover";

export interface HistoryPagerProps {
  mode: "live" | "picked";
  label: string;
  canGoNext: boolean;
  maxDate: string;
  selectedDate?: string;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (yyyymmdd: string) => void;
  onReturnToLive: () => void;
}

export default function HistoryPager({
  mode,
  label,
  canGoNext,
  maxDate,
  selectedDate,
  onPrev,
  onNext,
  onPickDate,
  onReturnToLive,
}: HistoryPagerProps) {
  const pagerRootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const restoreFocusTimeoutRef = useRef<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const closePopover = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setPopoverOpen(false);
  }, []);

  useEffect(() => {
    if (popoverOpen || !shouldRestoreFocusRef.current) return;

    const timeoutId = window.setTimeout(() => {
      restoreFocusTimeoutRef.current = null;
      if (!shouldRestoreFocusRef.current) return;

      shouldRestoreFocusRef.current = false;

      const activeElement = document.activeElement;
      const focusStayedInPager =
        activeElement instanceof Node &&
        pagerRootRef.current?.contains(activeElement);

      if (activeElement === document.body || focusStayedInPager) {
        triggerRef.current?.focus();
      }
    }, 0);

    restoreFocusTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      if (restoreFocusTimeoutRef.current === timeoutId) {
        restoreFocusTimeoutRef.current = null;
      }
    };
  }, [mode, popoverOpen]);

  const togglePopover = () => {
    if (popoverOpen) {
      closePopover();
      return;
    }

    setPopoverOpen(true);
  };

  const closeOpenPopover = useCallback(() => {
    if (popoverOpen) {
      closePopover();
    }
  }, [closePopover, popoverOpen]);

  const handlePrev = () => {
    closeOpenPopover();
    onPrev();
  };

  const handleNext = () => {
    if (!canGoNext) return;

    closeOpenPopover();
    onNext();
  };

  const handleReturnToLive = () => {
    closeOpenPopover();
    onReturnToLive();
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      data-testid="history-pager-trigger"
      aria-haspopup="dialog"
      aria-expanded={popoverOpen}
      onClick={togglePopover}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text",
        mode === "picked" && "min-w-36",
      )}
    >
      <RiCalendar2Line className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  const triggerWithPopover = (
    <div className="relative inline-flex">
      {trigger}

      {popoverOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2">
          <DatePickerPopover
            selectedDate={selectedDate}
            maxDate={maxDate}
            onSelect={onPickDate}
            onClose={closePopover}
            triggerRef={triggerRef}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={pagerRootRef} className="inline-flex items-center gap-2">
      {mode === "picked" ? (
        <>
          <button
            type="button"
            data-testid="history-pager-prev"
            aria-label="Previous period"
            onClick={handlePrev}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <RiArrowLeftSLine className="h-4 w-4" aria-hidden="true" />
          </button>

          {triggerWithPopover}

          <button
            type="button"
            data-testid="history-pager-next"
            aria-label="Next period"
            onClick={handleNext}
            disabled={!canGoNext}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40"
          >
            <RiArrowRightSLine className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            data-testid="history-pager-live"
            onClick={handleReturnToLive}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            Live
          </button>
        </>
      ) : (
        triggerWithPopover
      )}
    </div>
  );
}
