import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChartLegend } from "./useChartLegend";

describe("useChartLegend", () => {
  it("seeds visibility from initial array on mount", () => {
    const { result } = renderHook(() =>
      useChartLegend([true, false, true]),
    );
    expect(result.current.visibility).toEqual([true, false, true]);
  });

  it("toggle(idx) flips the value at that index only", () => {
    const { result } = renderHook(() =>
      useChartLegend([true, true, true]),
    );
    act(() => {
      result.current.toggle(1);
    });
    expect(result.current.visibility).toEqual([true, false, true]);

    act(() => {
      result.current.toggle(1);
    });
    expect(result.current.visibility).toEqual([true, true, true]);
  });

  it("does not toggle off the final visible series", () => {
    const { result } = renderHook(() =>
      useChartLegend([true, false]),
    );

    act(() => {
      result.current.toggle(0);
    });
    expect(result.current.visibility).toEqual([true, false]);

    act(() => {
      result.current.toggle(1);
    });
    expect(result.current.visibility).toEqual([true, true]);

    act(() => {
      result.current.toggle(0);
    });
    expect(result.current.visibility).toEqual([false, true]);
  });

  it("does NOT re-seed when initial reference changes but resetKey is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: boolean[] }) => useChartLegend(initial, "k1"),
      { initialProps: { initial: [true, true] } },
    );

    act(() => {
      result.current.toggle(0);
    });
    expect(result.current.visibility).toEqual([false, true]);

    // Pass a new array reference with the same content — must NOT reset
    rerender({ initial: [true, true] });
    expect(result.current.visibility).toEqual([false, true]);
  });

  it("does NOT re-seed across re-renders when resetKey is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ rk }: { rk: string }) => useChartLegend([true, true], rk),
      { initialProps: { rk: "raw" } },
    );

    act(() => {
      result.current.toggle(1);
    });
    expect(result.current.visibility).toEqual([true, false]);

    rerender({ rk: "raw" });
    expect(result.current.visibility).toEqual([true, false]);
  });

  it("re-seeds from initial when resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ initial, rk }: { initial: boolean[]; rk: string }) =>
        useChartLegend(initial, rk),
      { initialProps: { initial: [false, true, false], rk: "raw" } },
    );

    act(() => {
      result.current.toggle(0);
    });
    expect(result.current.visibility).toEqual([true, true, false]);

    // resetKey changes — re-seed from the (new) initial
    rerender({ initial: [true, true, true], rk: "hourly" });
    expect(result.current.visibility).toEqual([true, true, true]);
  });

  it("works without a resetKey (persists for session)", () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: boolean[] }) => useChartLegend(initial),
      { initialProps: { initial: [true, true] } },
    );

    act(() => {
      result.current.toggle(0);
    });
    expect(result.current.visibility).toEqual([false, true]);

    rerender({ initial: [true, true] });
    expect(result.current.visibility).toEqual([false, true]);
  });
});
