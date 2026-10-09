import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LightningMap, { BASEMAP_ATTRIBUTION, BASEMAP_STYLES } from "./LightningMap";

const mocks = vi.hoisted(() => {
  const layer = { addTo: vi.fn(), remove: vi.fn() };
  layer.addTo.mockReturnValue(layer);
  return {
    layer,
    maplibreGL: vi.fn(() => layer),
    setWorkerUrl: vi.fn(),
    map: { attributionControl: { setPrefix: vi.fn() } },
    theme: { resolved: "light" as "light" | "dark" },
  };
});

// Mock react-leaflet components
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, ...props }: { children: React.ReactNode; className?: string; zoom?: number }) => (
    <div data-testid="map-container" data-zoom={props.zoom} className={props.className}>
      {children}
    </div>
  ),
  Circle: ({ radius }: { radius: number }) => (
    <div data-testid="circle" data-radius={radius} />
  ),
  CircleMarker: () => <div data-testid="circle-marker" />,
  useMap: () => mocks.map,
}));

// MapLibre needs WebGL, which jsdom lacks; the layer is checked by its options.
vi.mock("@maplibre/maplibre-gl-leaflet", () => ({ maplibreGL: mocks.maplibreGL }));
vi.mock("maplibre-gl", () => ({
  getVersion: () => "6.11.2",
  setWorkerUrl: mocks.setWorkerUrl,
}));

vi.mock("@/providers/ThemeProvider", () => ({ useTheme: () => mocks.theme }));

// Mock CSS imports
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

describe("LightningMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.layer.addTo.mockReturnValue(mocks.layer);
    mocks.theme.resolved = "light";
  });

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

  it("uses the keyless OpenFreeMap light style with the required credit", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(mocks.maplibreGL).toHaveBeenCalledTimes(1);
    expect(mocks.maplibreGL).toHaveBeenCalledWith({
      style: BASEMAP_STYLES.light,
      attributionControl: { customAttribution: BASEMAP_ATTRIBUTION },
    });
    expect(BASEMAP_STYLES.light).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
    expect(BASEMAP_ATTRIBUTION).toContain("OpenStreetMap");
    expect(mocks.layer.addTo).toHaveBeenCalledWith(mocks.map);
    expect(mocks.map.attributionControl.setPrefix).toHaveBeenCalledWith(false);
  });

  it("points MapLibre at the versioned worker copied into public/", () => {
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(mocks.setWorkerUrl).toHaveBeenCalledWith(
      "/maplibre/6.11.2/maplibre-gl-worker.mjs",
    );
    expect(mocks.setWorkerUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.maplibreGL.mock.invocationCallOrder[0]!,
    );
  });

  it("uses the dark style in dark mode", () => {
    mocks.theme.resolved = "dark";
    render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(mocks.maplibreGL).toHaveBeenCalledWith(
      expect.objectContaining({ style: BASEMAP_STYLES.dark }),
    );
  });

  it("swaps the basemap layer when the theme changes", () => {
    const { rerender } = render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    mocks.theme.resolved = "dark";
    rerender(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    expect(mocks.layer.remove).toHaveBeenCalledTimes(1);
    expect(mocks.maplibreGL).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: BASEMAP_STYLES.dark }),
    );
  });

  it("removes the basemap layer on unmount", () => {
    const { unmount } = render(
      <LightningMap latitude={-33.87} longitude={151.21} strikeDistance={15} />,
    );
    unmount();
    expect(mocks.layer.remove).toHaveBeenCalledTimes(1);
  });
});
