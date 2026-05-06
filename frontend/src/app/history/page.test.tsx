import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import type { BucketMeta } from "@/lib/adaptive-bucket";

interface CapturedSeries {
  label?: string;
  fill?: unknown;
  stroke?: unknown;
  width?: number;
}
const upChartCalls: {
  props: {
    seriesVisibility?: boolean[];
    bucketMeta?: BucketMeta[];
    aggregationLabels?: string[];
    options?: { series?: CapturedSeries[] };
  };
}[] = [];
const historyDataState = vi.hoisted(() => ({
  resolution: "hourly" as "raw" | "hourly" | "daily" | "monthly",
  dataOverride: null as null | Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  error: null as unknown,
}));
const historyDataInputs = vi.hoisted(
  () => [] as Array<{
    range: string;
    mode: string;
    anchor?: string;
    timezone: string;
  }>,
);
const refetchSpy = vi.hoisted(() => vi.fn());
const navState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));
const stationTimezoneState = vi.hoisted(() => ({
  timezone: "UTC",
  isSettled: true,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navState.searchParams,
}));

vi.mock("@/hooks/useHistoryData", () => ({
  useHistoryData: (input: {
    range: string;
    mode: string;
    anchor?: string;
    timezone: string;
  }) => {
    historyDataInputs.push(input);
    return {
      data: historyDataState.dataOverride ?? [
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
      isLoading: historyDataState.isLoading,
      isError: historyDataState.isError,
      error: historyDataState.error,
      resolution: historyDataState.resolution,
      refetch: refetchSpy,
    };
  },
}));

vi.mock("@/hooks/useStationTimezone", () => ({
  useStationTimezone: () => stationTimezoneState.timezone,
  useStationTimezoneStatus: () => stationTimezoneState,
  getStationTodayString: (timezone: string) =>
    timezone === "Pacific/Kiritimati" ? "2026-04-28" : "2026-04-27",
  getStationTodayParts: (timezone: string) =>
    timezone === "Pacific/Kiritimati"
      ? {
          year: 2026,
          month: 4,
          day: 28,
          startIso: "2026-04-27T10:00:00.000Z",
        }
      : {
          year: 2026,
          month: 4,
          day: 27,
          startIso: "2026-04-27T00:00:00.000Z",
        },
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

vi.mock("@/hooks/useElementSize", () => ({
  useElementSize: () => ({ ref: () => {}, size: { width: 700, height: 200 } }),
}));

vi.mock("@/components/charts/UPlotChart", () => ({
  default: (props: {
    seriesVisibility?: boolean[];
    bucketMeta?: BucketMeta[];
    aggregationLabels?: string[];
    options?: { series?: CapturedSeries[] };
  }) => {
    upChartCalls.push({ props });
    return (
      <div
        data-testid="uplot-chart"
        data-vis={props.seriesVisibility?.join(",") ?? ""}
        data-bucketed={props.bucketMeta != null ? "true" : "false"}
        data-agg-labels={props.aggregationLabels?.join("|") ?? ""}
      />
    );
  },
}));

vi.mock("@/components/history/CalendarHeatmap", () => ({
  default: () => <div data-testid="calendar-heatmap" />,
}));

import HistoryPage from "./page";

let pushStateSpy: ReturnType<typeof vi.spyOn>;
let replaceStateSpy: ReturnType<typeof vi.spyOn>;

function latestHistoryDataInput() {
  return historyDataInputs[historyDataInputs.length - 1];
}

function currentPathAndSearch() {
  return `${window.location.pathname}${window.location.search}`;
}

function makeRawHistoryRows(count: number) {
  // Simulate raw-resolution data: ISO-string time, full schema
  const startMs = new Date("2026-05-03T00:00:00Z").getTime();
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(startMs + i * 16000).toISOString(), // 16s cadence
    temp_avg: 70, temp_min: 70, temp_max: 70,
    humidity_avg: 50,
    pressure_avg: 1013,
    wind_avg: 3 + (i % 5),
    wind_gust_max: 6 + (i % 7),
    rain_max: 0,
    solar_avg: 200, uv_max: 3,
  }));
}

describe("HistoryPage chart legends wiring", () => {
  beforeEach(() => {
    upChartCalls.length = 0;
    historyDataInputs.length = 0;
    historyDataState.resolution = "hourly";
    historyDataState.dataOverride = null;
    historyDataState.isLoading = false;
    historyDataState.isError = false;
    historyDataState.error = null;
    navState.searchParams = new URLSearchParams();
    stationTimezoneState.timezone = "UTC";
    stationTimezoneState.isSettled = true;
    refetchSpy.mockReset();
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

  it("Wind chart receives bucketed data, agg labels, AND bar options in raw 24h mode", () => {
    historyDataState.resolution = "raw";
    // Provide enough raw samples to span 24h so bucketing can fire
    historyDataState.dataOverride = makeRawHistoryRows(5400);

    renderWithProviders(<HistoryPage />);

    // Wind is the 4th chart panel (index 3)
    const windCall = upChartCalls[3];
    expect(windCall?.props.bucketMeta).toBeDefined();
    expect(windCall?.props.bucketMeta!.length).toBeGreaterThan(0);
    expect(windCall?.props.aggregationLabels).toEqual(["Avg Speed", "Peak Gust"]);

    // Critical: prove the BAR opts were selected, not the line opts. Bucketed
    // Wind opts set series[1].fill to the solid speed color; line opts have
    // no fill on Speed.
    const speed = windCall?.props.options?.series?.[1];
    expect(speed?.fill).toBe("#6aae7a");
  });

  it("Wind chart receives raw data, no bucketMeta, AND line options in hourly mode", () => {
    historyDataState.resolution = "hourly";
    renderWithProviders(<HistoryPage />);

    const windCall = upChartCalls[3];
    expect(windCall?.props.bucketMeta).toBeUndefined();
    expect(windCall?.props.aggregationLabels).toBeUndefined();

    // Line opts: Speed has no fill (lines, not bars)
    const speed = windCall?.props.options?.series?.[1];
    expect(speed?.fill).toBeUndefined();
  });

  it("Solar/UV chart receives bucketed data, agg labels, AND bar options in raw 24h mode", () => {
    historyDataState.resolution = "raw";
    historyDataState.dataOverride = makeRawHistoryRows(5400);

    renderWithProviders(<HistoryPage />);

    // Solar/UV is the 6th chart panel (index 5)
    const solarCall = upChartCalls[5];
    expect(solarCall?.props.bucketMeta).toBeDefined();
    expect(solarCall?.props.bucketMeta!.length).toBeGreaterThan(0);
    expect(solarCall?.props.aggregationLabels).toEqual(["Avg Solar", "Peak UV"]);

    // Critical: prove the BAR opts were selected, not the area-line opts.
    // Bucketed Solar opts set series[1].fill to the solid amber color (hex);
    // line opts use a semi-transparent rgba area-fill.
    const solar = solarCall?.props.options?.series?.[1];
    expect(solar?.fill).toBe("#d4a574");
  });

  it("Solar/UV chart receives raw data, no bucketMeta, AND area-line options in hourly mode", () => {
    historyDataState.resolution = "hourly";
    renderWithProviders(<HistoryPage />);

    const solarCall = upChartCalls[5];
    expect(solarCall?.props.bucketMeta).toBeUndefined();
    expect(solarCall?.props.aggregationLabels).toBeUndefined();

    // Line opts use rgba area-fill, NOT the solid hex bar color
    const solar = solarCall?.props.options?.series?.[1];
    expect(solar?.fill).toMatch(/^rgba\(/);
  });
});

describe("HistoryPage URL-driven state", () => {
  beforeEach(() => {
    upChartCalls.length = 0;
    historyDataInputs.length = 0;
    historyDataState.resolution = "hourly";
    historyDataState.dataOverride = null;
    historyDataState.isLoading = false;
    historyDataState.isError = false;
    historyDataState.error = null;
    navState.searchParams = new URLSearchParams();
    window.history.replaceState(null, "", "/history");
    pushStateSpy = vi.spyOn(window.history, "pushState");
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
    stationTimezoneState.timezone = "UTC";
    stationTimezoneState.isSettled = true;
    refetchSpy.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
    vi.useRealTimers();
  });

  it("defaults to live mode with range=day when URL has no params", () => {
    renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Last 24 Hours");
    expect(latestHistoryDataInput()).toEqual({
      range: "day",
      mode: "live",
      anchor: undefined,
      timezone: "UTC",
    });
  });

  it("renders 24h/7d/30d/12mo range labels in live mode", () => {
    renderWithProviders(<HistoryPage />);

    expect(screen.getByRole("button", { name: "24 Hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "12 Months" })).toBeInTheDocument();
  });

  it("renders Day/Week/Month/Year range labels in picked mode", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    expect(screen.getByRole("button", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Year" })).toBeInTheDocument();
  });

  it("shows the period label for picked week mode", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Apr 12–18, 2026");
    expect(screen.getByTestId("history-pager-live")).toBeInTheDocument();
    expect(latestHistoryDataInput()).toEqual({
      range: "week",
      mode: "picked",
      anchor: "2026-04-15",
      timezone: "UTC",
    });
  });

  it("clicking a range button updates URL via pushState", () => {
    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe("/history?range=week");
    expect(currentPathAndSearch()).toBe("/history?range=week");
  });

  it("clicking a range button from a direct picked URL updates URL via pushState", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe("/history?range=month&date=2026-04-15");
    expect(currentPathAndSearch()).toBe("/history?range=month&date=2026-04-15");
  });

  it("Live button removes date param via pushState", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByTestId("history-pager-live"));
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe("/history?range=week");
    expect(currentPathAndSearch()).toBe("/history?range=week");
  });

  it("prev chevron updates URL via replaceState without history flooding", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByTestId("history-pager-prev"));
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy.mock.calls[0]?.[2]).toBe("/history?range=week&date=2026-04-08");
    expect(currentPathAndSearch()).toBe("/history?range=week&date=2026-04-08");
  });

  it("future date in URL canonicalizes to station-today via replaceState after render", () => {
    navState.searchParams = new URLSearchParams("range=day&date=2099-01-01");

    renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Apr 27, 2026");
    expect(latestHistoryDataInput()).toEqual({
      range: "day",
      mode: "picked",
      anchor: "2026-04-27",
      timezone: "UTC",
    });
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy.mock.calls[0]?.[2]).toBe("/history?range=day&date=2026-04-27");
    expect(currentPathAndSearch()).toBe("/history?range=day&date=2026-04-27");
  });

  it("waits for settled station timezone before replacing a future date URL", () => {
    navState.searchParams = new URLSearchParams("range=day&date=2099-01-01");
    stationTimezoneState.timezone = "UTC";
    stationTimezoneState.isSettled = false;

    const { rerender } = renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Apr 27, 2026");
    expect(latestHistoryDataInput()).toEqual({
      range: "day",
      mode: "picked",
      anchor: "2026-04-27",
      timezone: "UTC",
    });
    expect(replaceStateSpy).not.toHaveBeenCalled();

    stationTimezoneState.timezone = "Pacific/Kiritimati";
    stationTimezoneState.isSettled = true;

    rerender(<HistoryPage />);

    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Apr 28, 2026");
    expect(latestHistoryDataInput()).toEqual({
      range: "day",
      mode: "picked",
      anchor: "2026-04-28",
      timezone: "Pacific/Kiritimati",
    });
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy.mock.calls[0]?.[2]).toBe("/history?range=day&date=2026-04-28");
    expect(currentPathAndSearch()).toBe("/history?range=day&date=2026-04-28");
  });

  it("garbage range and date fall back to live day mode without URL replacement", () => {
    navState.searchParams = new URLSearchParams("range=banana&date=garbage");

    renderWithProviders(<HistoryPage />);

    expect(screen.queryByTestId("history-pager-live")).toBeNull();
    expect(screen.getByTestId("history-pager-trigger")).toHaveTextContent("Last 24 Hours");
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(latestHistoryDataInput()).toEqual({
      range: "day",
      mode: "live",
      anchor: undefined,
      timezone: "UTC",
    });
  });

  it("live pager date picking pushes a date URL and enters picked mode", () => {
    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByTestId("history-pager-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe("/history?date=2026-04-27");
    expect(currentPathAndSearch()).toBe("/history?date=2026-04-27");
  });

  it("calendar button from a direct picked URL preserves chart params in pushState", () => {
    navState.searchParams = new URLSearchParams("range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "calendar" }));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe(
      "/history?range=week&date=2026-04-15&view=calendar",
    );
    expect(currentPathAndSearch()).toBe(
      "/history?range=week&date=2026-04-15&view=calendar",
    );
  });

  it("view=calendar renders heatmap and preserves chart params when returning to charts", () => {
    navState.searchParams = new URLSearchParams("view=calendar&range=week&date=2026-04-15");

    renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("calendar-heatmap")).toBeInTheDocument();
    expect(screen.queryByTestId("uplot-chart")).toBeNull();
    expect(screen.queryByTestId("history-pager-trigger")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "charts" }));
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0]?.[2]).toBe("/history?range=week&date=2026-04-15");
    expect(currentPathAndSearch()).toBe("/history?range=week&date=2026-04-15");
  });
});

describe("HistoryPage error state", () => {
  beforeEach(() => {
    upChartCalls.length = 0;
    historyDataInputs.length = 0;
    historyDataState.resolution = "hourly";
    historyDataState.dataOverride = null;
    historyDataState.isLoading = false;
    historyDataState.isError = true;
    historyDataState.error = new Error("network failure");
    navState.searchParams = new URLSearchParams();
    stationTimezoneState.timezone = "UTC";
    stationTimezoneState.isSettled = true;
    refetchSpy.mockReset();
  });

  it("renders 'Couldn't load history' with a 'Try again' button", () => {
    renderWithProviders(<HistoryPage />);

    expect(screen.getByText(/couldn't load history/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("clicking Try again calls the returned refetch", () => {
    renderWithProviders(<HistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });
});
