import { useMemo } from "react";
import { bucket, type BucketMeta, type SeriesSpec } from "@/lib/adaptive-bucket";

/** WS68 raw sample cadence (seconds). */
const RAW_CADENCE_S = 16;
/** Raw fallback fires when desired bucket ≤ RAW_CADENCE_S × this ratio. */
const RAW_FALLBACK_RATIO = 1.5;
/** Target screen pixels per bucket (Codex's 2.5–4 midpoint). */
const TARGET_PX_PER_BUCKET = 3;
/** Snap candidates in seconds: 30s, 1m, 2m, 5m, 10m, 15m. */
const SNAP_INTERVALS_S = [30, 60, 120, 300, 600, 900];

export interface UseAdaptiveBucketParams<Row extends { time: number }> {
  rawData: Row[];
  /** Visible time span in seconds (zoomed range or full data span). */
  visibleSpanS: number;
  /** Chart container width in screen pixels (from useElementSize). */
  chartWidthPx: number;
  /** Per-series aggregation specs. Memoize at call site to avoid hook thrash. */
  series: SeriesSpec<Row>[];
  /** Default true. When false, always returns raw passthrough. */
  enabled?: boolean;
}

export interface UseAdaptiveBucketResult<Row> {
  rows: Row[];
  /** Non-null when bucketing was applied; null indicates raw passthrough. */
  bucketMeta: BucketMeta[] | null;
  /** Chosen bucket size in seconds; null when raw passthrough. */
  bucketSizeS: number | null;
}

/**
 * Compute a pixel-density-driven bucket size from (visibleSpan, chartWidth)
 * and aggregate raw rows accordingly. The raw-fallback decision uses the
 * UNSNAPPED desired bucket size — snapping must never prevent return-to-raw
 * behavior. Output rows have `time = tStart`; tooltip-facing tEnd lives in
 * `bucketMeta`.
 */
export function useAdaptiveBucket<Row extends { time: number }>(
  params: UseAdaptiveBucketParams<Row>,
): UseAdaptiveBucketResult<Row> {
  const { rawData, visibleSpanS, chartWidthPx, series, enabled = true } = params;

  return useMemo<UseAdaptiveBucketResult<Row>>(() => {
    if (!enabled || rawData.length === 0 || chartWidthPx <= 0 || visibleSpanS <= 0) {
      return { rows: rawData, bucketMeta: null, bucketSizeS: null };
    }

    const desiredBucketS = visibleSpanS / (chartWidthPx / TARGET_PX_PER_BUCKET);

    // Raw-fallback decision uses the UNSNAPPED desired size (spec invariant).
    if (desiredBucketS <= RAW_CADENCE_S * RAW_FALLBACK_RATIO) {
      return { rows: rawData, bucketMeta: null, bucketSizeS: null };
    }

    const snapped =
      SNAP_INTERVALS_S.find((s) => s >= desiredBucketS) ??
      SNAP_INTERVALS_S[SNAP_INTERVALS_S.length - 1];

    const { rows, meta } = bucket(rawData, snapped, series);
    return { rows, bucketMeta: meta, bucketSizeS: snapped };
  }, [rawData, visibleSpanS, chartWidthPx, series, enabled]);
}
