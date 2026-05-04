import type uPlot from "uplot";

/**
 * Convert row-oriented data to uPlot's columnar format.
 * Timestamps are converted from ISO strings to Unix seconds.
 */
export function toColumnar<T extends Record<string, unknown>>(
  rows: T[],
  timeKey: keyof T & string,
  seriesKeys: (keyof T & string)[],
): uPlot.AlignedData {
  const timestamps = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][timeKey];
    timestamps[i] =
      typeof v === "number" ? v : new Date(v as string).getTime() / 1000;
  }

  const series: (number | null)[][] = seriesKeys.map((key) =>
    rows.map((row) => {
      const v = row[key];
      return typeof v === "number" ? v : null;
    }),
  );

  return [timestamps, ...series] as uPlot.AlignedData;
}
