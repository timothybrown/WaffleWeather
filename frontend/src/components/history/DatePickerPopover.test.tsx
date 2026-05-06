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
      range="day"
      maxDate="2026-05-15"
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );

  return { onSelect, onClose };
}

describe("DatePickerPopover entry views", () => {
  it("opens day range to the selectedDate month", () => {
    renderPopover({ range: "day", selectedDate: "2026-04-10" });

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();
    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Selected, Apr 10, 2026$/ }),
    ).toHaveAttribute("data-selected", "true");
  });

  it("opens day range to the maxDate month when selectedDate is missing", () => {
    renderPopover({ range: "day" });

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();
    expect(screen.getByText("May 2026")).toBeInTheDocument();
  });

  it("opens week range to day-view row mode with the selected cross-range week", () => {
    renderPopover({ range: "week", selectedDate: "2026-04-15" });

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();
    const row = screen.getByRole("group", {
      name: /Selected week, Apr(?:il)? 12.+18, 2026/,
    });
    expect(row).toHaveAttribute("data-selected", "true");
    expect(
      document.querySelectorAll('button[data-selected="true"]'),
    ).toHaveLength(0);
  });

  it("opens month range to month-view with the anchor year and selected April tile", () => {
    renderPopover({ range: "month", selectedDate: "2026-04-15" });

    expect(screen.getByTestId("datepicker-month-view")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Selected, April 2026$/ }),
    ).toHaveAttribute("data-selected", "true");
  });

  it("opens year range to year-view with the anchor page and selected year tile", () => {
    renderPopover({ range: "year", selectedDate: "2026-04-15" });

    expect(screen.getByTestId("datepicker-year-view")).toBeInTheDocument();
    expect(screen.getByText(/2020\s.+\s2031/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Selected, 2026$/ }),
    ).toHaveAttribute("data-selected", "true");
  });
});

describe("DatePickerPopover mounted prop changes", () => {
  it("resets to the entry view when range changes while mounted", async () => {
    const user = userEvent.setup();

    function MutableRangePopover() {
      const [range, setRange] =
        React.useState<React.ComponentProps<typeof DatePickerPopover>["range"]>(
          "day",
        );

      return (
        <>
          <button type="button" onClick={() => setRange("month")}>
            Switch to month
          </button>
          <button type="button" onClick={() => setRange("year")}>
            Switch to year
          </button>
          <DatePickerPopover
            range={range}
            selectedDate="2026-04-15"
            maxDate="2026-05-15"
            onSelect={vi.fn()}
            onClose={vi.fn()}
          />
        </>
      );
    }

    render(<MutableRangePopover />);

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to month" }));

    expect(screen.getByTestId("datepicker-month-view")).toBeInTheDocument();
    expect(screen.queryByTestId("datepicker-day-view")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to year" }));

    expect(screen.getByTestId("datepicker-year-view")).toBeInTheDocument();
    expect(screen.queryByTestId("datepicker-month-view")).not.toBeInTheDocument();
  });

  it("resets visible coordinates when the selected anchor changes while mounted", async () => {
    const user = userEvent.setup();

    function MutableAnchorPopover() {
      const [selectedDate, setSelectedDate] = React.useState("2026-04-15");

      return (
        <>
          <button
            type="button"
            onClick={() => setSelectedDate("2025-03-20")}
          >
            Switch anchor
          </button>
          <DatePickerPopover
            range="month"
            selectedDate={selectedDate}
            maxDate="2026-05-15"
            onSelect={vi.fn()}
            onClose={vi.fn()}
          />
        </>
      );
    }

    render(<MutableAnchorPopover />);

    expect(
      screen.getByRole("button", { name: /^Selected, April 2026$/ }),
    ).toHaveAttribute("data-selected", "true");

    await user.click(screen.getByRole("button", { name: "Switch anchor" }));

    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Selected, March 2025$/ }),
    ).toHaveAttribute("data-selected", "true");
  });
});

describe("DatePickerPopover year page math", () => {
  it("maps 2026 to the 2020 through 2031 page", () => {
    renderPopover({ range: "year", selectedDate: "2026-01-01" });

    expect(screen.getByText(/2020\s.+\s2031/)).toBeInTheDocument();
  });

  it("maps 2018 to the 2008 through 2019 page", () => {
    renderPopover({ range: "year", selectedDate: "2018-01-01" });

    expect(screen.getByText(/2008\s.+\s2019/)).toBeInTheDocument();
  });

  it("maps 2032 to the 2032 through 2043 boundary page", () => {
    renderPopover({
      range: "year",
      selectedDate: "2032-01-01",
      maxDate: "2045-05-15",
    });

    expect(screen.getByText(/2032\s.+\s2043/)).toBeInTheDocument();
  });
});

describe("DatePickerPopover cross-range highlight preservation", () => {
  it("highlights the selected week row for a mid-week anchor", () => {
    renderPopover({ range: "week", selectedDate: "2026-04-15" });

    expect(
      screen.getByRole("group", {
        name: /Selected week, Apr(?:il)? 12.+18, 2026/,
      }),
    ).toHaveAttribute("data-selected", "true");
  });

  it("highlights the selected month tile for a mid-month anchor", () => {
    renderPopover({ range: "month", selectedDate: "2026-04-15" });

    expect(
      screen.getByRole("button", { name: /^Selected, April 2026$/ }),
    ).toHaveAttribute("data-selected", "true");
  });

  it("highlights the selected year tile for a mid-year anchor", () => {
    renderPopover({ range: "year", selectedDate: "2026-04-15" });

    expect(
      screen.getByRole("button", { name: /^Selected, 2026$/ }),
    ).toHaveAttribute("data-selected", "true");
  });
});

describe("DatePickerPopover drill-up navigation", () => {
  it("moves from day-view to month-view through Choose month", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "day", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose month" }));

    expect(screen.getByTestId("datepicker-month-view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose year" })).toBeInTheDocument();
  });

  it("moves from month-view to year-view through Choose year", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "month", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose year" }));

    expect(screen.getByTestId("datepicker-year-view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose year" })).not.toBeInTheDocument();
  });

  it("does not render a drill-up button in year-view", () => {
    renderPopover({ range: "year", selectedDate: "2026-04-15" });

    expect(screen.queryByRole("button", { name: "Choose month" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose year" })).not.toBeInTheDocument();
  });
});

describe("DatePickerPopover drill-down and commit behavior", () => {
  it("drills from year-view to month-view for the clicked year in day mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "day",
      selectedDate: "2026-04-15",
    });

    await user.click(screen.getByRole("button", { name: "Choose month" }));
    await user.click(screen.getByRole("button", { name: "Choose year" }));
    await user.click(screen.getByRole("button", { name: "2024" }));

    expect(screen.getByTestId("datepicker-month-view")).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("drills from month-view to day-view for the clicked month in day mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "day",
      selectedDate: "2026-04-15",
    });

    await user.click(screen.getByRole("button", { name: "Choose month" }));
    await user.click(screen.getByRole("button", { name: /^March 2026$/ }));

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("commits the clicked day and closes in day mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "day",
      selectedDate: "2026-04-10",
    });

    await user.click(screen.getByRole("button", { name: "12" }));

    expect(onSelect).toHaveBeenCalledWith("2026-04-12");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("commits the containing Sunday and closes in week mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "week",
      selectedDate: "2026-04-15",
    });

    await user.click(screen.getByRole("button", { name: "15" }));

    expect(onSelect).toHaveBeenCalledWith("2026-04-12");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("commits the first of the clicked month and closes in month mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "month",
      selectedDate: "2026-04-15",
    });

    await user.click(screen.getByRole("button", { name: /^Selected, April 2026$/ }));

    expect(onSelect).toHaveBeenCalledWith("2026-04-01");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("commits January 1 for the clicked year and closes in year mode", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPopover({
      range: "year",
      selectedDate: "2026-04-15",
    });

    await user.click(screen.getByRole("button", { name: "2024" }));

    expect(onSelect).toHaveBeenCalledWith("2024-01-01");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DatePickerPopover wrapper behavior", () => {
  it("renders the labelled dialog root with the preserved test id and width class", () => {
    renderPopover();

    const dialog = screen.getByTestId("history-popover");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-label", "Pick a date");
    expect(dialog.className).toContain("w-[min(18rem,calc(100vw-1.5rem))]");
  });

  it("does not render the Today footer button", () => {
    renderPopover();

    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
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

    fireEvent.mouseDown(screen.getByTestId("history-popover"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when mousedown starts inside triggerRef", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();

    render(
      <>
        <button ref={triggerRef}>Open date picker</button>
        <DatePickerPopover
          range="day"
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
});

describe("DatePickerPopover focus management", () => {
  it("focuses Choose year after drilling up from day-view to month-view", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "day", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose month" }));

    expect(screen.getByRole("button", { name: "Choose year" })).toHaveFocus();
  });

  it("focuses the first enabled year tile after drilling up from month-view to year-view", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "month", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose year" }));

    expect(screen.getByRole("button", { name: "2020" })).toHaveFocus();
  });

  it("focuses the first enabled month tile after drilling down from year-view in day mode", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "day", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose month" }));
    await user.click(screen.getByRole("button", { name: "Choose year" }));
    await user.click(screen.getByRole("button", { name: "2024" }));

    expect(screen.getByRole("button", { name: /^January 2024$/ })).toHaveFocus();
  });

  it("focuses the first enabled day cell after drilling down from month-view in day mode", async () => {
    const user = userEvent.setup();
    renderPopover({ range: "day", selectedDate: "2026-04-15" });

    await user.click(screen.getByRole("button", { name: "Choose month" }));
    await user.click(screen.getByRole("button", { name: /^March 2026$/ }));

    expect(screen.getByRole("button", { name: "1" })).toHaveFocus();
  });
});
