import { describe, expect, it } from "vitest";

import {
  getStationToday,
  getStationTodayParts,
  getStationTodayString,
  getZonedParts,
  zonedMidnightToUtc,
} from "./stationTime";

function expectZonedDateStart(
  timezone: string,
  year: number,
  month: number,
  day: number,
  expectedHour: number,
) {
  const start = zonedMidnightToUtc(timezone, year, month, day);
  const startParts = getZonedParts(timezone, start);

  expect(startParts).toEqual({
    year,
    month,
    day,
    hour: expectedHour,
    minute: 0,
    second: 0,
  });

  const beforeStartParts = getZonedParts(timezone, new Date(start.getTime() - 1));
  expect({
    year: beforeStartParts.year,
    month: beforeStartParts.month,
    day: beforeStartParts.day,
  }).not.toEqual({ year, month, day });
}

describe("stationTime", () => {
  it("returns UTC midnight when the station is in UTC", () => {
    const now = new Date("2026-04-27T15:30:00Z");

    expect(getStationToday("UTC", now).toISOString()).toBe("2026-04-27T00:00:00.000Z");
    expect(getStationTodayString("UTC", now)).toBe("2026-04-27");
  });

  it("returns station-local midnight in UTC for a Pacific station", () => {
    const now = new Date("2026-04-27T15:30:00Z");

    expect(getStationToday("America/Los_Angeles", now).toISOString()).toBe(
      "2026-04-27T07:00:00.000Z",
    );
    expect(getStationTodayString("America/Los_Angeles", now)).toBe("2026-04-27");
  });

  it("returns station-local midnight in UTC for an Eastern station", () => {
    const now = new Date("2026-04-27T15:30:00Z");

    expect(getStationToday("America/New_York", now).toISOString()).toBe(
      "2026-04-27T04:00:00.000Z",
    );
    expect(getStationTodayString("America/New_York", now)).toBe("2026-04-27");
  });

  it("uses the station calendar day when station time differs across midnight", () => {
    const now = new Date("2026-04-27T02:00:00Z");

    expect(getStationTodayParts("America/New_York", now)).toEqual({
      year: 2026,
      month: 4,
      day: 26,
      startIso: "2026-04-26T04:00:00.000Z",
    });
    expect(getStationTodayString("America/New_York", now)).toBe("2026-04-26");
    expect(getStationToday("UTC", now).toISOString()).toBe("2026-04-27T00:00:00.000Z");
    expect(getStationTodayString("UTC", now)).toBe("2026-04-27");
  });

  it("returns station-local midnight in UTC for an east-of-UTC station", () => {
    const now = new Date("2026-04-27T15:30:00Z");

    expect(getStationTodayParts("Asia/Tokyo", now)).toEqual({
      year: 2026,
      month: 4,
      day: 28,
      startIso: "2026-04-27T15:00:00.000Z",
    });
    expect(getStationTodayString("Asia/Tokyo", now)).toBe("2026-04-28");
  });

  it("resolves station midnight before the spring DST transition gap", () => {
    const now = new Date("2026-03-08T12:00:00Z");

    expect(getStationToday("America/New_York", now).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(zonedMidnightToUtc("America/New_York", 2026, 3, 8).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
  });

  it("resolves station midnight before the fall DST transition repeat", () => {
    const now = new Date("2026-11-01T12:00:00Z");

    expect(getStationToday("America/New_York", now).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(zonedMidnightToUtc("America/New_York", 2026, 11, 1).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
  });

  it("returns the first valid local start when Santiago skips midnight for DST", () => {
    expectZonedDateStart("America/Santiago", 2026, 9, 6, 1);
  });

  it("returns the first valid local start when Havana skips midnight for DST", () => {
    expectZonedDateStart("America/Havana", 2026, 3, 8, 1);
  });
});
