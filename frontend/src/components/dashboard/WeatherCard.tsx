"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import InfoTip from "@/components/ui/InfoTip";

interface WeatherCardProps {
  title: string;
  icon: ReactNode;
  info?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function WeatherCard({
  title,
  icon,
  info,
  badge,
  children,
  className,
}: WeatherCardProps) {
  return (
    <div
      className={cn(
        "weather-card flex flex-col rounded-xl p-5 shadow-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-text-muted">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
        {info && <InfoTip text={info} />}
        {badge}
      </div>
      {children}
    </div>
  );
}
