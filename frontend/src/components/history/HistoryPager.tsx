"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCalendar2Line,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import DatePickerPopover from "./DatePickerPopover";

const POPOVER_WIDTH_PX = 288;
const POPOVER_VIEWPORT_MARGIN_PX = 12;
const POPOVER_VERTICAL_GAP_PX = 8;

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
  const popoverWrapperRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const restoreFocusTimeoutRef = useRef<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!popoverOpen) return;

    const updatePopoverPosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxPopoverHeight = Math.max(
        0,
        viewportHeight - POPOVER_VIEWPORT_MARGIN_PX * 2,
      );
      const availableWidth = Math.max(
        0,
        viewportWidth - POPOVER_VIEWPORT_MARGIN_PX * 2,
      );
      const popoverWidth = Math.min(POPOVER_WIDTH_PX, availableWidth);
      const maxLeft = Math.max(
        POPOVER_VIEWPORT_MARGIN_PX,
        viewportWidth - popoverWidth - POPOVER_VIEWPORT_MARGIN_PX,
      );
      const left = Math.min(
        Math.max(triggerRect.left, POPOVER_VIEWPORT_MARGIN_PX),
        maxLeft,
      );

      const measuredPopoverHeight =
        popoverWrapperRef.current?.getBoundingClientRect().height ?? 0;
      const popoverHeight = Math.min(measuredPopoverHeight, maxPopoverHeight);
      const belowTop = triggerRect.bottom + POPOVER_VERTICAL_GAP_PX;
      const maxTop = Math.max(
        POPOVER_VIEWPORT_MARGIN_PX,
        viewportHeight - popoverHeight - POPOVER_VIEWPORT_MARGIN_PX,
      );
      const belowFits =
        belowTop + popoverHeight <=
        viewportHeight - POPOVER_VIEWPORT_MARGIN_PX;
      const aboveSpace =
        triggerRect.top -
        POPOVER_VERTICAL_GAP_PX -
        POPOVER_VIEWPORT_MARGIN_PX;
      const belowSpace =
        viewportHeight -
        triggerRect.bottom -
        POPOVER_VERTICAL_GAP_PX -
        POPOVER_VIEWPORT_MARGIN_PX;
      const preferredTop =
        belowFits || belowSpace >= aboveSpace
          ? belowTop
          : triggerRect.top - popoverHeight - POPOVER_VERTICAL_GAP_PX;
      const top = Math.min(
        Math.max(preferredTop, POPOVER_VIEWPORT_MARGIN_PX),
        maxTop,
      );

      setPopoverPosition((currentPosition) => {
        if (
          currentPosition?.left === left &&
          currentPosition.top === top &&
          currentPosition.maxHeight === maxPopoverHeight
        ) {
          return currentPosition;
        }

        return {
          left,
          top,
          maxHeight: maxPopoverHeight,
        };
      });
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePopoverPosition);
    const popoverWrapper = popoverWrapperRef.current;
    if (popoverWrapper && resizeObserver) {
      resizeObserver.observe(popoverWrapper);
      const popover = popoverWrapper.firstElementChild;
      if (popover instanceof HTMLElement) {
        resizeObserver.observe(popover);
      }
    }

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      resizeObserver?.disconnect();
    };
  }, [popoverOpen]);

  const closePopover = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setPopoverPosition(null);
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

  const popoverWrapperStyle: CSSProperties = popoverPosition
    ? {
        left: popoverPosition.left,
        top: popoverPosition.top,
        maxHeight: popoverPosition.maxHeight,
        overflowY: "auto",
      }
    : {
        left: 0,
        top: 0,
        visibility: "hidden",
      };

  const triggerWithPopover = (
    <div className="inline-flex">
      {trigger}

      {popoverOpen ? (
        <div
          ref={popoverWrapperRef}
          data-testid="history-pager-popover-positioner"
          className="fixed z-50"
          style={popoverWrapperStyle}
        >
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
