import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/wrappers";
import CalendarHeatmap from "./CalendarHeatmap";

// Mock the generated hook
vi.mock("@/generated/aggregates/aggregates", () => ({
  useGetCalendarData: vi.fn().mockReturnValue({
    data: {
      data: [
        { date: "2026-01-15", value: 25.0 },
        { date: "2026-02-10", value: 18.5 },
        { date: "2026-03-20", value: 30.0 },
      ],
    },
    isLoading: false,
  }),
  useListHourlyObservations: vi.fn().mockReturnValue({ data: { data: [] }, isLoading: false }),
  useListDailyObservations: vi.fn().mockReturnValue({ data: { data: [] }, isLoading: false }),
  useListMonthlyObservations: vi.fn().mockReturnValue({ data: { data: [] }, isLoading: false }),
}));

describe("CalendarHeatmap", () => {
  it("renders metric selector buttons", () => {
    renderWithProviders(<CalendarHeatmap />);
    expect(screen.getByText("Temp")).toBeInTheDocument();
    expect(screen.getByText("Rainfall")).toBeInTheDocument();
    expect(screen.getByText("Solar Radiation")).toBeInTheDocument();
    expect(screen.getByText("Wind Gust")).toBeInTheDocument();
    expect(screen.getByText("Humidity")).toBeInTheDocument();
    expect(screen.getByText("Lightning")).toBeInTheDocument();
  });

  it("renders SVG heatmap cells", () => {
    const { container } = renderWithProviders(<CalendarHeatmap />);
    const rects = container.querySelectorAll("rect");
    // Should have at least 365 cells (one per day of the year)
    expect(rects.length).toBeGreaterThanOrEqual(365);
  });

  it("allows switching metrics", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarHeatmap />);
    const rainfallBtn = screen.getByText("Rainfall");
    await user.click(rainfallBtn);
    // After click, the button should have the active class
    expect(rainfallBtn.className).toContain("text-primary");
  });

  it("renders month labels in SVG", () => {
    const { container } = renderWithProviders(<CalendarHeatmap />);
    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("Jan");
    expect(labels).toContain("Jun");
    expect(labels).toContain("Dec");
  });

  it("renders day-of-week labels", () => {
    const { container } = renderWithProviders(<CalendarHeatmap />);
    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("Mon");
    expect(labels).toContain("Wed");
    expect(labels).toContain("Fri");
  });
});
