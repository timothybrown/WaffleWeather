"use client";

import { RiArrowUpSLine, RiArrowDownSLine } from "@remixicon/react";
import type { TrendDirection } from "@/hooks/useTrends";
import { cn } from "@/lib/utils";

export default function TrendIndicator({
  trend,
  className,
}: {
  trend: TrendDirection;
  className?: string;
}) {
  if (!trend || trend === "flat") return null;

  return trend === "up" ? (
    <RiArrowUpSLine
      className={cn("h-5 w-5 trend-float text-warning", className)}
      aria-label="Trending up"
    />
  ) : (
    <RiArrowDownSLine
      className={cn("h-5 w-5 trend-float text-primary", className)}
      aria-label="Trending down"
    />
  );
}
