import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useElementSize } from "./useElementSize";

type ROEntry = { contentRect: { width: number; height: number } };
type ROCallback = (entries: ROEntry[]) => void;

let activeCallback: ROCallback | null = null;
let observeCalls = 0;
let disconnectCalls = 0;

class MockResizeObserver {
  constructor(cb: ROCallback) {
    activeCallback = cb;
  }
  observe() { observeCalls++; }
  unobserve() {}
  disconnect() { disconnectCalls++; activeCallback = null; }
}

beforeEach(() => {
  vi.useFakeTimers();
  activeCallback = null;
  observeCalls = 0;
  disconnectCalls = 0;
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(debounceMs?: number) {
  return renderHook(() => {
    const ref = useRef<HTMLDivElement>(null);
    // Attach a fake element so ref.current is non-null at effect time
    const fakeEl = document.createElement("div");
    if (ref.current === null) {
      (ref as { current: HTMLDivElement | null }).current = fakeEl;
    }
    const size = useElementSize(ref, debounceMs);
    return { size, ref };
  });
}

describe("useElementSize", () => {
  it("returns zero size before any ResizeObserver callback fires", () => {
    const { result } = setup();
    expect(result.current.size).toEqual({ width: 0, height: 0 });
  });

  it("observes the element on mount and disconnects on unmount", () => {
    const { unmount } = setup();
    expect(observeCalls).toBe(1);
    expect(disconnectCalls).toBe(0);
    unmount();
    expect(disconnectCalls).toBe(1);
  });

  it("updates size after debounce window elapses", () => {
    const { result } = setup(100);

    act(() => {
      activeCallback!([{ contentRect: { width: 800, height: 200 } }]);
    });
    // Before debounce fires, size is still zero
    expect(result.current.size).toEqual({ width: 0, height: 0 });

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.size).toEqual({ width: 800, height: 200 });
  });

  it("coalesces rapid resizes into a single update", () => {
    const { result } = setup(100);

    act(() => {
      activeCallback!([{ contentRect: { width: 100, height: 50 } }]);
    });
    act(() => { vi.advanceTimersByTime(50); });
    act(() => {
      activeCallback!([{ contentRect: { width: 200, height: 75 } }]);
    });
    act(() => { vi.advanceTimersByTime(50); });
    // First update's debounce was reset by the second; not yet fired
    expect(result.current.size).toEqual({ width: 0, height: 0 });

    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.size).toEqual({ width: 200, height: 75 });
  });
});
