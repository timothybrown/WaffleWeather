"use client";

import { useUnits } from "@/providers/UnitsProvider";

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const currentYear = new Date().getFullYear().toString();
  if (y !== currentYear) return iso;
  return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

interface RecordValueProps {
  value: number | null | undefined;
  date: string | null | undefined;
  format: (value: number, system: "metric" | "imperial") => string;
  align?: "left" | "right";
}

export default function RecordValue({ value, date, format, align = "right" }: RecordValueProps) {
  const { system } = useUnits();
  const alignClass = align === "right" ? "text-right" : "text-left";

  if (value == null || date == null) {
    return <span className={`block font-mono text-sm text-text-faint ${alignClass}`}>&mdash;</span>;
  }

  return (
    <>
      <span className={`block font-mono text-sm font-medium tabular-nums text-text ${alignClass}`}>
        {format(value, system)}
      </span>
      <span className={`block whitespace-nowrap text-[0.65rem] text-text-faint ${alignClass}`}>
        {shortDate(date)}
      </span>
    </>
  );
}
