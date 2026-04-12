import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import WindRoseSelectionCard from "./WindRoseSelectionCard";

describe("WindRoseSelectionCard", () => {
  it("renders empty prompt when selection is null", () => {
    renderWithProviders(
      <WindRoseSelectionCard selection={null} totalObs={0} />,
    );
    expect(
      screen.getByText(/hover or tap a segment to see details/i),
    ).toBeInTheDocument();
  });

  it("renders direction, band, count, and frequency when a selection is present", () => {
    renderWithProviders(
      <WindRoseSelectionCard
        selection={{ direction: 22.5, band: "5-15", count: 142 }}
        totalObs={4580}
      />,
    );
    expect(screen.getByText("NNE")).toBeInTheDocument();
    expect(screen.getByText(/22\.5°/)).toBeInTheDocument();
    expect(screen.getByText("5–15 km/h")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("3.1%")).toBeInTheDocument();
  });
});
