import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Sparkline from "./Sparkline";

describe("Sparkline", () => {
  it("renders nothing for empty data", () => {
    const { container } = render(<Sparkline data={[]} color="red" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for all-null data", () => {
    const { container } = render(
      <Sparkline data={[null, null, null]} color="red" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for single non-null value", () => {
    const { container } = render(
      <Sparkline data={[null, 5, null]} color="red" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders SVG with path for valid data", () => {
    const data = [10, 12, 15, 13, 11, 14, 16, 18, 17, 15, 12, 10,
                  11, 13, 16, 19, 22, 21, 18, 15, 13, 12, 11, 10];
    const { container } = render(<Sparkline data={data} color="red" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("path")).not.toBeNull();
  });

  it("applies color to stroke and gradient", () => {
    const data = [10, 15, 20, 15, 10];
    const { container } = render(
      <Sparkline data={data} color="var(--color-danger)" />,
    );
    const path = container.querySelector("path[stroke]");
    expect(path?.getAttribute("stroke")).toBe("var(--color-danger)");
  });

  it("includes accessible role and label", () => {
    const data = [10, 15, 20, 15, 10];
    const { container } = render(
      <Sparkline data={data} color="red" label="Temperature trend" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Temperature trend");
  });

  it("bridges null gaps in data", () => {
    const data = [10, 15, null, null, 20, 25];
    const { container } = render(<Sparkline data={data} color="red" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("respects custom height", () => {
    const data = [10, 15, 20, 15, 10];
    const { container } = render(
      <Sparkline data={data} color="red" height={48} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toContain("48");
  });
});
