import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { keepPreviousData } from "@tanstack/react-query";
import { wrapper } from "@/test/wrappers";
import { CADENCES } from "@/lib/queryCadences";
import { useTrends } from "./useTrends";

// Mock the generated hook
vi.mock("@/generated/observations/observations", () => ({
  useListObservations: vi.fn(),
}));

import { useListObservations } from "@/generated/observations/observations";
const mockUseListObservations = vi.mocked(useListObservations);

function latestCall() {
  const call = mockUseListObservations.mock.calls.at(-1);
  return {
    params: call?.[0] as { start?: string },
    options: call?.[1] as { query?: { refetchInterval?: number | false; placeholderData?: unknown } },
  };
}

describe("useTrends", () => {
  it("returns null trends when no data", () => {
    mockUseListObservations.mockReturnValue({ data: undefined } as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBeNull();
    expect(result.current.pressure_rel).toBeNull();
  });

  it("returns null trends when fewer than 2 observations", () => {
    mockUseListObservations.mockReturnValue({
      data: { data: { items: [{ temp_outdoor: 22 }] } },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBeNull();
  });

  it("returns 'up' when temperature is rising", () => {
    mockUseListObservations.mockReturnValue({
      data: {
        data: {
          items: [
            { temp_outdoor: 24 }, // newest
            { temp_outdoor: 20 }, // oldest
          ],
        },
      },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBe("up");
  });

  it("returns 'down' when temperature is falling", () => {
    mockUseListObservations.mockReturnValue({
      data: {
        data: {
          items: [
            { temp_outdoor: 18 }, // newest
            { temp_outdoor: 22 }, // oldest
          ],
        },
      },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBe("down");
  });

  it("returns 'flat' when change is below threshold", () => {
    mockUseListObservations.mockReturnValue({
      data: {
        data: {
          items: [
            { temp_outdoor: 22.1 }, // newest: diff=0.1, threshold=0.2
            { temp_outdoor: 22.0 }, // oldest
          ],
        },
      },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBe("flat");
  });

  it("detects pressure trends with correct threshold", () => {
    mockUseListObservations.mockReturnValue({
      data: {
        data: {
          items: [
            { pressure_rel: 1014.0 }, // newest: diff=1.0, threshold=0.1
            { pressure_rel: 1013.0 }, // oldest
          ],
        },
      },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.pressure_rel).toBe("up");
  });

  it("returns null for fields with null values", () => {
    mockUseListObservations.mockReturnValue({
      data: {
        data: {
          items: [
            { temp_outdoor: null, wind_speed: 15 },
            { temp_outdoor: 22, wind_speed: 10 },
          ],
        },
      },
    } as unknown as ReturnType<typeof useListObservations>);
    const { result } = renderHook(() => useTrends(), { wrapper });
    expect(result.current.temp_outdoor).toBeNull();
    expect(result.current.wind_speed).toBe("up");
  });

  describe("query window", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-05T12:00:30Z"));
      mockUseListObservations.mockReturnValue({ data: undefined } as ReturnType<typeof useListObservations>);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("advances the 15-minute window each minute without another render", () => {
      renderHook(() => useTrends(), { wrapper });
      expect(latestCall().params.start).toBe("2026-04-05T11:45:00.000Z");

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(latestCall().params.start).toBe("2026-04-05T11:46:00.000Z");
    });

    it("keeps the previous trends while the next window loads", () => {
      renderHook(() => useTrends(), { wrapper });
      expect(latestCall().options.query).toMatchObject({
        refetchInterval: CADENCES.summary,
        placeholderData: keepPreviousData,
      });
    });
  });
});
