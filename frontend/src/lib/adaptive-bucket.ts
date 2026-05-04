export type AggMode = "avg" | "max";

export interface SeriesSpec<Row> {
  field: keyof Row & string;
  agg: AggMode;
}

export interface BucketMeta {
  /** Bucket left edge, unix seconds. Also used as the row's `time` value. */
  tStart: number;
  /** Bucket right edge (exclusive), unix seconds. Tooltip-only. */
  tEnd: number;
}

export interface BucketResult<Row> {
  rows: Row[];
  meta: BucketMeta[];
}

/**
 * Group rows into fixed-size time buckets and aggregate per series.
 *
 * - Input rows must have a numeric `time` field in unix seconds and be sorted
 *   ascending by time.
 * - Each output row's `time` field equals the bucket's `tStart` (left edge);
 *   `tEnd` lives only in the parallel `meta` array for tooltip use.
 * - Bucket boundaries are half-open `[tStart, tEnd)`: samples at `tStart` are
 *   included, samples at `tEnd` belong to the next bucket. This pairs with
 *   uPlot's `paths.stepped({ align: 1 })` which holds a value from x to the
 *   next x.
 * - Empty buckets (no samples or all-null samples) are preserved with null
 *   aggregates so chart paths visibly break across outages instead of
 *   spanning them.
 * - `avg` is the arithmetic mean of finite, non-null values; `max` is the
 *   maximum. Nulls and NaN are skipped.
 */
export function bucket<Row extends { time: number }>(
  rows: Row[],
  bucketSizeS: number,
  series: SeriesSpec<Row>[],
): BucketResult<Row> {
  if (rows.length === 0) return { rows: [], meta: [] };

  const tStart0 = Math.floor(rows[0].time / bucketSizeS) * bucketSizeS;
  const tLastSample = rows[rows.length - 1].time;
  const numBuckets = Math.floor((tLastSample - tStart0) / bucketSizeS) + 1;

  const buckets: Row[][] = Array.from({ length: numBuckets }, () => []);
  for (const row of rows) {
    const idx = Math.floor((row.time - tStart0) / bucketSizeS);
    if (idx >= 0 && idx < numBuckets) {
      buckets[idx].push(row);
    }
  }

  const outRows: Row[] = [];
  const meta: BucketMeta[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const tStart = tStart0 + i * bucketSizeS;
    const tEnd = tStart + bucketSizeS;
    const samples = buckets[i];

    const aggregated = { time: tStart } as Record<string, number | null>;
    for (const { field, agg } of series) {
      const values = samples
        .map((r) => r[field] as unknown as number | null)
        .filter((v): v is number => v != null && !Number.isNaN(v));
      if (values.length === 0) {
        aggregated[field] = null;
      } else if (agg === "avg") {
        aggregated[field] = values.reduce((s, v) => s + v, 0) / values.length;
      } else {
        // agg === "max"
        aggregated[field] = Math.max(...values);
      }
    }

    outRows.push(aggregated as unknown as Row);
    meta.push({ tStart, tEnd });
  }

  return { rows: outRows, meta };
}
