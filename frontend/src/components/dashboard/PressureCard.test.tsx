import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import PressureCard from "./PressureCard";

describe("PressureCard", () => {
  it("renders pressure in hPa", () => {
    renderWithProviders(<PressureCard data={makeObservation()} trend={null} />);
    expect(screen.getByText("1013.25")).toBeInTheDocument();
    expect(screen.getByText("hPa")).toBeInTheDocument();
  });

  it("renders zambretti forecast", () => {
    renderWithProviders(
      <PressureCard data={makeObservation({ zambretti_forecast: "Settled fine" })} trend={null} />,
    );
    expect(screen.getByText("Settled fine")).toBeInTheDocument();
  });

  it("omits forecast when not available", () => {
    renderWithProviders(
      <PressureCard data={makeObservation({ zambretti_forecast: null })} trend={null} />,
    );
    expect(screen.queryByText("Forecast")).not.toBeInTheDocument();
  });

  it("handles null data", () => {
    renderWithProviders(<PressureCard data={null} trend={null} />);
    expect(screen.getByText("Pressure")).toBeInTheDocument();
  });

  it("renders sparkline when data is provided", () => {
    const sparkline = [1012, 1012.5, 1013, 1013.2, 1013.5, 1013.8, 1014, 1013.5,
                       1013, 1012.8, 1012.5, 1012, 1012.2, 1012.5, 1013, 1013.5,
                       1014, 1014.2, 1014, 1013.5, 1013, 1012.8, 1012.5, 1012];
    renderWithProviders(
      <PressureCard data={makeObservation()} trend={null} sparkline={sparkline} />,
    );
    expect(screen.getByRole("img", { name: /pressure trend/i })).toBeInTheDocument();
  });

  it("does not render sparkline when prop is omitted", () => {
    renderWithProviders(<PressureCard data={makeObservation()} trend={null} />);
    expect(screen.queryByRole("img", { name: /pressure trend/i })).not.toBeInTheDocument();
  });
});
