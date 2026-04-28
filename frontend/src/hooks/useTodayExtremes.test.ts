import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { wrapper } from "@/test/wrappers";

vi.mock("@/generated/aggregates/aggregates", () => ({
  useListHourlyObservations: vi.fn().mockReturnValue({
    data: { data: [] },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useStationTimezone", async () => {
  const actual = await vi.importActual<typeof import("./useStationTimezone")>("./useStationTimezone");
  return {
    ...actual,
    useStationTimezone: () => "UTC",
  };
});

import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
const mockHook = vi.mocked(useListHourlyObservations);

import { useTodayExtremes } from "./useTodayExtremes";

afterEach(() => {
  vi.useRealTimers();
  mockHook.mockClear();
});

describe("useTodayExtremes", () => {
  it("returns nulls when no rows", () => {
    mockHook.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useTodayExtremes(), { wrapper });
    expect(result.current.tempMin).toBeNull();
    expect(result.current.tempMax).toBeNull();
    expect(result.current.humidityMin).toBeNull();
    expect(result.current.humidityMax).toBeNull();
  });

  it("derives min/max from hourly buckets", () => {
    mockHook.mockReturnValue({
      data: {
        data: [
          { temp_outdoor_min: 10, temp_outdoor_max: 18, humidity_outdoor_min: 40, humidity_outdoor_max: 70 },
          { temp_outdoor_min: 8, temp_outdoor_max: 22, humidity_outdoor_min: 35, humidity_outdoor_max: 65 },
          { temp_outdoor_min: 12, temp_outdoor_max: 19, humidity_outdoor_min: 45, humidity_outdoor_max: 80 },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useTodayExtremes(), { wrapper });
    expect(result.current.tempMin).toBe(8);
    expect(result.current.tempMax).toBe(22);
    expect(result.current.humidityMin).toBe(35);
    expect(result.current.humidityMax).toBe(80);
  });

  it("recomputes params after the day rolls over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T10:00:00Z"));

    const { rerender } = renderHook(() => useTodayExtremes(), { wrapper });
    const firstParams = mockHook.mock.calls[0]?.[0] as { start: string; end: string };

    // Advance 24h — into the next station-local day
    vi.setSystemTime(new Date("2026-04-26T10:00:00Z"));
    rerender();

    const latestParams = mockHook.mock.calls[mockHook.mock.calls.length - 1]?.[0] as { start: string; end: string };
    const dayMs = 24 * 60 * 60 * 1000;
    const startDelta = new Date(latestParams.start).getTime() - new Date(firstParams.start).getTime();
    expect(startDelta).toBe(dayMs);
    expect(new Date(latestParams.end).getTime()).toBeGreaterThan(new Date(firstParams.end).getTime());
  });

  it("advances the end of the window within the same day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T10:00:00Z"));

    const { rerender } = renderHook(() => useTodayExtremes(), { wrapper });
    const firstParams = mockHook.mock.calls[0]?.[0] as { start: string; end: string };

    // Advance 6 minutes — past the 5-minute tick boundary
    vi.setSystemTime(new Date("2026-04-25T10:06:00Z"));
    rerender();

    const latestParams = mockHook.mock.calls[mockHook.mock.calls.length - 1]?.[0] as { start: string; end: string };
    expect(latestParams.start).toBe(firstParams.start);
    expect(new Date(latestParams.end).getTime()).toBeGreaterThan(new Date(firstParams.end).getTime());
  });
});
