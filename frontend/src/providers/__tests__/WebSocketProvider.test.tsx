import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocketProvider, {
  MAX_RETRIES,
  useWebSocket,
} from "../WebSocketProvider";

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

  it("jitter applied — two consecutive backoffs produce different delays", () => {
    // Force Math.random to emit distinct extremes on the first two jitter
    // draws. Because delay = base + Math.random() * 0.3 * base, the two
    // scheduled setTimeouts must use materially different values -- asserting
    // against the actual delay arg (not just "random was called") locks in
    // that jitter is applied to the schedule, not spuriously consulted.
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // first close: 0 jitter -> delay = base
      .mockReturnValueOnce(0.99); // second close: ~max jitter -> delay ~ base*1.297

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    render(<WebSocketProvider>{null}</WebSocketProvider>);

    // First close: schedules reconnect #1
    act(() => {
      FakeWS.latest?.triggerClose();
    });

    // Fire the pending reconnect so connect() runs and installs a new socket
    // whose onclose can schedule reconnect #2 with its own jitter draw.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    // Second close: schedules reconnect #2 with a different Math.random draw
    act(() => {
      FakeWS.latest?.triggerClose();
    });

    // Collect delays from reconnect-scheduling setTimeout calls. Filter to
    // function-callback timers (the reconnect scheduler always passes a
    // function) to ignore any microtask/flush timers React may have used.
    const delays = setTimeoutSpy.mock.calls
      .filter((args) => typeof args[0] === "function")
      .map((args) => args[1]);

    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays[0]).not.toEqual(delays[1]);
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

  it("stops scheduling reconnect setTimeouts after MAX_RETRIES", () => {
    // Stronger variant of the retry-cap test: asserts that the *scheduler*
    // itself stops firing after the cap, not merely that no new socket got
    // constructed. A broken cap implementation that cleared wsRef but kept
    // scheduling would fail this but pass the instances-length check.
    render(<WebSocketProvider>{null}</WebSocketProvider>);

    // Drive the provider to exactly MAX_RETRIES scheduled reconnects.
    for (let i = 0; i < MAX_RETRIES; i++) {
      act(() => {
        FakeWS.latest?.triggerClose();
        vi.advanceTimersByTime(60_000);
      });
    }

    // Start watching setTimeout *after* we've hit the cap. Any function-based
    // setTimeout from here on would indicate the scheduler is still firing.
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    // One more close past the cap.
    act(() => {
      FakeWS.latest?.triggerClose();
      vi.advanceTimersByTime(60_000);
    });

    const reconnectScheduleCalls = setTimeoutSpy.mock.calls.filter(
      (args) => typeof args[0] === "function",
    );
    expect(reconnectScheduleCalls.length).toBe(0);
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

  it("exposes offline status after MAX_RETRIES", () => {
    // Captures the most recent context value so the test can assert against
    // the consumer-visible state (offline, reconnect) rather than relying on
    // implementation-internal counters.
    let captured: ReturnType<typeof useWebSocket> | null = null;
    function Probe() {
      captured = useWebSocket();
      return null;
    }

    render(
      <WebSocketProvider>
        <Probe />
      </WebSocketProvider>,
    );

    // Before the cap is hit, offline should be false even while disconnected.
    expect(captured?.offline).toBe(false);

    // Drive MAX_RETRIES consecutive failures. Each close schedules a
    // reconnect; advancing past max backoff + jitter fires it and constructs
    // a new FakeWS.
    for (let i = 0; i < MAX_RETRIES; i++) {
      act(() => {
        FakeWS.latest?.triggerClose();
        vi.advanceTimersByTime(60_000);
      });
    }

    // One more close should flip offline true and NOT schedule another
    // reconnect.
    const instancesAtCap = FakeWS.instances.length;
    act(() => {
      FakeWS.latest?.triggerClose();
      vi.advanceTimersByTime(60_000);
    });

    expect(captured?.offline).toBe(true);
    expect(captured?.connected).toBe(false);
    expect(FakeWS.instances.length).toBe(instancesAtCap);

    // Manual reconnect should construct a new socket and clear offline once
    // it opens.
    act(() => {
      captured?.reconnect();
    });
    expect(FakeWS.instances.length).toBe(instancesAtCap + 1);

    act(() => {
      FakeWS.latest?.triggerOpen();
    });
    expect(captured?.offline).toBe(false);
    expect(captured?.connected).toBe(true);
  });
});
