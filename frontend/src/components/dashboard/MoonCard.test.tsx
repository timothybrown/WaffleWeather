import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import MoonCard from "./MoonCard";

// Mock SunCalc
vi.mock("suncalc", () => ({
  default: {
    getMoonIllumination: () => ({
      phase: 0.5, // Full Moon
      fraction: 0.98,
    }),
    getMoonTimes: () => ({
      rise: new Date("2026-04-05T19:00:00"),
      set: new Date("2026-04-06T06:00:00"),
    }),
  },
}));

// Mock stations API
vi.mock("@/generated/stations/stations", () => ({
  useListStations: () => ({
    data: {
      data: [
        { id: "test", name: "Test Station", latitude: -33.87, longitude: 151.21 },
      ],
    },
  }),
}));

describe("MoonCard", () => {
  it("renders moon phase name", () => {
    renderWithProviders(<MoonCard />);
    expect(screen.getAllByText("Full Moon").length).toBeGreaterThanOrEqual(1);
  });

  it("renders illumination percentage", () => {
    renderWithProviders(<MoonCard />);
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("renders moonrise/moonset labels", () => {
    renderWithProviders(<MoonCard />);
    expect(screen.getByText("Moonrise")).toBeInTheDocument();
    expect(screen.getByText("Moonset")).toBeInTheDocument();
  });

  it("renders phase SVG", () => {
    const { container } = renderWithProviders(<MoonCard />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders next full/new moon labels", () => {
    renderWithProviders(<MoonCard />);
    // "Full Moon" appears both as phase name and as a label in the detail grid
    expect(screen.getAllByText("Full Moon").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("New Moon")).toBeInTheDocument();
  });

  it("renders the Lunar card title", () => {
    renderWithProviders(<MoonCard />);
    expect(screen.getByText("Lunar")).toBeInTheDocument();
  });
});
