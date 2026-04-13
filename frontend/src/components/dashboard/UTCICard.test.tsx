import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/wrappers";
import { makeObservation } from "@/test/fixtures";
import UTCICard from "./UTCICard";

describe("UTCICard", () => {
  it("renders UTCI value", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: 22.0 })} />);
    expect(screen.getByText("22.0")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
  });

  it("shows 'No stress' for comfortable UTCI", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: 20.0 })} />);
    expect(screen.getByText("No stress")).toBeInTheDocument();
  });

  it("shows 'Moderate heat' for warm UTCI", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: 30.0 })} />);
    expect(screen.getByText("Moderate heat")).toBeInTheDocument();
  });

  it("shows 'Very strong cold' for cold UTCI", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: -30.0 })} />);
    expect(screen.getByText("Very strong cold")).toBeInTheDocument();
  });

  it("shows 'Extreme heat' for very high UTCI", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: 48.0 })} />);
    expect(screen.getByText("Extreme heat")).toBeInTheDocument();
  });

  it("shows 'Slight cold' for cool UTCI", () => {
    renderWithProviders(<UTCICard data={makeObservation({ utci: 5.0 })} />);
    expect(screen.getByText("Slight cold")).toBeInTheDocument();
  });

  it("renders stress gauge SVG", () => {
    const { container } = renderWithProviders(
      <UTCICard data={makeObservation({ utci: 22.0 })} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders Globe and Wet Bulb when BGT is present", () => {
    renderWithProviders(
      <UTCICard data={makeObservation({ utci: 22.0, bgt: 25.3, wbgt: 21.8 })} />,
    );
    expect(screen.getByText("Globe")).toBeInTheDocument();
    expect(screen.getByText("25.3°")).toBeInTheDocument();
    expect(screen.getByText("Wet Bulb")).toBeInTheDocument();
    expect(screen.getByText("21.8°")).toBeInTheDocument();
  });

  it("does not render Globe and Wet Bulb when BGT is absent", () => {
    renderWithProviders(
      <UTCICard data={makeObservation({ utci: 22.0, bgt: null })} />,
    );
    expect(screen.queryByText("Globe")).not.toBeInTheDocument();
    expect(screen.queryByText("Wet Bulb")).not.toBeInTheDocument();
  });

  it("handles null data", () => {
    renderWithProviders(<UTCICard data={null} />);
    expect(screen.getByText("Thermal Comfort")).toBeInTheDocument();
  });
});
