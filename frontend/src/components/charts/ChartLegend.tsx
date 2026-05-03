"use client";

import { cn } from "@/lib/utils";
import type { SeriesMeta } from "./chartConfigs";

interface ChartLegendProps {
  series: SeriesMeta[];
  visibility: boolean[];
  /** When omitted, chips render as decorative (single-series charts). */
  onToggle?: (idx: number) => void;
  className?: string;
}

export default function ChartLegend({
  series,
  visibility,
  onToggle,
  className,
}: ChartLegendProps) {
  const interactive = onToggle !== undefined;

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5",
        className,
      )}
    >
      {series.map((s, i) => {
        const visible = visibility[i] ?? true;
        return (
          <div
            key={`${s.label}-${i}`}
            data-testid="legend-chip"
            data-visible={visible ? "true" : "false"}
            data-interactive={interactive ? "true" : "false"}
            onClick={interactive ? () => onToggle(i) : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5",
              "text-[10px] font-semibold uppercase tracking-wider",
              "select-none transition-colors",
              interactive && "cursor-pointer hover:bg-surface-alt/50",
              visible
                ? "text-text-muted"
                : "text-text-faint line-through",
            )}
          >
            <span
              data-testid="legend-swatch"
              data-dashed={s.dashed ? "true" : "false"}
              className="inline-block h-[3px] w-3.5 rounded-sm"
              style={{
                background: s.dashed
                  ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 6px)`
                  : s.color,
                opacity: visible ? 1 : 0.3,
              }}
            />
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
