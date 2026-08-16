import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListSensorObservations } from "@/generated/sensors/sensors";
import { wrapper } from "@/test/wrappers";
import { useIndoorData } from "./useIndoorData";

vi.mock("@/generated/sensors/sensors", () => ({
  useListSensorObservations: vi.fn(),
}));

const mockUseListSensorObservations = vi.mocked(useListSensorObservations);

const sensors = [
  {
    station_id: "simulator",
    sensor_key: "gw",
    label: "Indoor",
    placement: "indoor",
  },
];

const newestRawReading = {
  station_id: "simulator",
  sensor_key: "gw",
  timestamp: "2026-04-05T12:00:00Z",
  temp: 22,
  humidity: 60,
};

const oldestRawReading = {
  station_id: "simulator",
  sensor_key: "gw",
  timestamp: "2026-04-05T11:00:00Z",
  temp: null,
  humidity: 58,
};

const newestAggregateReading = {
  station_id: "simulator",
  sensor_key: "gw",
  bucket: "2026-04-05T12:00:00Z",
  temp_avg: 22,
  temp_min: 20,
  temp_max: 24,
  humidity_avg: 60,
  humidity_min: 55,
  humidity_max: 64,
};

const oldestAggregateReading = {
  station_id: "simulator",
  sensor_key: "gw",
  bucket: "2026-04-05T11:00:00Z",
  temp_avg: 21,
  temp_min: 19,
  temp_max: 23,
  humidity_avg: 58,
  humidity_min: 54,
  humidity_max: 61,
};

function sensorQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: { sensors, rows: [newestRawReading, oldestRawReading] } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useListSensorObservations>;
}

function latestParams() {
  const call = mockUseListSensorObservations.mock.calls.at(-1);
  return call?.[0] as {
    start: string;
    end: string;
    granularity: string;
    limit?: number;
  };
}

function latestOptions() {
  const call = mockUseListSensorObservations.mock.calls.at(-1);
  return call?.[1] as { query?: { refetchInterval?: false } };
}

function renderIndoorData(input: {
  range: "day" | "week" | "month" | "year";
  mode: "live" | "picked";
  anchor?: string;
  timezone: string;
}) {
  return renderHook(() => useIndoorData(input), { wrapper });
}

describe("useIndoorData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    mockUseListSensorObservations.mockReturnValue(sensorQuery());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("selects raw resolution for live day range", () => {
    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("raw");
  });

  it("selects hourly resolution for week range", () => {
    const { result } = renderIndoorData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("hourly");
  });

  it("selects daily resolution for month range", () => {
    const { result } = renderIndoorData({ range: "month", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("daily");
  });

  it("selects monthly resolution for year range", () => {
    const { result } = renderIndoorData({ range: "year", mode: "live", timezone: "UTC" });

    expect(result.current.resolution).toBe("monthly");
  });

  it("uses a rolling 24 hour live day window with the raw limit", () => {
    renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(latestParams()).toEqual({
      start: "2026-04-14T12:00:00.000Z",
      end: "2026-04-15T12:00:00.000Z",
      granularity: "raw",
      limit: 10000,
    });
  });

  it("uses rolling aggregate windows without a raw limit", () => {
    renderIndoorData({ range: "week", mode: "live", timezone: "UTC" });

    expect(latestParams()).toEqual({
      start: "2026-04-08T12:00:00.000Z",
      end: "2026-04-15T12:00:00.000Z",
      granularity: "hourly",
    });
  });

  it("uses station-local picked day bounds in America/New_York", () => {
    renderIndoorData({
      range: "day",
      mode: "picked",
      anchor: "2026-04-10",
      timezone: "America/New_York",
    });

    expect(latestParams()).toMatchObject({
      start: "2026-04-10T04:00:00.000Z",
      end: "2026-04-11T03:59:59.999Z",
    });
  });

  it("uses picked week bounds for a UTC anchor", () => {
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));

    renderIndoorData({ range: "week", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestParams()).toMatchObject({
      start: "2026-04-12T00:00:00.000Z",
      end: "2026-04-18T23:59:59.999Z",
      granularity: "hourly",
    });
  });

  it("clamps the current picked day API end to now minus one millisecond", () => {
    renderIndoorData({ range: "day", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestParams()).toMatchObject({
      start: "2026-04-15T00:00:00.000Z",
      end: "2026-04-15T11:59:59.999Z",
    });
  });

  it("floors current picked API end at period start on the exact start boundary", () => {
    vi.setSystemTime(new Date("2026-04-15T00:00:00Z"));

    renderIndoorData({ range: "day", mode: "picked", anchor: "2026-04-15", timezone: "UTC" });

    expect(latestParams()).toMatchObject({
      start: "2026-04-15T00:00:00.000Z",
      end: "2026-04-15T00:00:00.000Z",
    });
  });

  it("uses live rolling bounds when picked mode has no anchor", () => {
    renderIndoorData({ range: "day", mode: "picked", timezone: "UTC" });

    expect(latestParams()).toMatchObject({
      start: "2026-04-14T12:00:00.000Z",
      end: "2026-04-15T12:00:00.000Z",
      granularity: "raw",
      limit: 10000,
    });
  });

  it("does not use background polling", () => {
    renderIndoorData({ range: "month", mode: "live", timezone: "UTC" });

    expect(latestOptions().query).toMatchObject({
      refetchInterval: false,
    });
  });

  it("returns an empty array when the response has no rows", () => {
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery({ data: { data: { sensors, rows: [] } } }),
    );

    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.data).toEqual([]);
  });

  it("preserves the sensors array from the response", () => {
    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.sensors).toBe(sensors);
  });

  it("maps raw sensor readings oldest first", () => {
    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.data).toEqual([
      {
        time: "2026-04-05T11:00:00Z",
        temp_avg: null,
        temp_min: null,
        temp_max: null,
        humidity_avg: 58,
      },
      {
        time: "2026-04-05T12:00:00Z",
        temp_avg: 22,
        temp_min: 22,
        temp_max: 22,
        humidity_avg: 60,
      },
    ]);
  });

  it("maps aggregate sensor readings oldest first", () => {
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery({
        data: {
          data: {
            sensors,
            rows: [newestAggregateReading, oldestAggregateReading],
          },
        },
      }),
    );

    const { result } = renderIndoorData({ range: "week", mode: "live", timezone: "UTC" });

    expect(result.current.data).toEqual([
      {
        time: "2026-04-05T11:00:00Z",
        temp_avg: 21,
        temp_min: 19,
        temp_max: 23,
        humidity_avg: 58,
      },
      {
        time: "2026-04-05T12:00:00Z",
        temp_avg: 22,
        temp_min: 20,
        temp_max: 24,
        humidity_avg: 60,
      },
    ]);
  });

  it("propagates query loading and error state", () => {
    const activeError = new Error("sensor query failed");
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery({ isLoading: true, isError: true, error: activeError }),
    );

    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(activeError);
  });

  it("refetch calls the generated query refetch and returns its result", () => {
    const refetchResult = Promise.resolve({ data: "fresh" });
    const refetch = vi.fn(() => refetchResult);
    mockUseListSensorObservations.mockReturnValue(sensorQuery({ refetch }));

    const { result } = renderIndoorData({ range: "day", mode: "live", timezone: "UTC" });

    expect(result.current.refetch()).toBe(refetchResult);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps refetch callback stable when the generated query refetch is stable", () => {
    const refetch = vi.fn();
    mockUseListSensorObservations.mockImplementation(() => sensorQuery({ refetch }));

    const { result, rerender } = renderHook(
      ({ input }) => useIndoorData(input),
      {
        wrapper,
        initialProps: { input: { range: "day", mode: "live", timezone: "UTC" } as const },
      },
    );
    const firstRefetch = result.current.refetch;

    rerender({ input: { range: "day", mode: "live", timezone: "UTC" } as const });

    expect(result.current.refetch).toBe(firstRefetch);
  });
});
