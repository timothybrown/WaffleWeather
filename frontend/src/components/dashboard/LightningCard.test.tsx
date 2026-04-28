import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import LightningCard from "./LightningCard";

type LightningSummaryHookMock = (params: unknown, options: unknown) => { data: unknown };

// Default mock: summary not loaded
const mockUseGetLightningSummary = vi.fn<LightningSummaryHookMock>(() => ({ data: undefined }));
vi.mock("@/generated/lightning/lightning", () => ({
  useGetLightningSummary: (params: unknown, options: unknown) => mockUseGetLightningSummary(params, options),
}));

describe("LightningCard", () => {
  beforeEach(() => {
    mockUseGetLightningSummary.mockClear();
    mockUseGetLightningSummary.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders em dash when summary not loaded", () => {
    renderWithProviders(
      <LightningCard data={makeObservation({ lightning_count: 5 })} />,
    );
    expect(screen.getByText("\u2014")).toBeInTheDocument();
    expect(screen.getByText("in 24h")).toBeInTheDocument();
  });

  it("renders lightning distance", () => {
    renderWithProviders(
      <LightningCard data={makeObservation({ lightning_distance: 14.0 })} />,
    );
    expect(screen.getByText(/14\.0/)).toBeInTheDocument();
  });

  it("shows em dash when summary not loaded and null count", () => {
    renderWithProviders(
      <LightningCard data={makeObservation({ lightning_count: null })} />,
    );
    expect(screen.getByText("\u2014")).toBeInTheDocument();
  });

  it("shows active pulse when lightning was recent", () => {
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const { container } = renderWithProviders(
      <LightningCard data={makeObservation({ lightning_time: recentTime })} />,
    );
    expect(container.querySelector(".lightning-active")).toBeInTheDocument();
  });

  it("does not show active state for old lightning", () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const { container } = renderWithProviders(
      <LightningCard data={makeObservation({ lightning_time: oldTime })} />,
    );
    expect(container.querySelector(".lightning-active")).not.toBeInTheDocument();
  });

  it("does not show active state for null lightning_time", () => {
    const { container } = renderWithProviders(
      <LightningCard data={makeObservation({ lightning_time: null })} />,
    );
    expect(container.querySelector(".lightning-active")).not.toBeInTheDocument();
  });

  it("handles null data", () => {
    renderWithProviders(<LightningCard data={null} />);
    expect(screen.getByText("Lightning")).toBeInTheDocument();
  });

  it("fades distance and last strike when ghost-only", () => {
    mockUseGetLightningSummary.mockReturnValue({
      data: { data: { total_strikes: 0, event_count: 0, filtered_count: 5, closest_distance: null, daily: [], hourly: [] } },
    });
    renderWithProviders(
      <LightningCard data={makeObservation({ lightning_distance: 14.0, lightning_time: new Date().toISOString() })} />,
    );
    expect(screen.getByText("ghost")).toBeInTheDocument();
  });

  it("suppresses active pulse when ghost-only", () => {
    mockUseGetLightningSummary.mockReturnValue({
      data: { data: { total_strikes: 0, event_count: 0, filtered_count: 5, closest_distance: null, daily: [], hourly: [] } },
    });
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { container } = renderWithProviders(
      <LightningCard data={makeObservation({ lightning_distance: 14.0, lightning_time: recentTime })} />,
    );
    expect(container.querySelector(".lightning-active")).not.toBeInTheDocument();
  });

  it("slides the 24h summary window forward without relying on query data changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));

    renderWithProviders(<LightningCard data={makeObservation()} />);
    const firstParams = mockUseGetLightningSummary.mock.calls[0][0] as { start: string; end: string };

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const latestParams = mockUseGetLightningSummary.mock.calls[
      mockUseGetLightningSummary.mock.calls.length - 1
    ][0] as { start: string; end: string };
    expect(new Date(latestParams.start).getTime()).toBeGreaterThan(new Date(firstParams.start).getTime());
    expect(new Date(latestParams.end).getTime()).toBeGreaterThan(new Date(firstParams.end).getTime());
  });
});
