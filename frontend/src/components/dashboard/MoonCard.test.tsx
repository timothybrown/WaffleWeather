import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import MoonCard from "./MoonCard";

// Pin the phase so the labels are predictable; rise/set times stay real.
// SunCalc v2 is ESM with named exports (no default).
vi.mock("suncalc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("suncalc")>()),
  getMoonIllumination: () => ({
    phase: 0.5, // Full Moon
    fraction: 0.98,
    waxing: false,
  }),
}));

// Mock stations API
vi.mock("@/generated/stations/stations", () => ({
  useListStations: () => ({
    data: {
      data: [
        { id: "test", name: "Test Station", latitude: 39.125, longitude: -77.72 },
      ],
    },
  }),
}));

// Minutes between the time a card row shows and a reference "HH:MM".
function minutesOff(label: string, reference: string): number {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const shown = screen.getByText(label).nextElementSibling?.textContent ?? "";
  return Math.abs(toMinutes(shown) - toMinutes(reference));
}

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

  describe("moonrise/moonset day", () => {
    const savedTZ = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = "America/New_York";
      vi.useFakeTimers({ toFake: ["Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
      if (savedTZ === undefined) delete process.env.TZ;
      else process.env.TZ = savedTZ;
    });

    // USNO (aa.usno.navy.mil) for 39.125 N, 77.72 W on 2026-10-20 EDT:
    // moonset 01:22, moonrise 15:40. A window anchored on the previous day
    // shows that day's 15:13 moonrise and no moonset at all.
    it("shows today's local events in the evening", () => {
      vi.setSystemTime(new Date("2026-10-21T01:30:00Z")); // 21:30 EDT, Oct 20
      renderWithProviders(<MoonCard />);
      expect(minutesOff("Moonrise", "15:40")).toBeLessThanOrEqual(2);
      expect(minutesOff("Moonset", "01:22")).toBeLessThanOrEqual(2);
    });
  });
});
