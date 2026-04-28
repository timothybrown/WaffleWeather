import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimeBucket } from "./useTimeBucket";

afterEach(() => {
  vi.useRealTimers();
});

describe("useTimeBucket", () => {
  it("advances on the requested interval without relying on other renders", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));

    const { result } = renderHook(() => useTimeBucket(60_000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(first + 1);
  });
});
