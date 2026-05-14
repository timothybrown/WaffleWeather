"use client";

import type { ReactNode } from "react";
import type { RecordMetric } from "@/generated/models";
import RecordCell from "./RecordCell";
import RecordValue from "./RecordValue";

interface RecordCardProps {
  title: string;
  icon: ReactNode;
  records: RecordMetric[];
  formatValue: (metric: string, value: number, system: "metric" | "imperial") => string;
}

const PERIOD_LABEL_CLASS =
  "mb-1 text-[0.6rem] font-medium uppercase tracking-wider text-text-faint";

export default function RecordCard({ title, icon, records, formatValue }: RecordCardProps) {
  return (
    <div className="weather-card flex flex-col rounded-xl p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-text-muted">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
      </div>

      {/* Mobile: stacked layout (one block per metric, 3-col period grid) */}
      <div className="space-y-3 sm:hidden">
        {records.map((rec) => (
          <div
            key={rec.metric}
            className="border-b border-border/50 pb-3 last:border-0 last:pb-0"
          >
            <div className="mb-2 text-sm text-text-muted">{rec.label}</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className={PERIOD_LABEL_CLASS}>This Month</div>
                <RecordValue
                  value={rec.this_month?.value}
                  date={rec.this_month?.date}
                  format={(v, sys) => formatValue(rec.metric, v, sys)}
                  align="left"
                />
              </div>
              <div>
                <div className={PERIOD_LABEL_CLASS}>This Year</div>
                <RecordValue
                  value={rec.this_year?.value}
                  date={rec.this_year?.date}
                  format={(v, sys) => formatValue(rec.metric, v, sys)}
                  align="left"
                />
              </div>
              <div>
                <div className={PERIOD_LABEL_CLASS}>All-Time</div>
                <RecordValue
                  value={rec.all_time?.value}
                  date={rec.all_time?.date}
                  format={(v, sys) => formatValue(rec.metric, v, sys)}
                  align="left"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tablet+: table layout */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[7rem] sm:w-[9rem]" />
            <col className="w-[7rem] sm:w-[9rem]" />
            <col className="w-[7rem] sm:w-[9rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 pr-2 text-left text-[0.65rem] font-medium uppercase tracking-wider text-text-faint">Record</th>
              <th className="pb-2 text-right text-[0.65rem] font-medium uppercase tracking-wider text-text-faint">This Month</th>
              <th className="pb-2 text-right text-[0.65rem] font-medium uppercase tracking-wider text-text-faint">This Year</th>
              <th className="pb-2 text-right text-[0.65rem] font-medium uppercase tracking-wider text-text-faint">All-Time</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.metric} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-2 text-sm text-text-muted sm:pr-4">{rec.label}</td>
                <RecordCell value={rec.this_month?.value} date={rec.this_month?.date} format={(v, sys) => formatValue(rec.metric, v, sys)} />
                <RecordCell value={rec.this_year?.value} date={rec.this_year?.date} format={(v, sys) => formatValue(rec.metric, v, sys)} />
                <RecordCell value={rec.all_time?.value} date={rec.all_time?.date} format={(v, sys) => formatValue(rec.metric, v, sys)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
