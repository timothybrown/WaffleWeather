import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import WindRoseChart from "./WindRoseChart";
import type { WindRoseDataPoint } from "@/generated/models";

const sampleData: WindRoseDataPoint[] = [
  { direction: 0, speed_range: "0-5", count: 10 },
  { direction: 0, speed_range: "5-15", count: 5 },
  { direction: 90, speed_range: "0-5", count: 8 },
  { direction: 180, speed_range: "15-25", count: 3 },
  { direction: 270, speed_range: "5-15", count: 6 },
];

describe("WindRoseChart", () => {
  it("renders SVG element", () => {
    const { container } = render(<WindRoseChart data={sampleData} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders direction labels", () => {
    const { container } = render(<WindRoseChart data={sampleData} />);
    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("N");
    expect(labels).toContain("E");
    expect(labels).toContain("S");
    expect(labels).toContain("W");
  });

  it("renders wedge paths for data", () => {
    const { container } = render(<WindRoseChart data={sampleData} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("handles empty data", () => {
    const { container } = render(<WindRoseChart data={[]} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    // No wedge paths
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(0);
  });

  it("renders concentric ring circles", () => {
    const { container } = render(<WindRoseChart data={sampleData} />);
    const circles = container.querySelectorAll("circle");
    // 4 concentric rings + 1 center dot = 5
    expect(circles.length).toBe(5);
  });

  it("fires onSelect with wedge payload on mouse enter", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WindRoseChart data={sampleData} onSelect={onSelect} />,
    );
    const wedge = container.querySelector('[data-testid="wind-rose-wedge-0-0-5"]');
    expect(wedge).not.toBeNull();
    fireEvent.mouseEnter(wedge!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
      direction: 0,
      band: "0-5",
      count: 10,
    });
  });

  it("fires onSelect with wedge payload on click (touch path)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WindRoseChart data={sampleData} onSelect={onSelect} />,
    );
    const wedge = container.querySelector('[data-testid="wind-rose-wedge-90-0-5"]');
    expect(wedge).not.toBeNull();
    fireEvent.click(wedge!);
    expect(onSelect).toHaveBeenCalledWith({
      direction: 90,
      band: "0-5",
      count: 8,
    });
  });
});
