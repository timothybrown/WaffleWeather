import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PopoverHeader from "./PopoverHeader";

function renderHeader(
  props: Partial<React.ComponentProps<typeof PopoverHeader>> = {},
) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onDrillUp = vi.fn();

  render(
    <PopoverHeader
      viewLevel="day"
      visibleYear={2026}
      visibleMonth={3}
      pageStartYear={2020}
      maxDate="2026-05-15"
      onPrev={onPrev}
      onNext={onNext}
      onDrillUp={onDrillUp}
      {...props}
    />,
  );

  return { onPrev, onNext, onDrillUp };
}

describe("PopoverHeader labels", () => {
  it("renders 'April 2026' on day-view", () => {
    renderHeader({ viewLevel: "day", visibleYear: 2026, visibleMonth: 3 });
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("renders '2026' on month-view", () => {
    renderHeader({ viewLevel: "month", visibleYear: 2026 });
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("renders '2020 – 2031' on year-view", () => {
    renderHeader({ viewLevel: "year", pageStartYear: 2020 });
    expect(screen.getByText("2020 – 2031")).toBeInTheDocument();
  });
});

describe("PopoverHeader drill-up affordance", () => {
  it("renders drill-up label as a button on day-view with aria-label='Choose month'", () => {
    renderHeader({ viewLevel: "day" });
    const button = screen.getByRole("button", { name: "Choose month" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders drill-up label as a button on month-view with aria-label='Choose year'", () => {
    renderHeader({ viewLevel: "month" });
    const button = screen.getByRole("button", { name: "Choose year" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders drill-up label as a non-interactive span on year-view", () => {
    renderHeader({ viewLevel: "year", pageStartYear: 2020 });
    const node = screen.getByText("2020 – 2031");
    expect(node.tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: "Choose year" })).toBeNull();
  });

  it("calls onDrillUp when day-view drill-up button is clicked", () => {
    const { onDrillUp } = renderHeader({ viewLevel: "day" });
    fireEvent.click(screen.getByRole("button", { name: "Choose month" }));
    expect(onDrillUp).toHaveBeenCalledTimes(1);
  });

  it("calls onDrillUp when month-view drill-up button is clicked", () => {
    const { onDrillUp } = renderHeader({ viewLevel: "month" });
    fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
    expect(onDrillUp).toHaveBeenCalledTimes(1);
  });
});

describe("PopoverHeader chevron behavior", () => {
  it("calls onPrev when prev chevron is clicked", () => {
    const { onPrev } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when next chevron is clicked and not disabled", () => {
    const { onNext } = renderHeader({
      viewLevel: "day",
      visibleYear: 2026,
      visibleMonth: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disables next on day-view when next month's first day > maxDate", () => {
    renderHeader({
      viewLevel: "day",
      visibleYear: 2026,
      visibleMonth: 4,
      maxDate: "2026-05-15",
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables next on day-view when next month's first day <= maxDate", () => {
    renderHeader({
      viewLevel: "day",
      visibleYear: 2026,
      visibleMonth: 2,
      maxDate: "2026-05-15",
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables next on month-view when next year's Jan 1 > maxDate", () => {
    renderHeader({ viewLevel: "month", visibleYear: 2026, maxDate: "2026-05-15" });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables next on month-view when next year's Jan 1 <= maxDate", () => {
    renderHeader({ viewLevel: "month", visibleYear: 2025, maxDate: "2026-05-15" });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables next on year-view when pageStartYear+12 > year of maxDate", () => {
    renderHeader({ viewLevel: "year", pageStartYear: 2020, maxDate: "2026-05-15" });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables next on year-view when pageStartYear+12 <= year of maxDate", () => {
    renderHeader({ viewLevel: "year", pageStartYear: 2008, maxDate: "2026-05-15" });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("keeps prev chevron enabled regardless of view (unbounded back)", () => {
    renderHeader({ viewLevel: "day" });
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();

    renderHeader({ viewLevel: "month" });
    expect(screen.getAllByRole("button", { name: "Previous" })[1]).toBeEnabled();

    renderHeader({ viewLevel: "year", pageStartYear: 1000 });
    expect(screen.getAllByRole("button", { name: "Previous" })[2]).toBeEnabled();
  });
});
