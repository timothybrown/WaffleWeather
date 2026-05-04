import { describe, it, expect } from "vitest";
import { bucket, type SeriesSpec } from "./adaptive-bucket";

interface TestRow {
  time: number;
  speed: number | null;
  gust: number | null;
}

const speedAvg: SeriesSpec<TestRow> = { field: "speed", agg: "avg" };
const gustMax: SeriesSpec<TestRow> = { field: "gust", agg: "max" };

// Use a unix-seconds value already aligned to a 60s boundary so test
// expectations don't need to deal with floor-to-bucket arithmetic.
// 1700000040 / 60 = 28333334 exactly.
const T0 = 1700000040;

describe("bucket", () => {
  it("returns empty result for empty input", () => {
    const out = bucket<TestRow>([], 60, [speedAvg]);
    expect(out.rows).toEqual([]);
    expect(out.meta).toEqual([]);
  });

  it("places a single sample in a single bucket and floors row time to the bucket boundary", () => {
    const out = bucket<TestRow>(
      [{ time: T0 + 30, speed: 5, gust: 8 }],
      60,
      [speedAvg, gustMax],
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].time).toBe(T0); // floored to bucket boundary
    expect(out.rows[0].speed).toBe(5);
    expect(out.rows[0].gust).toBe(8);
    expect(out.meta).toEqual([{ tStart: T0, tEnd: T0 + 60 }]);
  });

  it("output row time equals tStart (left edge), not midpoint or tEnd", () => {
    const out = bucket<TestRow>(
      [{ time: T0 + 45, speed: 3, gust: 6 }],
      60,
      [speedAvg, gustMax],
    );
    expect(out.rows[0].time).toBe(T0);
    expect(out.meta[0].tStart).toBe(T0);
    expect(out.meta[0].tEnd).toBe(T0 + 60);
  });

  it("uses half-open boundaries: sample at tStart included, sample at tEnd excluded", () => {
    // Bucket 0 = [T0, T0+60), bucket 1 = [T0+60, T0+120).
    // Sample at T0+60 (== tEnd of bucket 0) belongs to bucket 1.
    const rows: TestRow[] = [
      { time: T0,       speed: 1,  gust: 1 },  // bucket 0 (at tStart, included)
      { time: T0 + 59,  speed: 2,  gust: 2 },  // bucket 0 (just before tEnd)
      { time: T0 + 60,  speed: 99, gust: 99 }, // bucket 1 (at next tStart, NOT bucket 0)
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].time).toBe(T0);
    expect(out.rows[0].speed).toBe(1.5); // avg of [1, 2]
    expect(out.rows[1].time).toBe(T0 + 60);
    expect(out.rows[1].speed).toBe(99);
  });

  it("avg ignores nulls and NaN; max ignores nulls", () => {
    const rows: TestRow[] = [
      { time: T0,      speed: 4,   gust: null },
      { time: T0 + 20, speed: null, gust: 7 },
      { time: T0 + 40, speed: NaN, gust: 5 },
      { time: T0 + 50, speed: 8,   gust: 9 },
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.rows[0].speed).toBe(6); // avg of [4, 8]
    expect(out.rows[0].gust).toBe(9); // max of [7, 5, 9]
  });

  it("preserves a row with null aggregates when a bucket has no samples", () => {
    // Two samples 5 minutes apart with 60s buckets → 4 empty buckets between them
    const rows: TestRow[] = [
      { time: T0,       speed: 1, gust: 1 },
      { time: T0 + 300, speed: 2, gust: 2 }, // 5 min later
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.rows).toHaveLength(6); // buckets 0..5 inclusive
    // First and last buckets have data
    expect(out.rows[0].speed).toBe(1);
    expect(out.rows[5].speed).toBe(2);
    // Middle buckets have null aggregates (no samples)
    expect(out.rows[1].speed).toBeNull();
    expect(out.rows[1].gust).toBeNull();
    expect(out.rows[2].speed).toBeNull();
    // tStart/tEnd populated for all buckets including empty
    expect(out.meta[1]).toEqual({ tStart: T0 + 60, tEnd: T0 + 120 });
  });

  it("preserves a row with null aggregates when all samples in a bucket are null", () => {
    const rows: TestRow[] = [
      { time: T0,      speed: null, gust: null },
      { time: T0 + 30, speed: null, gust: null },
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].speed).toBeNull();
    expect(out.rows[0].gust).toBeNull();
  });

  it("aggregates multiple series in the same bucket independently", () => {
    const rows: TestRow[] = [
      { time: T0,      speed: 2, gust: 3 },
      { time: T0 + 30, speed: 4, gust: 9 },
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.rows[0].speed).toBe(3); // avg
    expect(out.rows[0].gust).toBe(9); // max
  });

  it("meta length matches output rows length", () => {
    const rows: TestRow[] = [
      { time: T0,       speed: 1, gust: 1 },
      { time: T0 + 180, speed: 2, gust: 2 },
    ];
    const out = bucket<TestRow>(rows, 60, [speedAvg, gustMax]);
    expect(out.meta.length).toBe(out.rows.length);
  });
});
