import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useListStations } from "@/generated/stations/stations";
import type { Station } from "@/generated/models";
import { wrapper } from "@/test/wrappers";

import {
  getZonedParts,
  useStationTimezone,
  useStationTimezoneStatus,
  zonedMidnightToUtc,
} from "./useStationTimezone";

vi.mock("@/generated/stations/stations", () => ({
  useListStations: vi.fn(),
}));

const useListStationsMock = vi.mocked(useListStations);
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function mockStations(
  stations?: Station[],
  options: { isFetched?: boolean; isError?: boolean } = {},
) {
  useListStationsMock.mockReturnValue({
    data: stations ? { data: stations, status: 200, headers: new Headers() } : undefined,
    isFetched: options.isFetched ?? stations !== undefined,
    isError: options.isError ?? false,
  } as ReturnType<typeof useListStations>);
}

describe("useStationTimezone", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns station timezone when station data is present", () => {
    mockStations([
      {
        id: "station-1",
        name: "Backyard",
        timezone: "America/Los_Angeles",
      },
    ]);

    const { result } = renderHook(() => useStationTimezone(), { wrapper });

    expect(result.current).toBe("America/Los_Angeles");
  });

  it("falls back to browser timezone when no stations are returned", () => {
    mockStations([]);

    const { result } = renderHook(() => useStationTimezone(), { wrapper });

    expect(result.current).toBe(browserTimezone);
  });

  it("falls back to browser timezone when station timezone is null", () => {
    mockStations([
      {
        id: "station-1",
        name: "Backyard",
        timezone: null,
      },
    ]);

    const { result } = renderHook(() => useStationTimezone(), { wrapper });

    expect(result.current).toBe(browserTimezone);
  });
});

describe("useStationTimezoneStatus", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("uses browser timezone and reports unsettled before station data loads", () => {
    mockStations();

    const { result } = renderHook(() => useStationTimezoneStatus(), { wrapper });

    expect(result.current).toEqual({
      timezone: browserTimezone,
      isSettled: false,
    });
  });

  it("returns station timezone and reports settled when station data is present", () => {
    mockStations([
      {
        id: "station-1",
        name: "Backyard",
        timezone: "America/Los_Angeles",
      },
    ]);

    const { result } = renderHook(() => useStationTimezoneStatus(), { wrapper });

    expect(result.current).toEqual({
      timezone: "America/Los_Angeles",
      isSettled: true,
    });
  });

  it("falls back to browser timezone and reports settled when no stations are returned", () => {
    mockStations([]);

    const { result } = renderHook(() => useStationTimezoneStatus(), { wrapper });

    expect(result.current).toEqual({
      timezone: browserTimezone,
      isSettled: true,
    });
  });

  it("falls back to browser timezone and reports settled when station timezone is null", () => {
    mockStations([
      {
        id: "station-1",
        name: "Backyard",
        timezone: null,
      },
    ]);

    const { result } = renderHook(() => useStationTimezoneStatus(), { wrapper });

    expect(result.current).toEqual({
      timezone: browserTimezone,
      isSettled: true,
    });
  });

  it("falls back to browser timezone and reports settled when station query errors", () => {
    mockStations(undefined, { isError: true });

    const { result } = renderHook(() => useStationTimezoneStatus(), { wrapper });

    expect(result.current).toEqual({
      timezone: browserTimezone,
      isSettled: true,
    });
  });
});

describe("stationTime re-exports", () => {
  it("re-exports pure timezone helpers for existing hook consumers", () => {
    expect(getZonedParts("UTC", new Date("2026-04-27T15:30:00Z"))).toMatchObject({
      year: 2026,
      month: 4,
      day: 27,
      hour: 15,
      minute: 30,
      second: 0,
    });
    expect(zonedMidnightToUtc("America/New_York", 2026, 4, 27).toISOString()).toBe(
      "2026-04-27T04:00:00.000Z",
    );
  });
});
