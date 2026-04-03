"use client";

import { MapContainer, TileLayer, Circle, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

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
