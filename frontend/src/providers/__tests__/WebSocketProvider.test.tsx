import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocketProvider, { MAX_RETRIES } from "../WebSocketProvider";

/**
 * Minimal controllable WebSocket double.
 * Captures the most recently constructed instance for tests to manipulate.
 */
class FakeWS {
  static latest: FakeWS | null = null;
  static instances: FakeWS[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState = FakeWS.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((e?: { code?: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWS.latest = this;
    FakeWS.instances.push(this);
  }

  close() {
    this.readyState = FakeWS.CLOSED;
    // Test caller decides whether to fire onclose
  }

  triggerOpen() {
    this.readyState = FakeWS.OPEN;
    this.onopen?.();
  }

  triggerClose(code = 1006) {
    this.readyState = FakeWS.CLOSED;
    this.onclose?.({ code });
  }
}

describe("WebSocketProvider", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebSocket = global.WebSocket;
    // @ts-expect-error - FakeWS is a test double
    global.WebSocket = FakeWS;
    FakeWS.latest = null;
    FakeWS.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    global.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it("clears pending reconnect timeout on unmount", () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = render(<WebSocketProvider>{null}</WebSocketProvider>);

    // Simulate the socket closing so a reconnect is scheduled
    act(() => {
      FakeWS.latest?.triggerClose();
    });

    const callCountBeforeUnmount = clearSpy.mock.calls.length;
    unmount();
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callCountBeforeUnmount);
  });

  it("adds jitter to reconnect delay (Math.random is consulted)", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    render(<WebSocketProvider>{null}</WebSocketProvider>);

    // First close -> schedule reconnect; jitter draw expected
    act(() => {
      FakeWS.latest?.triggerClose();
    });

    expect(randomSpy).toHaveBeenCalled();
  });

  it("stops reconnecting after MAX_RETRIES", () => {
    render(<WebSocketProvider>{null}</WebSocketProvider>);

    // Fire MAX_RETRIES consecutive failures. Each close should schedule a
    // reconnect; advancing past the max backoff (30s) + jitter (9s) fires it,
    // constructing a new FakeWS and bumping instances.length.
    for (let i = 0; i < MAX_RETRIES; i++) {
      act(() => {
        FakeWS.latest?.triggerClose();
        vi.advanceTimersByTime(60_000);
      });
    }

    const instancesAtCap = FakeWS.instances.length;

    // One more close should NOT schedule another reconnect -- we've hit the cap.
    act(() => {
      FakeWS.latest?.triggerClose();
      vi.advanceTimersByTime(60_000);
    });

    expect(FakeWS.instances.length).toBe(instancesAtCap);
  });

  it("resets retry count after a successful open", () => {
    render(<WebSocketProvider>{null}</WebSocketProvider>);

    // Burn 5 close failures to push the counter up
    for (let i = 0; i < 5; i++) {
      act(() => {
        FakeWS.latest?.triggerClose();
        vi.advanceTimersByTime(60_000);
      });
    }

    // A successful open should reset the retry counter
    act(() => {
      FakeWS.latest?.triggerOpen();
    });

    const instancesAfterOpen = FakeWS.instances.length;

    // Now a close should schedule a reconnect (counter was reset, so we're
    // nowhere near the cap). Verify a new instance gets constructed.
    act(() => {
      FakeWS.latest?.triggerClose();
      vi.advanceTimersByTime(60_000);
    });

    expect(FakeWS.instances.length).toBeGreaterThan(instancesAfterOpen);
  });
});
