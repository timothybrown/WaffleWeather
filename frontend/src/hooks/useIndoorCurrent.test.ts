import { act, renderHook } from "@testing-library/react";
import { keepPreviousData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListSensorObservations } from "@/generated/sensors/sensors";
import type { Observation, SensorReading } from "@/generated/models";
import { CADENCES } from "@/lib/queryCadences";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { wrapper } from "@/test/wrappers";
import { useIndoorCurrent } from "./useIndoorCurrent";

vi.mock("@/generated/sensors/sensors", () => ({
  useListSensorObservations: vi.fn(),
}));

vi.mock("@/providers/WebSocketProvider", () => ({
  useWebSocket: vi.fn(),
}));

const mockUseListSensorObservations = vi.mocked(useListSensorObservations);
const mockUseWebSocket = vi.mocked(useWebSocket);

const newestReading: SensorReading = {
  station_id: "simulator",
  sensor_key: "gw",
  timestamp: "2026-08-16T12:00:00Z",
  temp: 21.5,
  humidity: 47,
};

const olderReading: SensorReading = {
  station_id: "simulator",
  sensor_key: "gw",
  timestamp: "2026-08-16T11:45:00Z",
  temp: 21.2,
  humidity: 46,
};

function sensorQuery(
  rows: SensorReading[] = [newestReading, olderReading],
  overrides: Record<string, unknown> = {},
) {
  return {
    data: { data: { sensors: [], rows } },
    isLoading: false,
    ...overrides,
  } as unknown as ReturnType<typeof useListSensorObservations>;
}

function latestParams() {
  const call = mockUseListSensorObservations.mock.calls.at(-1);
  return call?.[0] as {
    start: string;
    end: string;
    granularity: string;
    sensor_key: string;
    limit: number;
  };
}

function latestOptions() {
  const call = mockUseListSensorObservations.mock.calls.at(-1);
  return call?.[1] as {
    query?: { refetchInterval?: number | false; placeholderData?: unknown };
  };
}

function renderIndoorCurrent() {
  return renderHook(() => useIndoorCurrent(), { wrapper });
}

describe("useIndoorCurrent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00Z"));

    mockUseListSensorObservations.mockReturnValue(sensorQuery());
    mockUseWebSocket.mockReturnValue({
      latestObservation: null,
      diagnostics: null,
      connected: true,
      offline: false,
      reconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns the most recent fetched indoor reading", () => {
    const { result } = renderIndoorCurrent();

    expect(result.current.temp).toBe(21.5);
    expect(result.current.humidity).toBe(47);
    expect(result.current.isLoading).toBe(false);
  });

  it("lets WebSocket indoor values override the fetched latest row", () => {
    mockUseWebSocket.mockReturnValue({
      latestObservation: {
        timestamp: "2026-08-16T12:00:10Z",
        station_id: "simulator",
        temp_indoor: 22.3,
        humidity_indoor: 49,
      } as Observation,
      diagnostics: null,
      connected: true,
      offline: false,
      reconnect: vi.fn(),
    });

    const { result } = renderIndoorCurrent();

    expect(result.current.temp).toBe(22.3);
    expect(result.current.humidity).toBe(49);
    expect(result.current.tempTrend).toBeCloseTo(0.3);
  });

  it("lets explicit WebSocket indoor nulls override the fetched latest row", () => {
    mockUseWebSocket.mockReturnValue({
      latestObservation: {
        timestamp: "2026-08-16T12:00:10Z",
        station_id: "simulator",
        temp_indoor: null,
        humidity_indoor: null,
      } as Observation,
      diagnostics: null,
      connected: true,
      offline: false,
      reconnect: vi.fn(),
    });

    const { result } = renderIndoorCurrent();

    expect(result.current.temp).toBeNull();
    expect(result.current.humidity).toBeNull();
    expect(result.current.tempTrend).toBeCloseTo(0.3);
  });

  it("computes rising trends from the newest reading to one at least 15 minutes older", () => {
    const { result } = renderIndoorCurrent();

    expect(result.current.tempTrend).toBeCloseTo(0.3);
    expect(result.current.humidityTrend).toBe(1);
  });

  it("returns null trends when no older reading reaches the trend window", () => {
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery([
        newestReading,
        {
          station_id: "simulator",
          sensor_key: "gw",
          timestamp: "2026-08-16T11:50:01Z",
          temp: 21.2,
          humidity: 46,
        },
      ]),
    );

    const { result } = renderIndoorCurrent();

    expect(result.current.tempTrend).toBeNull();
    expect(result.current.humidityTrend).toBeNull();
  });

  it("exposes sparkline points oldest first", () => {
    const { result } = renderIndoorCurrent();

    expect(result.current.tempSparkline).toEqual([21.2, 21.5]);
    expect(result.current.humiditySparkline).toEqual([46, 47]);
  });

  it("recomputes the query window as the minute tick advances", () => {
    const { result } = renderIndoorCurrent();
    const firstWindowStart = result.current.windowStart;
    const firstParams = latestParams();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const nextParams = latestParams();
    expect(result.current.windowStart).not.toBe(firstWindowStart);
    expect(new Date(nextParams.start).getTime()).toBeGreaterThan(
      new Date(firstParams.start).getTime(),
    );
    expect(new Date(nextParams.end).getTime()).toBeGreaterThan(
      new Date(firstParams.end).getTime(),
    );
  });

  it("queries the gateway raw window with the summary polling cadence", () => {
    renderIndoorCurrent();

    expect(latestParams()).toEqual({
      start: "2026-08-15T12:00:00.000Z",
      end: "2026-08-16T12:00:00.000Z",
      granularity: "raw",
      sensor_key: "gw",
      limit: 10000,
    });
    expect(latestOptions().query).toMatchObject({
      refetchInterval: CADENCES.summary,
      placeholderData: keepPreviousData,
    });
  });

  it("preserves partial null values without throwing", () => {
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery([
        {
          station_id: "simulator",
          sensor_key: "gw",
          timestamp: "2026-08-16T12:00:00Z",
          temp: null,
          humidity: 47,
        },
        {
          station_id: "simulator",
          sensor_key: "gw",
          timestamp: "2026-08-16T11:45:00Z",
          temp: 21.2,
          humidity: null,
        },
      ]),
    );

    const { result } = renderIndoorCurrent();

    expect(result.current.temp).toBeNull();
    expect(result.current.humidity).toBe(47);
    expect(result.current.tempTrend).toBeNull();
    expect(result.current.humidityTrend).toBeNull();
    expect(result.current.tempSparkline).toEqual([21.2, null]);
    expect(result.current.humiditySparkline).toEqual([null, 47]);
  });

  it("handles rows with missing timestamps safely", () => {
    mockUseListSensorObservations.mockReturnValue(
      sensorQuery([
        {
          station_id: "simulator",
          sensor_key: "gw",
          temp: 22,
          humidity: 48,
        },
        {
          station_id: "simulator",
          sensor_key: "gw",
          timestamp: "2026-08-16T11:30:00Z",
          temp: 21,
          humidity: 45,
        },
      ]),
    );

    const { result } = renderIndoorCurrent();

    expect(result.current.temp).toBe(22);
    expect(result.current.humidity).toBe(48);
    expect(result.current.tempTrend).toBeNull();
    expect(result.current.humidityTrend).toBeNull();
    expect(result.current.tempSparkline).toEqual([21, 22]);
  });

  it("propagates the generated query loading state", () => {
    mockUseListSensorObservations.mockReturnValue(sensorQuery([], { isLoading: true }));

    const { result } = renderIndoorCurrent();

    expect(result.current.isLoading).toBe(true);
  });
});
