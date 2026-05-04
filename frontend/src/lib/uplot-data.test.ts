import { describe, expect, it } from "vitest";
import { toColumnar } from "./uplot-data";

const rows = [
  { time: "2026-04-05T12:00:00Z", temp: 22.5, humidity: 65 },
  { time: "2026-04-05T12:01:00Z", temp: 23.0, humidity: null },
  { time: "2026-04-05T12:02:00Z", temp: null, humidity: 70 },
];

describe("toColumnar", () => {
  it("converts ISO timestamps to Unix seconds", () => {
    const result = toColumnar(rows, "time", ["temp"]);
    expect(result[0][0]).toBe(new Date("2026-04-05T12:00:00Z").getTime() / 1000);
    expect(result[0][1]).toBe(new Date("2026-04-05T12:01:00Z").getTime() / 1000);
  });

  it("produces correct columnar shape", () => {
    const result = toColumnar(rows, "time", ["temp", "humidity"]);
    expect(result.length).toBe(3); // timestamps + 2 series
    expect(result[0].length).toBe(3); // 3 rows
    expect(result[1].length).toBe(3);
    expect(result[2].length).toBe(3);
  });

  it("preserves numeric values", () => {
    const result = toColumnar(rows, "time", ["temp", "humidity"]);
    expect(result[1][0]).toBe(22.5);
    expect(result[1][1]).toBe(23.0);
    expect(result[2][0]).toBe(65);
  });

  it("handles null values", () => {
    const result = toColumnar(rows, "time", ["temp", "humidity"]);
    expect(result[1][2]).toBeNull(); // temp null
    expect(result[2][1]).toBeNull(); // humidity null
  });

  it("returns empty arrays for empty input", () => {
    const result = toColumnar([], "time", ["temp"]);
    expect(result[0].length).toBe(0);
    expect(result[1].length).toBe(0);
  });

  it("accepts numeric (unix-seconds) time values without conversion", () => {
    const rows = [
      { time: 1700000000, value: 1 },
      { time: 1700000060, value: 2 },
    ];
    const result = toColumnar(rows, "time", ["value"]);
    expect(Array.from(result[0])).toEqual([1700000000, 1700000060]);
    expect(result[1]).toEqual([1, 2]);
  });
});
