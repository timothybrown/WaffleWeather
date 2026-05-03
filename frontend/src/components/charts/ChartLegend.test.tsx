import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChartLegend from "./ChartLegend";

const series = [
  { label: "Speed", color: "#6aae7a" },
  { label: "Gust", color: "#dba060", dashed: true },
];

describe("ChartLegend", () => {
  it("renders one chip per series with correct labels", () => {
    render(
      <ChartLegend
        series={series}
        visibility={[true, true]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Gust")).toBeInTheDocument();
  });

  it("renders a swatch matching each series color", () => {
    const { container } = render(
      <ChartLegend
        series={series}
        visibility={[true, true]}
        onToggle={vi.fn()}
      />,
    );
    const swatches = container.querySelectorAll("[data-testid='legend-swatch']");
    expect(swatches).toHaveLength(2);
    // happy-dom keeps inline hex; browsers normalize to rgb() — both are valid CSS.
    expect((swatches[0] as HTMLElement).style.background).toContain("#6aae7a");
  });

  it("uses a dashed swatch variant when series.dashed is true", () => {
    const { container } = render(
      <ChartLegend
        series={series}
        visibility={[true, true]}
        onToggle={vi.fn()}
      />,
    );
    const swatches = container.querySelectorAll("[data-testid='legend-swatch']");
    expect(swatches[0]?.getAttribute("data-dashed")).toBe("false");
    expect(swatches[1]?.getAttribute("data-dashed")).toBe("true");
  });

  it("applies 'off' visual state when visibility is false", () => {
    render(
      <ChartLegend
        series={series}
        visibility={[true, false]}
        onToggle={vi.fn()}
      />,
    );
    const speedChip = screen.getByText("Speed").closest("[data-testid='legend-chip']");
    const gustChip = screen.getByText("Gust").closest("[data-testid='legend-chip']");
    expect(speedChip?.getAttribute("data-visible")).toBe("true");
    expect(gustChip?.getAttribute("data-visible")).toBe("false");
  });

  it("calls onToggle(idx) when a chip is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ChartLegend series={series} visibility={[true, true]} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByText("Gust"));
    expect(onToggle).toHaveBeenCalledWith(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT register click behavior when onToggle is omitted", () => {
    const { container } = render(
      <ChartLegend series={series.slice(0, 1)} visibility={[true]} />,
    );
    const chip = container.querySelector("[data-testid='legend-chip']");
    expect(chip?.getAttribute("data-interactive")).toBe("false");
    // No throw on click; nothing happens
    fireEvent.click(chip!);
  });

  it("marks chips as interactive when onToggle is provided", () => {
    const { container } = render(
      <ChartLegend series={series} visibility={[true, true]} onToggle={vi.fn()} />,
    );
    const chip = container.querySelector("[data-testid='legend-chip']");
    expect(chip?.getAttribute("data-interactive")).toBe("true");
  });
});
