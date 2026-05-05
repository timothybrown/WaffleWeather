import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListObservations } from "@/generated/observations/observations";
import {
  useListDailyObservations,
  useListHourlyObservations,
  useListMonthlyObservations,
} from "@/generated/aggregates/aggregates";
import { wrapper } from "@/test/wrappers";
import { useHistoryData } from "./useHistoryData";

vi.mock("@/generated/observations/observations", () => ({
  useListObservations: vi.fn(),
}));

vi.mock("@/generated/aggregates/aggregates", () => ({
  useListHourlyObservations: vi.fn(),
  useListDailyObservations: vi.fn(),
  useListMonthlyObservations: vi.fn(),
  useGetCalendarData: vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const mockUseListObservations = vi.mocked(useListObservations);
const mockUseListHourlyObservations = vi.mocked(useListHourlyObservations);
const mockUseListDailyObservations = vi.mocked(useListDailyObservations);
const mockUseListMonthlyObservations = vi.mocked(useListMonthlyObservations);

const rawObservation = {
  timestamp: "2026-04-05T12:00:00Z",
  temp_outdoor: 22,
  humidity_outdoor: 65,
  pressure_rel: 1013,
  wind_speed: 12,
  wind_gust: 18,
  rain_daily: 2.5,
  solar_radiation: 450,
  uv_index: 5,
};

const aggregateObservation = {
  bucket: "2026-04-05T12:00:00Z",
  temp_outdoor_avg: 22,
  temp_outdoor_min: 18,
  temp_outdoor_max: 26,
  humidity_outdoor_avg: 65,
  pressure_rel_avg: 1013,
  wind_speed_avg: 12,
  wind_gust_max: 18,
  rain_daily_max: 2.5,
  solar_radiation_avg: 450,
  uv_index_max: 5,
};

function rawQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: { items: [rawObservation] } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useListObservations>;
}

function hourlyQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: [aggregateObservation] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useListHourlyObservations>;
}

function dailyQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: [aggregateObservation] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useListDailyObservations>;
}

function monthlyQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: [aggregateObservation] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useListMonthlyObservations>;
}

function latestParams(mock: typeof mockUseListObservations) {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  return call?.[0] as { start: string; end: string; limit?: number };
}

function latestAggregateParams(
  mock:
    | typeof mockUseListHourlyObservations
    | typeof mockUseListDailyObservations
    | typeof mockUseListMonthlyObservations,
) {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  return call?.[0] as { start: string; end: string };
}

function latestOptions(
  mock:
    | typeof mockUseListObservations
    | typeof mockUseListHourlyObservations
    | typeof mockUseListDailyObservations
    | typeof mockUseListMonthlyObservations,
) {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  return call?.[1] as { query?: { enabled?: boolean; refetchInterval?: false } };
}

function renderHistoryData(input: {
  range: "day" | "week" | "month" | "year";
  mode: "live" | "picked";
  anchor?: string;
  timezone: string;
}) {
  return renderHook(() => useHistoryData(input), { wrapper });
}

describe("useHistoryData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    mockUseListObservations.mockReturnValue(rawQuery());
    mockUseListHourlyObservations.mockReturnValue(hourlyQuery());
    mockUseListDailyObservations.mockReturnValue(dailyQuery());
    mockUseListMonthlyObservations.mockReturnValue(monthlyQuery());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("selects raw resolution for live day range", () => {
    const { result } = renderHistoryData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("raw");
  });

  it("selects hourly resolution for week range", () => {
    const { result } = renderHistoryData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("hourly");
  });

  it("selects daily resolution for month range", () => {
    const { result } = renderHistoryData({ range: "month", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("daily");
  });

  it("selects monthly resolution for year range", () => {
    const { result } = renderHistoryData({ range: "year", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("monthly");
  });

  it("uses a rolling 24 hour live day window", () => {
    renderHistoryData({ range: "day", mode: "live", timezone: "UTC" });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-14T12:00:00.000Z",
      end: "2026-04-15T12:00:00.000Z",
      limit: 10000,
    });
  });

  it("uses station-local picked day bounds in America/New_York", () => {
    renderHistoryData({
      range: "day",
      mode: "picked",
      anchor: "2026-04-10",
      timezone: "America/New_York",
    });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-10T04:00:00.000Z",
      end: "2026-04-11T03:59:59.999Z",
    });
  });

  it("uses picked week bounds for a UTC anchor", () => {
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));

    renderHistoryData({ range: "week", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestAggregateParams(mockUseListHourlyObservations)).toEqual({
      start: "2026-04-12T00:00:00.000Z",
      end: "2026-04-18T23:59:59.999Z",
    });
  });

  it("uses picked month bounds for a UTC anchor", () => {
    vi.setSystemTime(new Date("2026-05-02T12:00:00Z"));

    renderHistoryData({ range: "month", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestAggregateParams(mockUseListDailyObservations)).toEqual({
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-04-30T23:59:59.999Z",
    });
  });

  it("clamps the current picked day API end to now minus one millisecond", () => {
    renderHistoryData({ range: "day", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-15T00:00:00.000Z",
      end: "2026-04-15T11:59:59.999Z",
    });
  });

  it("floors current picked API end at period start on the exact start boundary", () => {
    vi.setSystemTime(new Date("2026-04-15T00:00:00Z"));

    renderHistoryData({ range: "day", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-15T00:00:00.000Z",
      end: "2026-04-15T00:00:00.000Z",
    });
  });

  it("uses period end minus one millisecond for past picked periods", () => {
    renderHistoryData({ range: "day", mode: "picked", anchor: "2026-04-14", timezone: "UTC" });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-14T00:00:00.000Z",
      end: "2026-04-14T23:59:59.999Z",
    });
  });

  it("uses live rolling bounds when picked mode has no anchor", () => {
    renderHistoryData({ range: "day", mode: "picked", timezone: "UTC" });

    expect(latestParams(mockUseListObservations)).toMatchObject({
      start: "2026-04-14T12:00:00.000Z",
      end: "2026-04-15T12:00:00.000Z",
      limit: 10000,
    });
  });

  it("enables only the selected range query", () => {
    renderHistoryData({ range: "month", mode: "live", timezone: "UTC" });

    expect(latestOptions(mockUseListObservations).query).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
    expect(latestOptions(mockUseListHourlyObservations).query).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
    expect(latestOptions(mockUseListDailyObservations).query).toMatchObject({
      enabled: true,
      refetchInterval: false,
    });
    expect(latestOptions(mockUseListMonthlyObservations).query).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
  });

  it("does not leak loading or error state from inactive disabled queries", () => {
    mockUseListObservations.mockReturnValue(
      rawQuery({ isLoading: false, isError: false, error: null }),
    );
    mockUseListHourlyObservations.mockReturnValue(
      hourlyQuery({ isLoading: true, isError: true, error: new Error("inactive hourly") }),
    );
    mockUseListDailyObservations.mockReturnValue(
      dailyQuery({ isLoading: true, isError: true, error: new Error("inactive daily") }),
    );
    mockUseListMonthlyObservations.mockReturnValue(
      monthlyQuery({ isLoading: true, isError: true, error: new Error("inactive monthly") }),
    );

    const { result } = renderHistoryData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("propagates active query error state", () => {
    const activeError = new Error("active hourly");
    mockUseListHourlyObservations.mockReturnValue(
      hourlyQuery({ isError: true, error: activeError }),
    );

    const { result } = renderHistoryData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(activeError);
  });

  it("refetch calls only the active query refetch and returns its result", () => {
    const refetchResult = Promise.resolve({ data: "fresh" });
    const rawRefetch = vi.fn();
    const hourlyRefetch = vi.fn(() => refetchResult);
    const dailyRefetch = vi.fn();
    const monthlyRefetch = vi.fn();
    mockUseListObservations.mockReturnValue(rawQuery({ refetch: rawRefetch }));
    mockUseListHourlyObservations.mockReturnValue(hourlyQuery({ refetch: hourlyRefetch }));
    mockUseListDailyObservations.mockReturnValue(dailyQuery({ refetch: dailyRefetch }));
    mockUseListMonthlyObservations.mockReturnValue(monthlyQuery({ refetch: monthlyRefetch }));

    const { result } = renderHistoryData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.refetch()).toBe(refetchResult);
    expect(rawRefetch).not.toHaveBeenCalled();
    expect(hourlyRefetch).toHaveBeenCalledTimes(1);
    expect(dailyRefetch).not.toHaveBeenCalled();
    expect(monthlyRefetch).not.toHaveBeenCalled();
  });

  it("keeps refetch callback stable when the active query refetch is stable", () => {
    const rawRefetch = vi.fn();
    const hourlyRefetch = vi.fn();
    const dailyRefetch = vi.fn();
    const monthlyRefetch = vi.fn();
    mockUseListObservations.mockImplementation(() => rawQuery({ refetch: rawRefetch }));
    mockUseListHourlyObservations.mockImplementation(() => hourlyQuery({ refetch: hourlyRefetch }));
    mockUseListDailyObservations.mockImplementation(() => dailyQuery({ refetch: dailyRefetch }));
    mockUseListMonthlyObservations.mockImplementation(() => monthlyQuery({ refetch: monthlyRefetch }));

    const { result, rerender } = renderHook(
      ({ input }) => useHistoryData(input),
      {
        wrapper,
        initialProps: { input: { range: "week", mode: "live", timezone: "UTC" } as const },
      },
    );
    const firstRefetch = result.current.refetch;

    rerender({ input: { range: "week", mode: "live", timezone: "UTC" } as const });

    expect(result.current.refetch).toBe(firstRefetch);
  });

  it("keeps memoized bounds stable when rerendered with a fresh matching input object", () => {
    const { rerender } = renderHook(
      ({ input }) => useHistoryData(input),
      {
        wrapper,
        initialProps: { input: { range: "day", mode: "live", timezone: "UTC" } as const },
      },
    );
    const firstParams = latestParams(mockUseListObservations);

    vi.setSystemTime(new Date("2026-04-15T12:05:00Z"));
    rerender({ input: { range: "day", mode: "live", timezone: "UTC" } as const });

    expect(latestParams(mockUseListObservations).start).toBe(firstParams.start);
    expect(latestParams(mockUseListObservations).end).toBe(firstParams.end);
  });

  it("maps raw observation fields correctly", () => {
    const { result } = renderHistoryData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.data[0]).toEqual({
      time: "2026-04-05T12:00:00Z",
      temp_avg: 22,
      temp_min: 22,
      temp_max: 22,
      humidity_avg: 65,
      pressure_avg: 1013,
      wind_avg: 12,
      wind_gust_max: 18,
      rain_max: 2.5,
      solar_avg: 450,
      uv_max: 5,
    });
  });

  it("maps aggregate observation fields correctly", () => {
    const { result } = renderHistoryData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.data[0]).toEqual({
      time: "2026-04-05T12:00:00Z",
      temp_avg: 22,
      temp_min: 18,
      temp_max: 26,
      humidity_avg: 65,
      pressure_avg: 1013,
      wind_avg: 12,
      wind_gust_max: 18,
      rain_max: 2.5,
      solar_avg: 450,
      uv_max: 5,
    });
  });
});
