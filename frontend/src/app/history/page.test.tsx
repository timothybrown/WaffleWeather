import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";

const upChartCalls: { props: { seriesVisibility?: boolean[] } }[] = [];
const historyDataState = vi.hoisted(() => ({
  resolution: "hourly" as "raw" | "hourly",
}));

vi.mock("@/hooks/useHistoryData", () => ({
  useHistoryData: () => ({
    data: [
      {
        time: 1700000000,
        temp_avg: 70, temp_min: 60, temp_max: 80,
        humidity_avg: 50,
        pressure_avg: 1013,
        wind_avg: 5, wind_gust_max: 10,
        rain_max: 0,
        solar_avg: 100, uv_max: 3,
      },
    ],
    isLoading: false,
    resolution: historyDataState.resolution,
  }),
}));

vi.mock("@/hooks/useResolvedColors", () => ({
  useResolvedColors: () => ({
    "--color-border": "#ccc",
    "--color-text-faint": "#888",
    "--color-surface-alt": "#eee",
    "--color-primary": "#222",
    "--color-warning": "#f60",
  }),
}));

vi.mock("@/components/charts/UPlotChart", () => ({
  default: (props: { seriesVisibility?: boolean[] }) => {
    upChartCalls.push({ props });
    return (
      <div
        data-testid="uplot-chart"
        data-vis={props.seriesVisibility?.join(",") ?? ""}
      />
    );
  },
}));

vi.mock("@/components/history/CalendarHeatmap", () => ({
  default: () => null,
}));

import HistoryPage from "./page";

describe("HistoryPage chart legends wiring", () => {
  beforeEach(() => {
    upChartCalls.length = 0;
    historyDataState.resolution = "hourly";
  });

  it("renders six chart panels with chip rows", () => {
    renderWithProviders(<HistoryPage />);
    expect(screen.getAllByTestId("uplot-chart")).toHaveLength(6);
    // Total chips: Temp(3) + Hum(1) + Pres(1) + Wind(2) + Rain(1) + SolarUV(2) = 10
    expect(screen.getAllByTestId("legend-chip")).toHaveLength(10);
  });

  it("marks 7 chips as interactive (multi-series) and 3 as decorative (single-series)", () => {
    renderWithProviders(<HistoryPage />);
    const chips = screen.getAllByTestId("legend-chip");
    const interactive = chips.filter(
      (c) => c.getAttribute("data-interactive") === "true",
    );
    const decorative = chips.filter(
      (c) => c.getAttribute("data-interactive") === "false",
    );
    expect(interactive).toHaveLength(7); // Temp(3) + Wind(2) + SolarUV(2)
    expect(decorative).toHaveLength(3); // Hum + Pres + Rain
  });

  it("toggling Wind Gust chip propagates new visibility to that chart", () => {
    renderWithProviders(<HistoryPage />);

    // Identify the Wind UPlotChart's initial visibility state
    const initialWindCall = upChartCalls.find(
      (c) =>
        c.props.seriesVisibility?.length === 2 &&
        c.props.seriesVisibility[0] === true &&
        c.props.seriesVisibility[1] === true,
    );
    expect(initialWindCall).toBeDefined();

    upChartCalls.length = 0;

    const gustChip = screen
      .getByText("Gust")
      .closest("[data-testid='legend-chip']");
    expect(gustChip).not.toBeNull();
    fireEvent.click(gustChip!);

    // After click, the Wind UPlotChart should re-render with [true, false]
    const afterToggle = upChartCalls.find(
      (c) =>
        c.props.seriesVisibility?.length === 2 &&
        c.props.seriesVisibility[0] === true &&
        c.props.seriesVisibility[1] === false,
    );
    expect(afterToggle).toBeDefined();
  });

  it("renders raw 24h Temperature as an Avg-only decorative legend", () => {
    historyDataState.resolution = "raw";

    renderWithProviders(<HistoryPage />);

    expect(screen.queryByText("Max")).toBeNull();
    expect(screen.getByText("Avg")).toBeInTheDocument();
    expect(screen.queryByText("Min")).toBeNull();
    expect(screen.getAllByTestId("legend-chip")).toHaveLength(8);

    const avgChip = screen
      .getByText("Avg")
      .closest("[data-testid='legend-chip']");
    expect(avgChip?.getAttribute("data-interactive")).toBe("false");

    expect(upChartCalls[0]?.props.seriesVisibility).toEqual([false, true, false]);
  });

  it("does not let a multi-series legend hide the final visible series", () => {
    renderWithProviders(<HistoryPage />);

    const speedChip = screen
      .getByText("Speed")
      .closest("[data-testid='legend-chip']");
    const gustChip = screen
      .getByText("Gust")
      .closest("[data-testid='legend-chip']");

    expect(speedChip).not.toBeNull();
    expect(gustChip).not.toBeNull();

    fireEvent.click(speedChip!);
    expect(speedChip?.getAttribute("data-visible")).toBe("false");
    expect(gustChip?.getAttribute("data-visible")).toBe("true");

    fireEvent.click(gustChip!);
    expect(speedChip?.getAttribute("data-visible")).toBe("false");
    expect(gustChip?.getAttribute("data-visible")).toBe("true");
    expect(
      upChartCalls.some((c) =>
        c.props.seriesVisibility?.length === 2 &&
        c.props.seriesVisibility[0] === false &&
        c.props.seriesVisibility[1] === false,
      ),
    ).toBe(false);
  });

  it("renders the Solar/UV title with Unicode ² (not the literal &sup2;)", () => {
    renderWithProviders(<HistoryPage />);
    expect(screen.getByText(/Solar \(W\/m²\) & UV Index/)).toBeInTheDocument();
    expect(screen.queryByText(/sup2/)).toBeNull();
  });
});
