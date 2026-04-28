import { describe, expect, it, vi, afterEach } from "vitest";
import { getStationToday, getStationTodayParts } from "./useStationTimezone";

afterEach(() => {
  vi.useRealTimers();
});

describe("getStationToday", () => {
  it("returns UTC midnight when the station is in UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T15:30:00Z"));

    expect(getStationToday("UTC").toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });

  it("returns station-local midnight in UTC for a Pacific station", () => {
    vi.useFakeTimers();
    // 2026-04-27T15:30:00Z is 08:30 PDT on 2026-04-27 (UTC-7)
    vi.setSystemTime(new Date("2026-04-27T15:30:00Z"));

    // Station midnight = 2026-04-27T00:00 PDT = 2026-04-27T07:00:00Z
    expect(getStationToday("America/Los_Angeles").toISOString()).toBe("2026-04-27T07:00:00.000Z");
  });

  it("returns station-local midnight for an Eastern station", () => {
    vi.useFakeTimers();
    // 2026-04-27T15:30:00Z is 11:30 EDT on 2026-04-27 (UTC-4)
    vi.setSystemTime(new Date("2026-04-27T15:30:00Z"));

    expect(getStationToday("America/New_York").toISOString()).toBe("2026-04-27T04:00:00.000Z");
  });

  it("uses the station's calendar day when host and station differ across midnight", () => {
    vi.useFakeTimers();
    // 2026-04-27T02:00:00Z is 22:00 EDT on 2026-04-26 (still yesterday in NY)
    // but 02:00 UTC on 2026-04-27 (today in UTC)
    vi.setSystemTime(new Date("2026-04-27T02:00:00Z"));

    // Station NY: today is 2026-04-26 → midnight = 2026-04-26T04:00:00Z
    expect(getStationToday("America/New_York").toISOString()).toBe("2026-04-26T04:00:00.000Z");
    // Station UTC: today is 2026-04-27 → midnight = 2026-04-27T00:00:00Z
    expect(getStationToday("UTC").toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });

  it("returns station-local midnight for an east-of-UTC station", () => {
    vi.useFakeTimers();
    // 2026-04-27T15:30:00Z is 00:30 JST on 2026-04-28 (UTC+9)
    vi.setSystemTime(new Date("2026-04-27T15:30:00Z"));

    // Station Tokyo: today is 2026-04-28 → midnight = 2026-04-27T15:00:00Z
    expect(getStationToday("Asia/Tokyo").toISOString()).toBe("2026-04-27T15:00:00.000Z");
  });

  it("returns the true station-local midnight on spring DST transition days", () => {
    vi.useFakeTimers();
    // Noon UTC is 08:00 EDT on 2026-03-08; local 02:00-02:59 did not exist.
    vi.setSystemTime(new Date("2026-03-08T12:00:00Z"));

    expect(getStationToday("America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("returns station calendar parts without browser-timezone Date getters", () => {
    vi.useFakeTimers();
    // Still Dec 31 in New York, already Jan 1 in UTC.
    vi.setSystemTime(new Date("2027-01-01T03:30:00Z"));

    expect(getStationTodayParts("America/New_York")).toEqual({
      year: 2026,
      month: 12,
      day: 31,
      startIso: "2026-12-31T05:00:00.000Z",
    });
  });
});
