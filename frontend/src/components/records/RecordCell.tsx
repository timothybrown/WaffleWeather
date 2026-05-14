"use client";

import RecordValue from "./RecordValue";

interface RecordCellProps {
  value: number | null | undefined;
  date: string | null | undefined;
  format: (value: number, system: "metric" | "imperial") => string;
}

export default function RecordCell({ value, date, format }: RecordCellProps) {
  return (
    <td className="px-1 py-2 align-top sm:px-2">
      <RecordValue value={value} date={date} format={format} align="right" />
    </td>
  );
}
