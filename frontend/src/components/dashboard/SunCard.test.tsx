import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import SunCard from "./SunCard";

// SunCalc 2 is ESM with named exports (no default), and reports angles in
// degrees rather than radians.
vi.mock("suncalc", () => ({
  getTimes: () => ({
    sunrise: new Date("2026-04-05T06:30:00"),
    sunset: new Date("2026-04-05T18:15:00"),
    solarNoon: new Date("2026-04-05T12:22:00"),
    goldenHour: new Date("2026-04-05T17:30:00"),
  }),
  getPosition: () => ({
    altitude: 45,
  }),
}));

vi.mock("@/generated/stations/stations", () => ({
  useListStations: () => ({
    data: {
      data: [
        { id: "test", name: "Test Station", latitude: -33.87, longitude: 151.21 },
      ],
    },
  }),
}));

describe("SunCard", () => {
  it("renders 'Solar' title", () => {
    renderWithProviders(<SunCard data={null} solarTrend={null} uvTrend={null} />);
    expect(screen.getByText("Solar")).toBeInTheDocument();
  });

  it("renders day length", () => {
    renderWithProviders(<SunCard data={null} solarTrend={null} uvTrend={null} />);
    expect(screen.getByText("Day length")).toBeInTheDocument();
  });

  it("renders solar noon label", () => {
    renderWithProviders(<SunCard data={null} solarTrend={null} uvTrend={null} />);
    expect(screen.getByText(/Solar noon/)).toBeInTheDocument();
  });

  it("renders sun arc SVG", () => {
    const { container } = renderWithProviders(
      <SunCard data={null} solarTrend={null} uvTrend={null} />,
    );
    const svg = container.querySelector('svg[aria-label="Sun arc showing current sun position"]');
    expect(svg).toBeInTheDocument();
  });

  it("renders altitude", () => {
    renderWithProviders(<SunCard data={null} solarTrend={null} uvTrend={null} />);
    expect(screen.getByText("Altitude")).toBeInTheDocument();
    expect(screen.getByText("45°")).toBeInTheDocument();
  });

  it("renders golden hour label", () => {
    renderWithProviders(<SunCard data={null} solarTrend={null} uvTrend={null} />);
    expect(screen.getByText(/Golden hour/)).toBeInTheDocument();
  });

  it("renders solar radiation value", () => {
    renderWithProviders(
      <SunCard data={makeObservation({ solar_radiation: 847 })} solarTrend="up" uvTrend={null} />,
    );
    expect(screen.getByText("Solar Radiation")).toBeInTheDocument();
    expect(screen.getByText("847")).toBeInTheDocument();
  });

  it("renders UV index with category label", () => {
    renderWithProviders(
      <SunCard data={makeObservation({ uv_index: 6.2 })} solarTrend={null} uvTrend="up" />,
    );
    expect(screen.getByText(/UV Index/)).toBeInTheDocument();
    expect(screen.getByText("6.2")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders UV 'Low' for index < 3", () => {
    renderWithProviders(
      <SunCard data={makeObservation({ uv_index: 1.5 })} solarTrend={null} uvTrend={null} />,
    );
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders UV 'Extreme' for index >= 11", () => {
    renderWithProviders(
      <SunCard data={makeObservation({ uv_index: 12.0 })} solarTrend={null} uvTrend={null} />,
    );
    expect(screen.getByText("Extreme")).toBeInTheDocument();
  });

  it("computes dynamic glow radius from solar irradiance", () => {
    const { container } = renderWithProviders(
      <SunCard data={makeObservation({ solar_radiation: 1000 })} solarTrend={null} uvTrend={null} />,
    );
    const glowCircle = container.querySelector('[data-testid="sun-glow"]');
    expect(glowCircle).toBeInTheDocument();
    expect(glowCircle?.getAttribute("r")).toBe("24");
  });

  it("uses minimum glow radius at 0 solar radiation", () => {
    const { container } = renderWithProviders(
      <SunCard data={makeObservation({ solar_radiation: 0 })} solarTrend={null} uvTrend={null} />,
    );
    const glowCircle = container.querySelector('[data-testid="sun-glow"]');
    expect(glowCircle?.getAttribute("r")).toBe("6");
  });
});
