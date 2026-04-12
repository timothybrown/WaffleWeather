import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import WindCompassRing from "./WindCompassRing";

describe("WindCompassRing", () => {
  it("renders SVG with tick marks", () => {
    const { container } = renderWithProviders(
      <WindCompassRing windDir={200} windSpeed={12} windGust={18} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const lines = svg!.querySelectorAll("line");
    expect(lines.length).toBe(72);
  });

  it("renders cardinal labels N, E, S, W", () => {
    renderWithProviders(
      <WindCompassRing windDir={200} windSpeed={12} windGust={null} />,
    );
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
  });

  it("renders arrow when direction and speed are provided", () => {
    const { container } = renderWithProviders(
      <WindCompassRing windDir={200} windSpeed={12} windGust={null} />,
    );
    expect(container.querySelector("polygon")).toBeInTheDocument();
  });

  it("hides arrow when direction is null", () => {
    const { container } = renderWithProviders(
      <WindCompassRing windDir={null} windSpeed={12} windGust={null} />,
    );
    expect(container.querySelector("polygon")).not.toBeInTheDocument();
  });

  it("hides arrow when speed is null", () => {
    const { container } = renderWithProviders(
      <WindCompassRing windDir={200} windSpeed={null} windGust={null} />,
    );
    expect(container.querySelector("polygon")).not.toBeInTheDocument();
  });

  it("renders canvas element for particle animation", () => {
    const { container } = renderWithProviders(
      <WindCompassRing windDir={200} windSpeed={12} windGust={null} />,
    );
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });
});
