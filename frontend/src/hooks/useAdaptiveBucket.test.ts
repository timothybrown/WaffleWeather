import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdaptiveBucket } from "./useAdaptiveBucket";
import type { SeriesSpec } from "@/lib/adaptive-bucket";

interface TestRow {
  time: number;
  speed: number | null;
  gust: number | null;
}

const speedAvg: SeriesSpec<TestRow> = { field: "speed", agg: "avg" };
const gustMax: SeriesSpec<TestRow> = { field: "gust", agg: "max" };
const SERIES = [speedAvg, gustMax];

function makeRows(count: number, startTime = 1700000000, stepS = 16): TestRow[] {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * stepS,
    speed: 5 + Math.sin(i / 10),
    gust: 10 + Math.sin(i / 8),
  }));
}

describe("useAdaptiveBucket", () => {
  it("returns raw passthrough when chartWidthPx is 0", () => {
    const rawData = makeRows(10);
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 86400,
        chartWidthPx: 0,
        series: SERIES,
      }),
    );
    expect(result.current.rows).toBe(rawData);
    expect(result.current.bucketMeta).toBeNull();
    expect(result.current.bucketSizeS).toBeNull();
  });

  it("returns raw passthrough when rawData is empty", () => {
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData: [],
        visibleSpanS: 86400,
        chartWidthPx: 700,
        series: SERIES,
      }),
    );
    expect(result.current.rows).toEqual([]);
    expect(result.current.bucketMeta).toBeNull();
  });

  it("returns raw passthrough when enabled is false", () => {
    const rawData = makeRows(10);
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 86400,
        chartWidthPx: 700,
        series: SERIES,
        enabled: false,
      }),
    );
    expect(result.current.rows).toBe(rawData);
    expect(result.current.bucketMeta).toBeNull();
  });

  it("returns raw passthrough when desired bucket size is below RAW_CADENCE_S * 1.5 (=24s)", () => {
    // 60min span × 700px / 3px-target → desired ~15.4s → fall back to raw,
    // even though snapping would push to 30s. This is the core spec invariant.
    const rawData = makeRows(225, 1700000000, 16); // 60min of 16s samples
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 60 * 60,
        chartWidthPx: 700,
        series: SERIES,
      }),
    );
    expect(result.current.bucketMeta).toBeNull();
    expect(result.current.bucketSizeS).toBeNull();
    expect(result.current.rows).toBe(rawData);
  });

  it("buckets when desired bucket size exceeds 24s threshold (does not pre-snap)", () => {
    // Just past the threshold: visibleSpanS=120min, 700px, 3px-target →
    // desired = 7200/(700/3) = 30.86s (> 24s) → snap up to 60s (1m)
    const rawData = makeRows(450, 1700000000, 16); // 120min of 16s samples
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 120 * 60,
        chartWidthPx: 700,
        series: SERIES,
      }),
    );
    expect(result.current.bucketMeta).not.toBeNull();
    expect(result.current.bucketSizeS).toBe(60);
  });

  it("snaps full 24h × 700px to 600s (10m)", () => {
    // 86400 / (700/3) = 370.3s → snap up to 600 (10m)
    const rawData = makeRows(5400, 1700000000, 16);
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 24 * 60 * 60,
        chartWidthPx: 700,
        series: SERIES,
      }),
    );
    expect(result.current.bucketSizeS).toBe(600);
    expect(result.current.bucketMeta).not.toBeNull();
  });

  it("snaps full 24h × 360px (mobile) to 900s (15m)", () => {
    // 86400 / (360/3) = 720s → snap up to 900 (15m)
    const rawData = makeRows(5400, 1700000000, 16);
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 24 * 60 * 60,
        chartWidthPx: 360,
        series: SERIES,
      }),
    );
    expect(result.current.bucketSizeS).toBe(900);
  });

  it("clamps to the largest snap interval (900s) when desired exceeds the ceiling", () => {
    // Absurdly tall+narrow chart that would want >900s buckets
    const rawData = makeRows(10000, 1700000000, 16);
    const { result } = renderHook(() =>
      useAdaptiveBucket({
        rawData,
        visibleSpanS: 7 * 24 * 60 * 60, // 7 days span (hypothetical)
        chartWidthPx: 100,
        series: SERIES,
      }),
    );
    expect(result.current.bucketSizeS).toBe(900);
  });

  it("memoizes — identical inputs return same reference", () => {
    const rawData = makeRows(100);
    const series = SERIES;
    const { result, rerender } = renderHook(
      ({ width }: { width: number }) =>
        useAdaptiveBucket({
          rawData,
          visibleSpanS: 86400,
          chartWidthPx: width,
          series,
        }),
      { initialProps: { width: 700 } },
    );
    const first = result.current;
    rerender({ width: 700 });
    expect(result.current).toBe(first);
  });
});
