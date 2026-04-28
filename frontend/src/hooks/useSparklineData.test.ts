import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { wrapper } from "@/test/wrappers";

vi.mock("@/generated/aggregates/aggregates", () => ({
  useListHourlyObservations: vi.fn().mockReturnValue({
    data: { data: [] },
    isLoading: false,
  }),
}));

import { useListHourlyObservations } from "@/generated/aggregates/aggregates";
const mockHook = vi.mocked(useListHourlyObservations);

import { useSparklineData } from "./useSparklineData";

function makeHourlyRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    bucket: new Date(Date.now() - (count - 1 - i) * 3600_000).toISOString(),
    temp_outdoor_avg: 18 + i * 0.5,
    humidity_outdoor_avg: 60 + i,
    pressure_rel_avg: 1010 + i * 0.1,
  }));
}

describe("useSparklineData", () => {
  it("returns empty arrays when no data", () => {
    mockHook.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useSparklineData(), { wrapper });
    expect(result.current.temperature).toEqual([]);
    expect(result.current.humidity).toEqual([]);
    expect(result.current.pressure).toEqual([]);
  });

  it("extracts metric arrays from hourly data", () => {
    const rows = makeHourlyRows(3);
    mockHook.mockReturnValue({
      data: { data: rows },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useSparklineData(), { wrapper });
    expect(result.current.temperature).toEqual([18, 18.5, 19]);
    expect(result.current.humidity).toEqual([60, 61, 62]);
    expect(result.current.pressure).toEqual([1010, 1010.1, 1010.2]);
  });

  it("produces null for missing fields", () => {
    mockHook.mockReturnValue({
      data: {
        data: [
          { bucket: "2026-04-14T00:00:00Z", temp_outdoor_avg: 20, humidity_outdoor_avg: null, pressure_rel_avg: 1013 },
          { bucket: "2026-04-14T01:00:00Z", temp_outdoor_avg: null, humidity_outdoor_avg: 65, pressure_rel_avg: null },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useSparklineData(), { wrapper });
    expect(result.current.temperature).toEqual([20, null]);
    expect(result.current.humidity).toEqual([null, 65]);
    expect(result.current.pressure).toEqual([1013, null]);
  });

  it("orders data oldest-to-newest", () => {
    const rows = [
      { bucket: "2026-04-14T03:00:00Z", temp_outdoor_avg: 30, humidity_outdoor_avg: 70, pressure_rel_avg: 1015 },
      { bucket: "2026-04-14T01:00:00Z", temp_outdoor_avg: 10, humidity_outdoor_avg: 50, pressure_rel_avg: 1010 },
      { bucket: "2026-04-14T02:00:00Z", temp_outdoor_avg: 20, humidity_outdoor_avg: 60, pressure_rel_avg: 1012 },
    ];
    mockHook.mockReturnValue({
      data: { data: rows },
      isLoading: false,
    } as ReturnType<typeof useListHourlyObservations>);

    const { result } = renderHook(() => useSparklineData(), { wrapper });
    expect(result.current.temperature).toEqual([10, 20, 30]);
    expect(result.current.humidity).toEqual([50, 60, 70]);
    expect(result.current.pressure).toEqual([1010, 1012, 1015]);
  });

  it("passes a 24h time window to the hook", () => {
    renderHook(() => useSparklineData(), { wrapper });
    const callArgs = mockHook.mock.calls[mockHook.mock.calls.length - 1];
    const params = callArgs[0] as { start: string; end: string };
    const start = new Date(params.start).getTime();
    const end = new Date(params.end).getTime();
    const diffHours = (end - start) / 3600_000;
    expect(diffHours).toBeCloseTo(24, 0);
  });

  it("sets refetchInterval to 5 minutes", () => {
    renderHook(() => useSparklineData(), { wrapper });
    const callArgs = mockHook.mock.calls[mockHook.mock.calls.length - 1];
    const options = callArgs[1] as { query?: { refetchInterval?: number } };
    expect(options?.query?.refetchInterval).toBe(300_000);
  });

  it("slides the 24h window forward as time passes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-25T10:00:00Z"));
      mockHook.mockClear();

      const { rerender } = renderHook(() => useSparklineData(), { wrapper });
      const firstParams = mockHook.mock.calls[0]?.[0] as { start: string; end: string };

      // Advance past the 5-minute tick boundary
      vi.setSystemTime(new Date("2026-04-25T10:06:00Z"));
      rerender();

      const latestParams = mockHook.mock.calls[mockHook.mock.calls.length - 1]?.[0] as { start: string; end: string };
      expect(new Date(latestParams.end).getTime()).toBeGreaterThan(new Date(firstParams.end).getTime());
      expect(new Date(latestParams.start).getTime()).toBeGreaterThan(new Date(firstParams.start).getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});
