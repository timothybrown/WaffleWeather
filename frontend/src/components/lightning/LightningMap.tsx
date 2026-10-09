"use client";

import { useEffect } from "react";
import { MapContainer, Circle, CircleMarker, useMap } from "react-leaflet";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/providers/ThemeProvider";

// OpenFreeMap vector tiles: no API key, no usage limits, commercial use
// allowed. CARTO's raster basemaps, used here until 2026-10, began requiring
// a per-user key and now serve "API KEY REQUIRED" placeholder tiles.
// Positron is the open version of CARTO's light style; Dark is the matching
// near-black style. Everything (style, tiles, sprites, fonts) loads from
// tiles.openfreemap.org, which the nginx CSP allows in connect-src.
export const BASEMAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// Required by OpenFreeMap/OpenMapTiles/OpenStreetMap terms. Passed explicitly
// rather than read from the style, whose credit only arrives once the tile
// metadata loads.
export const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

/** Where scripts/copy-maplibre-worker.mjs puts MapLibre's tile worker. The
 *  default location, next to MapLibre's own module, doesn't survive bundling. */
export function maplibreWorkerUrl(): string {
  return `/maplibre/${getVersion()}/maplibre-gl-worker.mjs`;
}

/** MapLibre-rendered vector basemap inside the Leaflet map. The circles and
 *  marker stay ordinary Leaflet layers drawn on top of it. */
function VectorBasemap({ styleUrl }: { styleUrl: string }) {
  const map = useMap();

  useEffect(() => {
    setWorkerUrl(maplibreWorkerUrl());
    map.attributionControl?.setPrefix(false);
    const layer = maplibreGL({
      style: styleUrl,
      attributionControl: { customAttribution: BASEMAP_ATTRIBUTION },
    }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, styleUrl]);

  return null;
}

interface LightningMapProps {
  latitude: number;
  longitude: number;
  /** Lightning strike distance in km, or null if no data */
  strikeDistance: number | null;
}

export default function LightningMap({
  latitude,
  longitude,
  strikeDistance,
}: LightningMapProps) {
  const { resolved } = useTheme();
  const center: [number, number] = [latitude, longitude];
  // Zoom level: fit the circle nicely. Farther strikes = zoom out.
  const zoom =
    strikeDistance != null
      ? strikeDistance > 40
        ? 8
        : strikeDistance > 20
          ? 9
          : strikeDistance > 10
            ? 10
            : 11
      : 11;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full rounded-lg"
      zoomControl={false}
    >
      <VectorBasemap
        styleUrl={resolved === "dark" ? BASEMAP_STYLES.dark : BASEMAP_STYLES.light}
      />

      {/* Station marker — small pulsing amber dot */}
      <CircleMarker
        center={center}
        radius={6}
        pathOptions={{
          fillColor: "#d4a574",
          fillOpacity: 1,
          color: "#b07832",
          weight: 2,
        }}
      />

      {/* Lightning strike distance radius */}
      {strikeDistance != null && strikeDistance > 0 && (
        <Circle
          center={center}
          radius={strikeDistance * 1000}
          pathOptions={{
            color: "#d4a574",
            weight: 2,
            fillColor: "#d4a574",
            fillOpacity: 0.08,
            dashArray: "8 4",
          }}
        />
      )}
    </MapContainer>
  );
}
