import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import YearView from "./YearView";

function renderYearView(
  props: Partial<React.ComponentProps<typeof YearView>> = {},
) {
  const onTileClick = vi.fn();

  render(
    <YearView
      pageStartYear={2020}
      selectedAnchor={null}
      maxDate="2026-05-15"
      onTileClick={onTileClick}
      {...props}
    />,
  );

  return { onTileClick };
}

describe("YearView", () => {
  it("renders 12 year tiles for pageStartYear..pageStartYear+11", () => {
    renderYearView({ pageStartYear: 2020 });

    for (let y = 2020; y <= 2031; y += 1) {
      expect(screen.getByRole("button", { name: new RegExp(`^${y}`) })).toBeInTheDocument();
    }
  });

  it("highlights the tile matching the selectedAnchor's year", () => {
    renderYearView({ pageStartYear: 2020, selectedAnchor: "2024-04-15" });

    const tile = screen.getByRole("button", { name: /^Selected, 2024/ });
    expect(tile).toHaveAttribute("data-selected", "true");
  });

  it("does not highlight any tile when selectedAnchor is null", () => {
    renderYearView({ pageStartYear: 2020, selectedAnchor: null });

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it("does not highlight tiles when selectedAnchor's year is outside the visible page", () => {
    renderYearView({ pageStartYear: 2020, selectedAnchor: "2018-01-01" });

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it("disables tiles whose Jan 1 is after maxDate", () => {
    renderYearView({ pageStartYear: 2020, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: "2027" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2027" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "2031" })).toBeDisabled();
  });

  it("enables the current year tile (Jan 1 not after maxDate)", () => {
    renderYearView({ pageStartYear: 2020, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^2026/ })).toBeEnabled();
  });

  it("rings the current year tile via aria-current=true", () => {
    renderYearView({ pageStartYear: 2020, maxDate: "2026-05-15" });

    const currentYear = screen.getByRole("button", { name: /^2026/ });
    expect(currentYear).toHaveAttribute("aria-current", "true");
  });

  it("does not set aria-current on non-current year tiles", () => {
    renderYearView({ pageStartYear: 2020, maxDate: "2026-05-15" });

    expect(screen.getByRole("button", { name: /^2024/ })).not.toHaveAttribute("aria-current");
  });

  it("emits { year } on tile click", () => {
    const { onTileClick } = renderYearView({ pageStartYear: 2020 });

    fireEvent.click(screen.getByRole("button", { name: /^2024/ }));

    expect(onTileClick).toHaveBeenCalledWith({ year: 2024 });
  });

  it("does not emit on disabled tile click", () => {
    const { onTileClick } = renderYearView({ pageStartYear: 2020, maxDate: "2026-05-15" });

    fireEvent.click(screen.getByRole("button", { name: "2027" }));

    expect(onTileClick).not.toHaveBeenCalled();
  });
});
