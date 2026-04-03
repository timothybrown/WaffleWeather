"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WeatherCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function WeatherCard({
  title,
  icon,
  children,
  className,
}: WeatherCardProps) {
  return (
    <div
      className={cn(
        "weather-card rounded-xl p-5 shadow-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-text-muted">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}
