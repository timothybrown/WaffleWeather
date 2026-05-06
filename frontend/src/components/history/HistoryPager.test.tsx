import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryPager from "./HistoryPager";

function renderPager(
  props: Partial<React.ComponentProps<typeof HistoryPager>> = {},
) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onPickDate = vi.fn();
  const onReturnToLive = vi.fn();

  render(
    <HistoryPager
      mode="live"
      label="May 15, 2026"
      canGoNext
      maxDate="2026-05-15"
      onPrev={onPrev}
      onNext={onNext}
      onPickDate={onPickDate}
      onReturnToLive={onReturnToLive}
      {...props}
    />,
  );

  return { onPrev, onNext, onPickDate, onReturnToLive };
}

function ModeChangingPager() {
  const [mode, setMode] = useState<"live" | "picked">("live");
  const [selectedDate, setSelectedDate] = useState<string | undefined>();

  return (
    <HistoryPager
      mode={mode}
      label={mode === "live" ? "May 15, 2026" : "May 10, 2026"}
      canGoNext
      maxDate="2026-05-15"
      selectedDate={selectedDate}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onPickDate={(yyyymmdd) => {
        setSelectedDate(yyyymmdd);
        setMode("picked");
      }}
      onReturnToLive={vi.fn()}
    />
  );
}

function ReturnToLivePager({ onReturnToLive }: { onReturnToLive: () => void }) {
  const [mode, setMode] = useState<"live" | "picked">("picked");

  return (
    <HistoryPager
      mode={mode}
      label={mode === "live" ? "May 15, 2026" : "May 10, 2026"}
      canGoNext
      maxDate="2026-05-15"
      selectedDate="2026-05-10"
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onPickDate={vi.fn()}
      onReturnToLive={() => {
        onReturnToLive();
        setMode("live");
      }}
    />
  );
}

async function tabUntilFocused(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  for (let i = 0; i < 40 && document.activeElement !== element; i += 1) {
    await user.tab();
  }
}

async function waitForDeferredFocusRestore() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe("HistoryPager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the live label trigger with a calendar icon", () => {
    renderPager();

    const trigger = screen.getByTestId("history-pager-trigger");
    expect(trigger).toHaveTextContent("May 15, 2026");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render chevrons or Live button in live mode", () => {
    renderPager();

    expect(screen.queryByTestId("history-pager-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-pager-next")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-pager-live")).not.toBeInTheDocument();
  });

  it("opens the popover from the live trigger", async () => {
    const user = userEvent.setup();
    renderPager();

    await user.click(screen.getByTestId("history-pager-trigger"));

    expect(screen.getByTestId("history-popover")).toBeInTheDocument();
  });

  it("renders chevrons, the period label, and Live button in picked mode", () => {
    renderPager({ mode: "picked", label: "May 12, 2026" });

    expect(screen.getByTestId("history-pager-prev")).toBeInTheDocument();
    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent(
      "May 12, 2026",
    );
    expect(screen.getByTestId("history-pager-next")).toBeInTheDocument();
    expect(screen.getByTestId("history-pager-live")).toHaveTextContent("Live");
  });

  it("opens the popover from the picked period label", async () => {
    const user = userEvent.setup();
    renderPager({ mode: "picked", label: "May 12, 2026" });

    await user.click(screen.getByTestId("history-pager-trigger"));

    expect(screen.getByTestId("history-popover")).toBeInTheDocument();
  });

  it("clamps the popover position when the picked trigger is near the viewport edge", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("innerWidth", 500);
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 430,
      y: 20,
      width: 70,
      height: 36,
      top: 20,
      right: 500,
      bottom: 56,
      left: 430,
      toJSON: () => ({}),
    } as DOMRect);

    await user.click(trigger);

    const positioningWrapper = screen.getByTestId(
      "history-pager-popover-positioner",
    );
    expect(positioningWrapper.className).toContain("fixed");

    await waitFor(() => {
      expect(positioningWrapper).toHaveStyle({
        left: "200px",
        top: "64px",
      });
    });
    const positionedRightEdge =
      Number.parseFloat(positioningWrapper.style.left) + 288;
    expect(positionedRightEdge).toBeLessThanOrEqual(window.innerWidth - 12);
  });

  it("flips the popover above the trigger when the trigger is near the viewport bottom", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 300);
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 250,
      width: 120,
      height: 36,
      top: 250,
      right: 240,
      bottom: 286,
      left: 120,
      toJSON: () => ({}),
    } as DOMRect);

    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "history-pager-popover-positioner") {
        return {
          x: 120,
          y: 24,
          width: 288,
          height: 220,
          top: 24,
          right: 408,
          bottom: 244,
          left: 120,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await user.click(trigger);

    const positioningWrapper = screen.getByTestId(
      "history-pager-popover-positioner",
    );

    await waitFor(() => {
      expect(positioningWrapper).toHaveStyle({
        top: "22px",
      });
    });
    const positionedBottomEdge =
      Number.parseFloat(positioningWrapper.style.top) + 220;
    expect(positionedBottomEdge).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it("constrains the popover height so the footer remains reachable in very short viewports", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 180);
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 30,
      width: 120,
      height: 36,
      top: 30,
      right: 240,
      bottom: 66,
      left: 120,
      toJSON: () => ({}),
    } as DOMRect);

    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "history-pager-popover-positioner") {
        return {
          x: 120,
          y: 12,
          width: 288,
          height: 260,
          top: 12,
          right: 408,
          bottom: 272,
          left: 120,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await user.click(trigger);

    const positioningWrapper = screen.getByTestId(
      "history-pager-popover-positioner",
    );

    await waitFor(() => {
      expect(positioningWrapper).toHaveStyle({
        top: "12px",
        maxHeight: "156px",
        overflowY: "auto",
      });
    });

    const maxHeight = Number.parseFloat(positioningWrapper.style.maxHeight);
    const positionedBottomEdge =
      Number.parseFloat(positioningWrapper.style.top) + maxHeight;
    expect(maxHeight).toBeLessThanOrEqual(window.innerHeight - 24);
    expect(positionedBottomEdge).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it("repositions when popover content height changes", async () => {
    const user = userEvent.setup();
    let resizeObserverCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 360);
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 260,
      width: 120,
      height: 36,
      top: 260,
      right: 240,
      bottom: 296,
      left: 120,
      toJSON: () => ({}),
    } as DOMRect);

    let popoverHeight = 120;
    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "history-pager-popover-positioner") {
        return {
          x: 120,
          y: 132,
          width: 288,
          height: popoverHeight,
          top: 132,
          right: 408,
          bottom: 132 + popoverHeight,
          left: 120,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await user.click(trigger);

    const positioningWrapper = screen.getByTestId(
      "history-pager-popover-positioner",
    );

    await waitFor(() => {
      expect(positioningWrapper).toHaveStyle({
        top: "132px",
      });
    });
    expect(resizeObserverCallback).toBeTypeOf("function");

    popoverHeight = 220;
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
    });

    await waitFor(() => {
      expect(positioningWrapper).toHaveStyle({
        top: "32px",
      });
    });
  });

  it("tabs from the opened picked trigger into the popover before Next and Live", async () => {
    const user = userEvent.setup();
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    await user.click(trigger);

    await user.tab();

    expect(screen.getByRole("button", { name: "Previous month" })).toHaveFocus();
    expect(screen.getByTestId("history-pager-next")).not.toHaveFocus();
    expect(screen.getByTestId("history-pager-live")).not.toHaveFocus();
  });

  it("forwards selectedDate to the owned popover", async () => {
    const user = userEvent.setup();
    renderPager({
      mode: "picked",
      label: "May 10, 2026",
      selectedDate: "2026-05-10",
    });

    await user.click(screen.getByTestId("history-pager-trigger"));

    const selectedDay = screen.getByRole("button", {
      name: "Selected, May 10, 2026",
    });
    expect(selectedDay).toHaveAttribute("data-selected", "true");
    expect(selectedDay).not.toHaveAttribute("aria-selected");
  });

  it("forwards maxDate to the owned popover", async () => {
    const user = userEvent.setup();
    const { onPickDate } = renderPager({
      mode: "picked",
      label: "May 10, 2026",
      maxDate: "2026-05-10",
    });

    await user.click(screen.getByTestId("history-pager-trigger"));

    expect(screen.getByRole("button", { name: "10" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    const disabledFutureDay = screen.getByRole("button", { name: "11" });
    expect(disabledFutureDay).toBeDisabled();
    expect(disabledFutureDay).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(onPickDate).toHaveBeenCalledWith("2026-05-10");
  });

  it("disables the right chevron and keeps clicks a no-op when canGoNext is false", async () => {
    const user = userEvent.setup();
    const { onNext } = renderPager({
      mode: "picked",
      label: "May 12, 2026",
      canGoNext: false,
    });

    const next = screen.getByTestId("history-pager-next");
    expect(next).toBeDisabled();

    await user.click(next);

    expect(onNext).not.toHaveBeenCalled();
  });

  it("fires Prev, Next, and Live callbacks", async () => {
    const user = userEvent.setup();
    const { onPrev, onNext, onReturnToLive } = renderPager({
      mode: "picked",
      label: "May 12, 2026",
    });

    await user.click(screen.getByTestId("history-pager-prev"));
    await user.click(screen.getByTestId("history-pager-next"));
    await user.click(screen.getByTestId("history-pager-live"));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onReturnToLive).toHaveBeenCalledTimes(1);
  });

  it("closes the popover and restores focus when Live is keyboard-activated", async () => {
    const user = userEvent.setup();
    const onReturnToLive = vi.fn();
    render(<ReturnToLivePager onReturnToLive={onReturnToLive} />);

    await user.click(screen.getByTestId("history-pager-trigger"));
    const live = screen.getByTestId("history-pager-live");
    await tabUntilFocused(user, live);
    expect(live).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onReturnToLive).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
    const liveTrigger = screen.getByTestId("history-pager-trigger");
    expect(liveTrigger).toHaveTextContent("May 15, 2026");
    await waitFor(() => expect(liveTrigger).toHaveFocus());
  });

  it("closes the popover and restores focus when Next is keyboard-activated", async () => {
    const user = userEvent.setup();
    const { onNext } = renderPager({
      mode: "picked",
      label: "May 12, 2026",
    });

    await user.click(screen.getByTestId("history-pager-trigger"));
    const next = screen.getByTestId("history-pager-next");
    await tabUntilFocused(user, next);
    expect(next).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("history-pager-trigger")).toHaveFocus(),
    );
  });

  it("closes the popover and restores focus when Prev is keyboard-activated", async () => {
    const user = userEvent.setup();
    const { onPrev } = renderPager({
      mode: "picked",
      label: "May 12, 2026",
    });

    await user.click(screen.getByTestId("history-pager-trigger"));
    await user.tab({ shift: true });
    expect(screen.getByTestId("history-pager-prev")).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("history-pager-trigger")).toHaveFocus(),
    );
  });

  it("forwards picked dates and closes the popover", async () => {
    const user = userEvent.setup();
    const { onPickDate } = renderPager({
      mode: "picked",
      label: "May 12, 2026",
    });

    await user.click(screen.getByTestId("history-pager-trigger"));
    await user.click(screen.getByRole("button", { name: "10" }));

    expect(onPickDate).toHaveBeenCalledWith("2026-05-10");
    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
  });

  it("closes instead of close-then-reopening when the open trigger is pressed", async () => {
    const user = userEvent.setup();
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    await user.click(trigger);
    expect(screen.getByTestId("history-popover")).toBeInTheDocument();

    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
  });

  it("does not steal focus from an outside button used to dismiss the popover", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <HistoryPager
          mode="picked"
          label="May 12, 2026"
          canGoNext
          maxDate="2026-05-15"
          selectedDate="2026-05-12"
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onPickDate={vi.fn()}
          onReturnToLive={vi.fn()}
        />
        <button type="button">Outside action</button>
      </div>,
    );

    const trigger = screen.getByTestId("history-pager-trigger");
    const focusTrigger = vi.spyOn(trigger, "focus");
    await user.click(trigger);
    focusTrigger.mockClear();

    await user.click(screen.getByRole("button", { name: "Outside action" }));
    await waitForDeferredFocusRestore();

    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside action" })).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    expect(focusTrigger).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger after closing with Escape", async () => {
    const user = userEvent.setup();
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    await user.click(trigger);
    screen.getByRole("button", { name: "10" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("history-popover")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("returns focus to the trigger after picking a date", async () => {
    const user = userEvent.setup();
    renderPager({ mode: "picked", label: "May 12, 2026" });

    const trigger = screen.getByTestId("history-pager-trigger");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "10" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("returns focus to the new picked trigger after live date selection changes mode", async () => {
    const user = userEvent.setup();
    render(<ModeChangingPager />);

    await user.click(screen.getByTestId("history-pager-trigger"));
    await user.click(screen.getByRole("button", { name: "10" }));

    const pickedTrigger = screen.getByTestId("history-pager-trigger");
    expect(pickedTrigger).toHaveTextContent("May 10, 2026");
    await waitFor(() => expect(pickedTrigger).toHaveFocus());
  });

  it("exposes dialog popup state on the trigger", async () => {
    const user = userEvent.setup();
    renderPager();

    const trigger = screen.getByTestId("history-pager-trigger");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
