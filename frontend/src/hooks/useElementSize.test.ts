import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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
  return renderHook(() => useElementSize<HTMLDivElement>(debounceMs));
}

describe("useElementSize (callback ref)", () => {
  it("returns zero size before the ref is attached", () => {
    const { result } = setup();
    expect(result.current.size).toEqual({ width: 0, height: 0 });
    expect(observeCalls).toBe(0);
  });

  it("does not observe until ref attaches; observes immediately when an element is set", () => {
    const { result } = setup();
    expect(observeCalls).toBe(0);

    const fakeEl = document.createElement("div");
    act(() => { result.current.ref(fakeEl); });
    expect(observeCalls).toBe(1);
  });

  it("re-attaches ResizeObserver when the element changes (conditional remount)", () => {
    // This is the production bug fixed by the callback-ref pattern.
    // If the parent renders the observed element conditionally (e.g. only
    // after a loading spinner clears), the ref attaches LATER than mount.
    const { result } = setup();
    expect(observeCalls).toBe(0);

    // Initial render: no element
    act(() => { result.current.ref(null); });
    expect(observeCalls).toBe(0);

    // Conditional element appears later
    const el1 = document.createElement("div");
    act(() => { result.current.ref(el1); });
    expect(observeCalls).toBe(1);
    expect(disconnectCalls).toBe(0);

    // Element gets unmounted, then a fresh one appears
    act(() => { result.current.ref(null); });
    expect(disconnectCalls).toBe(1);

    const el2 = document.createElement("div");
    act(() => { result.current.ref(el2); });
    expect(observeCalls).toBe(2);
  });

  it("disconnects observer when hook unmounts", () => {
    const { result, unmount } = setup();
    const fakeEl = document.createElement("div");
    act(() => { result.current.ref(fakeEl); });
    expect(disconnectCalls).toBe(0);

    unmount();
    expect(disconnectCalls).toBe(1);
  });

  it("updates size after debounce window elapses", () => {
    const { result } = setup(100);
    const fakeEl = document.createElement("div");
    act(() => { result.current.ref(fakeEl); });

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
    const fakeEl = document.createElement("div");
    act(() => { result.current.ref(fakeEl); });

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

  it("cancels pending debounce timer on unmount — no setState after unmount", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result, unmount } = setup(100);
    const fakeEl = document.createElement("div");
    act(() => { result.current.ref(fakeEl); });

    act(() => {
      activeCallback!([{ contentRect: { width: 800, height: 200 } }]);
    });

    act(() => { vi.advanceTimersByTime(50); });
    unmount();

    act(() => { vi.advanceTimersByTime(200); });

    const stateAfterUnmountWarning = errorSpy.mock.calls.some(([msg]) =>
      typeof msg === "string" && msg.includes("unmounted component")
    );
    expect(stateAfterUnmountWarning).toBe(false);

    errorSpy.mockRestore();
  });
});
