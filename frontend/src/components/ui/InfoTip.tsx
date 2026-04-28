"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface InfoTipProps {
  text: string;
  /** Preferred placement — auto-flips if clipped */
  side?: "top" | "bottom";
}

export default function InfoTip({ text, side = "top" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  // Close on outside click (mobile tap-to-toggle)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Auto-flip vertically and nudge horizontally if tooltip would go off-screen
  // useLayoutEffect runs before paint so the tooltip doesn't visibly snap
  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) return;
    const tooltip = tooltipRef.current;
    const caret = caretRef.current;

    const setPlacementClass = (placement: "top" | "bottom") => {
      tooltip.classList.toggle("info-tip-top", placement === "top");
      tooltip.classList.toggle("info-tip-bottom", placement === "bottom");
      caret?.classList.toggle("info-tip-caret-top", placement === "top");
      caret?.classList.toggle("info-tip-caret-bottom", placement === "bottom");
    };

    tooltip.style.marginLeft = "";
    if (caret) caret.style.marginLeft = "";

    const rect = tooltipRef.current.getBoundingClientRect();
    if (side === "top" && rect.top < 8) {
      setPlacementClass("bottom");
    } else if (side === "bottom" && rect.bottom > window.innerHeight - 8) {
      setPlacementClass("top");
    } else {
      setPlacementClass(side);
    }

    // Horizontal nudge: keep tooltip within visible content area
    const pad = 36;
    const main = tooltipRef.current.closest("main");
    const minLeft = main ? main.getBoundingClientRect().left + pad : pad;
    const maxRight = window.innerWidth - pad;
    let newOffset = 0;
    if (rect.left < minLeft) {
      newOffset = Math.round(minLeft - rect.left);
    } else if (rect.right > maxRight) {
      newOffset = Math.round(maxRight - rect.right);
    }
    if (newOffset !== 0) {
      tooltip.style.marginLeft = `${newOffset}px`;
      if (caret) caret.style.marginLeft = `${-newOffset}px`;
    }
  }, [open, side]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  return (
    <span ref={ref} className="info-tip-wrap">
      <button
        type="button"
        onClick={toggle}
        aria-label="More info"
        className="info-tip-trigger"
      >
        <svg viewBox="0 0 14 14" fill="none" className="info-tip-icon">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M7 6.2V10"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="7" cy="4.25" r="0.75" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <span
          ref={tooltipRef}
          className={`info-tip-bubble info-tip-${side}`}
          role="tooltip"
        >
          {text}
          <span
            ref={caretRef}
            className={`info-tip-caret info-tip-caret-${side}`}
          />
        </span>
      )}
    </span>
  );
}
