"use client";

import { useUnits } from "@/providers/UnitsProvider";

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const currentYear = new Date().getFullYear().toString();
  if (y !== currentYear) return iso;
  return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

interface RecordCellProps {
  value: number | null | undefined;
  date: string | null | undefined;
  format: (value: number, system: "metric" | "imperial") => string;
}

export default function RecordCell({ value, date, format }: RecordCellProps) {
  const { system } = useUnits();

  if (value == null || date == null) {
    return (
      <td className="px-1 py-2 text-right align-top sm:px-2">
        <span className="font-mono text-sm text-text-faint">&mdash;</span>
      </td>
    );
  }

  return (
    <td className="px-1 py-2 text-right align-top sm:px-2">
      <span className="block font-mono text-sm font-medium tabular-nums text-text">
        {format(value, system)}
      </span>
      <span className="block whitespace-nowrap text-[0.65rem] text-text-faint">{shortDate(date)}</span>
    </td>
  );
}
