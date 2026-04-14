import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import HumidityCard from "./HumidityCard";

describe("HumidityCard", () => {
  it("renders humidity value", () => {
    renderWithProviders(<HumidityCard data={makeObservation()} trend={null} />);
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("shows 'Comfortable' for 30-60%", () => {
    renderWithProviders(
      <HumidityCard data={makeObservation({ humidity_outdoor: 50 })} trend={null} />,
    );
    expect(screen.getByText("Comfortable")).toBeInTheDocument();
  });

  it("shows 'Dry' for < 30%", () => {
    renderWithProviders(
      <HumidityCard data={makeObservation({ humidity_outdoor: 20 })} trend={null} />,
    );
    expect(screen.getByText("Dry")).toBeInTheDocument();
  });

  it("shows 'Very humid' for >= 80%", () => {
    renderWithProviders(
      <HumidityCard data={makeObservation({ humidity_outdoor: 90 })} trend={null} />,
    );
    expect(screen.getByText("Very humid")).toBeInTheDocument();
  });

  it("renders VPD when present", () => {
    renderWithProviders(
      <HumidityCard data={makeObservation({ vpd: 12 })} trend={null} />,
    );
    expect(screen.getByText("VPD")).toBeInTheDocument();
    expect(screen.getByText("1.20")).toBeInTheDocument();
    expect(screen.getByText("kPa")).toBeInTheDocument();
  });

  it("does not render VPD when absent", () => {
    renderWithProviders(
      <HumidityCard data={makeObservation({ vpd: null })} trend={null} />,
    );
    expect(screen.queryByText("VPD")).not.toBeInTheDocument();
  });

  it("handles null data", () => {
    renderWithProviders(<HumidityCard data={null} trend={null} />);
    expect(screen.getByText("Humidity")).toBeInTheDocument();
  });

  it("renders sparkline when data is provided", () => {
    const sparkline = [60, 62, 64, 66, 68, 70, 68, 66, 64, 62, 60, 58,
                       60, 62, 65, 68, 72, 70, 66, 63, 61, 59, 58, 60];
    renderWithProviders(
      <HumidityCard data={makeObservation()} trend={null} sparkline={sparkline} />,
    );
    expect(screen.getByRole("img", { name: /humidity trend/i })).toBeInTheDocument();
  });

  it("does not render sparkline when prop is omitted", () => {
    renderWithProviders(<HumidityCard data={makeObservation()} trend={null} />);
    expect(screen.queryByRole("img", { name: /humidity trend/i })).not.toBeInTheDocument();
  });
});
