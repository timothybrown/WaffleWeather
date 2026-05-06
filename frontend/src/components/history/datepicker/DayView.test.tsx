import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DayView from "./DayView";

function renderDayView(
  props: Partial<React.ComponentProps<typeof DayView>> = {},
) {
  const onTileClick = vi.fn();

  render(
    <DayView
      visibleYear={2026}
      visibleMonth={4}
      range="day"
      selectedAnchor={null}
      maxDate="2026-05-15"
      onTileClick={onTileClick}
      {...props}
    />,
  );

  return { onTileClick };
}

describe("DayView shared rendering", () => {
  it("renders the DayView root", () => {
    renderDayView();

    expect(screen.getByTestId("datepicker-day-view")).toBeInTheDocument();
  });

  it("renders weekday header Sun..Sat", () => {
    renderDayView();

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("renders 31 day buttons for May 2026", () => {
    renderDayView();

    const root = screen.getByTestId("datepicker-day-view");
    expect(within(root).getAllByRole("button")).toHaveLength(31);

    for (let d = 1; d <= 31; d += 1) {
      expect(screen.getByRole("button", { name: new RegExp(`^${d}$|^Selected, .* ${d},`) })).toBeInTheDocument();
    }
  });

  it("renders aria-hidden blank placeholders for May 2026 alignment", () => {
    renderDayView();

    const root = screen.getByTestId("datepicker-day-view");
    const blankPlaceholders = root.querySelectorAll('[aria-hidden="true"]');
    expect(blankPlaceholders).toHaveLength(11);

    const may1 = screen.getByRole("button", { name: "1" });
    const firstWeek = may1.parentElement;
    expect(firstWeek).not.toBeNull();
    expect(firstWeek?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
    expect(Array.from(firstWeek?.children ?? []).indexOf(may1)).toBe(5);
  });

  it("rings today (current day cell) via aria-current=date", () => {
    renderDayView();

    const today = screen.getByRole("button", { name: "15" });
    expect(today).toHaveAttribute("aria-current", "date");
  });
});

describe("DayView Day mode", () => {
  it("highlights the cell whose date === selectedAnchor", () => {
    renderDayView({ range: "day", selectedAnchor: "2026-05-10" });

    const cell = screen.getByRole("button", { name: /^Selected, May 10/ });
    expect(cell).toHaveAttribute("data-selected", "true");
  });

  it("uses the canonical short-month selected day aria-label", () => {
    renderDayView({
      range: "day",
      visibleMonth: 3,
      selectedAnchor: "2026-04-10",
    });

    expect(
      screen.getByRole("button", { name: "Selected, Apr 10, 2026" }),
    ).toHaveAttribute("data-selected", "true");
  });

  it("does not highlight any cell when selectedAnchor is in a different month", () => {
    renderDayView({ range: "day", selectedAnchor: "2026-04-10" });

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it("disables cells where date > maxDate per-cell", () => {
    renderDayView({ range: "day", maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: "16" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "31" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "15" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
  });

  it("emits { kind: 'day', date } on cell click", () => {
    const { onTileClick } = renderDayView({ range: "day" });

    fireEvent.click(screen.getByRole("button", { name: "12" }));

    expect(onTileClick).toHaveBeenCalledWith({ kind: "day", date: "2026-05-12" });
  });

  it("does not emit on disabled future cell click", () => {
    const { onTileClick } = renderDayView({ range: "day" });

    fireEvent.click(screen.getByRole("button", { name: "16" }));

    expect(onTileClick).not.toHaveBeenCalled();
  });
});

describe("DayView Week mode", () => {
  it("highlights the row containing selectedAnchor's week (row gets data-selected, no individual cell does)", () => {
    renderDayView({ range: "week", selectedAnchor: "2026-05-13" });

    const selectedRows = document.querySelectorAll('[data-testid="datepicker-week-row"][data-selected="true"]');
    expect(selectedRows).toHaveLength(1);

    const cells = document.querySelectorAll('button[data-selected="true"]');
    expect(cells).toHaveLength(0);
  });

  it("applies role=group and aria-label to the selected row", () => {
    renderDayView({ range: "week", selectedAnchor: "2026-05-13" });

    const row = document.querySelector('[data-testid="datepicker-week-row"][data-selected="true"]');
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("role", "group");
    expect(row).toHaveAttribute("aria-label", "Selected week, May 10–16, 2026");
  });

  it("emits { kind: 'week', weekStart } with the row's Sunday on cell click", () => {
    const { onTileClick } = renderDayView({ range: "week", selectedAnchor: "2026-05-13" });

    fireEvent.click(screen.getByRole("button", { name: "13" }));

    expect(onTileClick).toHaveBeenCalledWith({ kind: "week", weekStart: "2026-05-10" });
  });

  it("emits the row's Sunday when clicking a Saturday cell", () => {
    const { onTileClick } = renderDayView({ range: "week" });

    fireEvent.click(screen.getByRole("button", { name: "16" }));

    expect(onTileClick).toHaveBeenCalledWith({ kind: "week", weekStart: "2026-05-10" });
  });

  it("disables the entire row iff weekStart > maxDate (all 7 buttons in row carry disabled)", () => {
    renderDayView({ range: "week", maxDate: "2026-05-15" });

    const futureSunday = screen.getByRole("button", { name: "17" });
    expect(futureSunday).toBeDisabled();
    for (let d = 17; d <= 23; d += 1) {
      const button = screen.getByRole("button", { name: String(d) });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("enables the entire current-week row even when today is mid-week", () => {
    renderDayView({ range: "week", maxDate: "2026-05-15" });

    for (let d = 10; d <= 16; d += 1) {
      expect(screen.getByRole("button", { name: String(d) })).toBeEnabled();
    }
  });

  it("does not emit on click in a disabled future-week row", () => {
    const { onTileClick } = renderDayView({ range: "week", maxDate: "2026-05-15" });

    fireEvent.click(screen.getByRole("button", { name: "17" }));

    expect(onTileClick).not.toHaveBeenCalled();
  });

  it("renders no row as selected when selectedAnchor is null (live-mode entry)", () => {
    renderDayView({ range: "week", selectedAnchor: null });

    expect(document.querySelectorAll('[data-testid="datepicker-week-row"][data-selected="true"]')).toHaveLength(0);
  });

  it("applies row-preview styling on hover (week-row-preview class)", async () => {
    const user = userEvent.setup();
    renderDayView({ range: "week" });

    const cell = screen.getByRole("button", { name: "13" });
    await user.hover(cell);

    const row = cell.closest('[data-testid="datepicker-week-row"]');
    expect(row?.className).toContain("week-row-preview");

    fireEvent.mouseLeave(row as Element);

    expect(row?.className).not.toContain("week-row-preview");
  });

  it("applies row-preview styling on focus (keyboard parity with hover)", () => {
    renderDayView({ range: "week" });

    const cell = screen.getByRole("button", { name: "13" });
    fireEvent.focus(cell);

    const row = cell.closest('[data-testid="datepicker-week-row"]');
    expect(row?.className).toContain("week-row-preview");

    fireEvent.blur(cell);

    expect(row?.className).not.toContain("week-row-preview");
  });

  it("moves row-preview styling from hovered row to focused row", async () => {
    const user = userEvent.setup();
    renderDayView({ range: "week", maxDate: "2026-05-31" });

    const hoveredCell = screen.getByRole("button", { name: "13" });
    await user.hover(hoveredCell);
    const hoveredRow = hoveredCell.closest('[data-testid="datepicker-week-row"]');
    expect(hoveredRow?.className).toContain("week-row-preview");

    const focusedCell = screen.getByRole("button", { name: "24" });
    fireEvent.focus(focusedCell);
    const focusedRow = focusedCell.closest('[data-testid="datepicker-week-row"]');

    expect(focusedRow?.className).toContain("week-row-preview");
    expect(hoveredRow?.className).not.toContain("week-row-preview");
  });
});
