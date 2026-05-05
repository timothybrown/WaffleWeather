import React, { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatePickerPopover from "./DatePickerPopover";

function renderPopover(
  props: Partial<React.ComponentProps<typeof DatePickerPopover>> = {},
) {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  render(
    <DatePickerPopover
      maxDate="2026-05-15"
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );

  return { onSelect, onClose };
}

describe("DatePickerPopover", () => {
  it("uses selectedDate month as the initial month when selectedDate is set", () => {
    renderPopover({ selectedDate: "2026-04-10" });

    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("uses maxDate month as the initial month when selectedDate is missing", () => {
    renderPopover();

    expect(screen.getByText("May 2026")).toBeInTheDocument();
  });

  it("disables future cells after maxDate", () => {
    renderPopover();

    const futureDay = screen.getByRole("button", { name: "16" });
    expect(futureDay).toBeDisabled();
    expect(futureDay).toHaveAttribute("aria-disabled", "true");
  });

  it("does not select or close when a disabled future cell is clicked", () => {
    const { onSelect, onClose } = renderPopover();

    fireEvent.click(screen.getByRole("button", { name: "16" }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps past cells enabled after navigating back many months", async () => {
    const user = userEvent.setup();
    renderPopover();

    const previousMonth = screen.getByRole("button", { name: "Previous month" });
    for (let i = 0; i < 18; i += 1) {
      await user.click(previousMonth);
    }

    expect(screen.getByText("November 2024")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
  });

  it("marks the selected anchor with valid button semantics", () => {
    renderPopover({ selectedDate: "2026-05-10" });

    const selectedDay = screen.getByRole("button", {
      name: "Selected, May 10, 2026",
    });
    expect(selectedDay).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(selectedDay).not.toHaveAttribute("aria-selected");
  });

  it("renders date cells as plain buttons without grid roles", () => {
    renderPopover({ selectedDate: "2026-05-10" });

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
  });

  it("rings the station today cell when it is not selected", () => {
    renderPopover({ selectedDate: "2026-05-10" });

    const stationToday = screen.getByRole("button", { name: "15" });
    expect(stationToday.className).toContain("ring-1");
    expect(stationToday.className).toContain("ring-primary/30");
    expect(stationToday).toHaveAttribute("aria-current", "date");
  });

  it("selects a day and closes once", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover();

    await user.click(screen.getByRole("button", { name: "12" }));

    expect(onSelect).toHaveBeenCalledWith("2026-05-12");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects maxDate and closes from the Today shortcut", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({ selectedDate: "2026-04-10" });

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(onSelect).toHaveBeenCalledWith("2026-05-15");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = renderPopover();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside mousedown", () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside touchstart", () => {
    const { onClose } = renderPopover();

    fireEvent.touchStart(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when mousedown starts inside the popover", () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Today" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when mousedown starts inside triggerRef", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();

    render(
      <>
        <button ref={triggerRef}>Open date picker</button>
        <DatePickerPopover
          maxDate="2026-05-15"
          onSelect={vi.fn()}
          onClose={onClose}
          triggerRef={triggerRef}
        />
      </>,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Open date picker" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables next month when the target month's first day is after maxDate", () => {
    renderPopover();

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("enables next month when the target month's first day is not after maxDate", () => {
    renderPopover({ selectedDate: "2026-04-10" });

    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });

  it("advances to next month when next month navigation is enabled", async () => {
    const user = userEvent.setup();
    renderPopover({ selectedDate: "2026-04-10" });

    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByText("May 2026")).toBeInTheDocument();
  });

  it("keeps previous month navigation unbounded", async () => {
    const user = userEvent.setup();
    renderPopover();

    const previousMonth = screen.getByRole("button", { name: "Previous month" });
    expect(previousMonth).toBeEnabled();

    for (let i = 0; i < 48; i += 1) {
      await user.click(previousMonth);
      expect(previousMonth).toBeEnabled();
    }

    expect(screen.getByText("May 2022")).toBeInTheDocument();
  });

  it("renders the root as a labelled dialog with the history-popover test id", () => {
    renderPopover();

    const dialog = screen.getByTestId("history-popover");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-label", "Pick a date");
  });
});
