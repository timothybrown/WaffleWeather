"use client";

import { useUnits } from "@/providers/UnitsProvider";

interface RecordCellProps {
  value: number | null | undefined;
  date: string | null | undefined;
  format: (value: number, system: "metric" | "imperial") => string;
}

export default function RecordCell({ value, date, format }: RecordCellProps) {
  const { system } = useUnits();

  if (value == null || date == null) {
    return (
      <td className="px-2 py-2 text-right align-top">
        <span className="font-mono text-sm text-text-faint">&mdash;</span>
      </td>
    );
  }

  return (
    <td className="px-2 py-2 text-right align-top">
      <span className="block font-mono text-sm font-medium tabular-nums text-text">
        {format(value, system)}
      </span>
      <span className="block text-[0.65rem] text-text-faint">{date}</span>
    </td>
  );
}
