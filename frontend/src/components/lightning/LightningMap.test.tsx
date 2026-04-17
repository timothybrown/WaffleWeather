import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LightningMap from "./LightningMap";

// Mock react-leaflet components
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, ...props }: { children: React.ReactNode; className?: string; zoom?: number }) => (
    <div data-testid="map-container" data-zoom={props.zoom} className={props.className}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Circle: ({ radius }: { radius: number }) => (
    <div data-testid="circle" data-radius={radius} />
  ),
  CircleMarker: () => <div data-testid="circle-marker" />,
}));

// Mock leaflet CSS import
vi.mock("leaflet/dist/leaflet.css", () => ({}));

describe("LightningMap", () => {
  it("renders map container", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("renders station marker", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(screen.getByTestId("circle-marker")).toBeInTheDocument();
  });

  it("renders strike distance circle", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    const circle = screen.getByTestId("circle");
    expect(circle).toBeInTheDocument();
    expect(circle.getAttribute("data-radius")).toBe("15000"); // 15 km * 1000
  });

  it("does not render circle when strikeDistance is null", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={null} />,
    );
    expect(screen.queryByTestId("circle")).not.toBeInTheDocument();
  });

  it("zooms out for distant strikes", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={45} />,
    );
    const map = screen.getByTestId("map-container");
    expect(map.getAttribute("data-zoom")).toBe("8");
  });
});
