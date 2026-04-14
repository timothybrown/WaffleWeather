import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import TemperatureCard from "./TemperatureCard";

describe("TemperatureCard", () => {
  it("renders temperature value", () => {
    renderWithProviders(<TemperatureCard data={makeObservation()} trend={null} />);
    expect(screen.getByText("22.5")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
  });

  it("renders dewpoint comfort level", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ dewpoint: 15.5 })} trend={null} />,
    );
    expect(screen.getByText("Slightly humid")).toBeInTheDocument();
  });

  it("renders 'Dry' for low dewpoint", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ dewpoint: 5.0 })} trend={null} />,
    );
    expect(screen.getByText("Dry")).toBeInTheDocument();
  });

  it("renders 'Comfortable' for moderate dewpoint", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ dewpoint: 12.0 })} trend={null} />,
    );
    expect(screen.getByText("Comfortable")).toBeInTheDocument();
  });

  it("renders 'Miserable' for very high dewpoint", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ dewpoint: 25.0 })} trend={null} />,
    );
    expect(screen.getByText("Miserable")).toBeInTheDocument();
  });

  it("does not render Feels Like", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation()} trend={null} />,
    );
    expect(screen.queryByText(/Feels like/)).not.toBeInTheDocument();
  });

  it("does not render Globe or Wet Bulb", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ bgt: 25.0, wbgt: 22.0 })} trend={null} />,
    );
    expect(screen.queryByText("Globe")).not.toBeInTheDocument();
    expect(screen.queryByText("Wet Bulb")).not.toBeInTheDocument();
  });

  it("does not render VPD", () => {
    renderWithProviders(
      <TemperatureCard data={makeObservation({ vpd: 12 })} trend={null} />,
    );
    expect(screen.queryByText("VPD")).not.toBeInTheDocument();
  });

  it("handles null data gracefully", () => {
    renderWithProviders(<TemperatureCard data={null} trend={null} />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getAllByText("\u2014").length).toBeGreaterThan(0);
  });

  it("renders trend indicator", () => {
    renderWithProviders(<TemperatureCard data={makeObservation()} trend="up" />);
    expect(screen.getByLabelText("Trending up")).toBeInTheDocument();
  });

  it("renders sparkline when data is provided", () => {
    const sparkline = [18, 19, 20, 21, 22, 23, 22, 21, 20, 19, 18, 17,
                       18, 19, 21, 23, 25, 24, 22, 20, 19, 18, 17, 18];
    renderWithProviders(
      <TemperatureCard data={makeObservation()} trend={null} sparkline={sparkline} />,
    );
    expect(screen.getByRole("img", { name: /temperature trend/i })).toBeInTheDocument();
  });

  it("does not render sparkline when prop is omitted", () => {
    renderWithProviders(<TemperatureCard data={makeObservation()} trend={null} />);
    expect(screen.queryByRole("img", { name: /temperature trend/i })).not.toBeInTheDocument();
  });
});
