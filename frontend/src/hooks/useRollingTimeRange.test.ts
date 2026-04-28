import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRollingTimeRange } from "./useRollingTimeRange";

afterEach(() => {
  vi.useRealTimers();
});

describe("useRollingTimeRange", () => {
  it("keeps the duration fixed while sliding start and end forward", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));

    const { result } = renderHook(() => useRollingTimeRange(24 * 60 * 60 * 1000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const next = result.current;
    expect(new Date(next.start).getTime()).toBeGreaterThan(new Date(first.start).getTime());
    expect(new Date(next.end).getTime()).toBeGreaterThan(new Date(first.end).getTime());
    expect(new Date(next.end).getTime() - new Date(next.start).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
