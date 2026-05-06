import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MonthView from "./MonthView";

function renderMonthView(
  props: Partial<React.ComponentProps<typeof MonthView>> = {},
) {
  const onTileClick = vi.fn();

  render(
    <MonthView
      visibleYear={2026}
      selectedAnchor={null}
      maxDate="2026-05-15"
      onTileClick={onTileClick}
      {...props}
    />,
  );

  return { onTileClick };
}

describe("MonthView", () => {
  it("renders 12 month tiles labeled Jan..Dec", () => {
    renderMonthView();

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    labels.forEach((label) => {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    });
  });

  it("highlights the tile matching the selectedAnchor's year+month", () => {
    renderMonthView({ visibleYear: 2026, selectedAnchor: "2026-04-15" });

    const tile = screen.getByRole("button", { name: /^Selected, Apr/ });
    expect(tile).toHaveAttribute("data-selected", "true");
  });

  it("does not highlight any tile when selectedAnchor's year != visibleYear", () => {
    renderMonthView({ visibleYear: 2025, selectedAnchor: "2026-04-15" });

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it("does not highlight when selectedAnchor is null", () => {
    renderMonthView({ visibleYear: 2026, selectedAnchor: null });

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it("disables tiles whose first-of-month is after maxDate (same year)", () => {
    renderMonthView({ visibleYear: 2026, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^June/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^December/ })).toBeDisabled();
  });

  it("enables the current month tile (today is in May 2026)", () => {
    renderMonthView({ visibleYear: 2026, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^May/ })).toBeEnabled();
  });

  it("disables all tiles when visibleYear is entirely after maxDate", () => {
    renderMonthView({ visibleYear: 2027, maxDate: "2026-05-15" });

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    labels.forEach((label) => {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeDisabled();
    });
  });

  it("rings the current-month tile via aria-current=true", () => {
    renderMonthView({ visibleYear: 2026, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^May/ })).toHaveAttribute("aria-current", "true");
  });

  it("does not ring non-current-month tiles", () => {
    renderMonthView({ visibleYear: 2026, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^Apr/ })).not.toHaveAttribute("aria-current");
  });

  it("emits { year, monthIndex } on tile click", () => {
    const { onTileClick } = renderMonthView({ visibleYear: 2026 });

    fireEvent.click(screen.getByRole("button", { name: /^Apr/ }));

    expect(onTileClick).toHaveBeenCalledWith({ year: 2026, monthIndex: 3 });
  });

  it("does not emit on disabled tile click", () => {
    const { onTileClick } = renderMonthView({ visibleYear: 2026, maxDate: "2026-05-15" });

    fireEvent.click(screen.getByRole("button", { name: /^June/ }));

    expect(onTileClick).not.toHaveBeenCalled();
  });
});
