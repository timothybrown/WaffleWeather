import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import IndoorPage from "./page";

const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

const currentState = vi.hoisted(() => ({
  temp: 21.5 as number | null,
  humidity: 47 as number | null,
  tempTrend: 0.5 as number | null,
  humidityTrend: 0 as number | null,
  timestamp: "2026-08-16T12:00:00Z" as string | null,
}));

const dataState = vi.hoisted(() => ({
  resolution: "raw" as "raw" | "hourly" | "daily" | "monthly",
  isError: false,
  rows: [
    {
      time: "2026-08-16T00:00:00Z",
      temp_avg: 21,
      temp_min: 20,
      temp_max: 22,
      humidity_avg: 47,
    },
  ] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/hooks/useIndoorCurrent", () => ({
  useIndoorCurrent: () => ({
    temp: currentState.temp,
    humidity: currentState.humidity,
    tempTrend: currentState.tempTrend,
    humidityTrend: currentState.humidityTrend,
    tempSparkline: [21, 21.5],
    humiditySparkline: [46, 47],
    timestamp: currentState.timestamp,
    windowStart: "2026-08-15T00:00:00Z",
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useIndoorData", () => ({
  useIndoorData: () => ({
    data: dataState.rows,
    sensors: [],
    isLoading: false,
    isError: dataState.isError,
    error: null,
    resolution: dataState.resolution,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/charts/UPlotChart", () => ({
  default: () => <div data-testid="uplot" />,
}));

vi.mock("@/components/history/HistoryPager", () => ({
  default: () => <div data-testid="history-pager" />,
}));

describe("IndoorPage", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    currentState.temp = 21.5;
    currentState.humidity = 47;
    currentState.tempTrend = 0.5;
    currentState.humidityTrend = 0;
    currentState.timestamp = "2026-08-16T12:00:00Z";
    dataState.resolution = "raw";
    dataState.isError = false;
    dataState.rows = [
      {
        time: "2026-08-16T00:00:00Z",
        temp_avg: 21,
        temp_min: 20,
        temp_max: 22,
        humidity_avg: 47,
      },
    ];
  });

  describe("tabs", () => {
    it("exposes both tabs", () => {
      renderWithProviders(<IndoorPage />);
      expect(screen.getByRole("button", { name: /current/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();
    });

    it("defaults to the current view", () => {
      renderWithProviders(<IndoorPage />);
      expect(screen.getByText("21.5")).toBeInTheDocument();
      expect(screen.queryByTestId("uplot")).not.toBeInTheDocument();
    });

    it("renders charts when view=history", () => {
      searchParams.value = new URLSearchParams("view=history");
      renderWithProviders(<IndoorPage />);
      expect(screen.getAllByTestId("uplot")).toHaveLength(2);
    });
  });

  describe("date picker gating", () => {
    it("hides the pager on the current tab", () => {
      renderWithProviders(<IndoorPage />);
      expect(screen.queryByTestId("history-pager")).not.toBeInTheDocument();
    });

    it("shows the pager on the history tab", () => {
      searchParams.value = new URLSearchParams("view=history");
      renderWithProviders(<IndoorPage />);
      expect(screen.getByTestId("history-pager")).toBeInTheDocument();
    });
  });

  describe("current readings", () => {
    it("renders humidity as a whole number", () => {
      renderWithProviders(<IndoorPage />);
      expect(screen.getByText("47")).toBeInTheDocument();
    });

    it("renders a placeholder when a metric is unavailable", () => {
      currentState.temp = null;
      currentState.humidity = null;
      renderWithProviders(<IndoorPage />);
      // fmt() renders an em dash for null — same placeholder the Observatory
      // cards use, so the two pages stay visually consistent.
      expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("renders the unit inline beside the value, not in the card title", () => {
      renderWithProviders(<IndoorPage />);
      // Observatory renders "70 °F", never "Temperature (°F)".
      expect(screen.getByText("Temperature")).toBeInTheDocument();
      expect(screen.queryByText(/Temperature \(/)).not.toBeInTheDocument();
      expect(screen.getByText("°C")).toBeInTheDocument();
      expect(screen.getByText("%")).toBeInTheDocument();
    });

    it("shows a rising trend arrow when the delta clears the threshold", () => {
      renderWithProviders(<IndoorPage />);
      expect(screen.getByLabelText("Trending up")).toBeInTheDocument();
    });

    it("shows no trend arrow when the delta is inside the threshold", () => {
      currentState.tempTrend = 0.05;
      currentState.humidityTrend = 0;
    currentState.timestamp = "2026-08-16T12:00:00Z";
      renderWithProviders(<IndoorPage />);
      expect(screen.queryByLabelText("Trending up")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Trending down")).not.toBeInTheDocument();
    });
  });

  describe("history states", () => {
    it("renders an error state with a retry affordance", () => {
      searchParams.value = new URLSearchParams("view=history");
      dataState.isError = true;
      renderWithProviders(<IndoorPage />);
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("renders an empty state when there are no rows", () => {
      searchParams.value = new URLSearchParams("view=history");
      dataState.rows = [];
      renderWithProviders(<IndoorPage />);
      expect(screen.getByText(/no data for/i)).toBeInTheDocument();
    });
  });
});

describe("IndoorPage last update", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    currentState.timestamp = "2026-08-16T12:00:00Z";
  });

  it("shows a last-update line when a reading is present", () => {
    renderWithProviders(<IndoorPage />);
    expect(screen.getByText(/last update:/i)).toBeInTheDocument();
  });

  it("shows a waiting message when no reading has arrived", () => {
    currentState.timestamp = null;
    renderWithProviders(<IndoorPage />);
    expect(screen.getByText(/waiting for data/i)).toBeInTheDocument();
  });

  it("keeps the last-update line visible on the history tab", () => {
    searchParams.value = new URLSearchParams("view=history");
    renderWithProviders(<IndoorPage />);
    expect(screen.getByText(/last update:/i)).toBeInTheDocument();
  });
});
