"use client";

import { useEffect, useState } from "react";
import { useListStations } from "@/generated/stations/stations";
import { useWebSocket, type Diagnostics, type BatteryInfo } from "@/providers/WebSocketProvider";
import { fmt, timeAgo } from "@/lib/utils";
import type { Station } from "@/generated/models";
import {
  RiBatteryLine,
  RiBatteryLowLine,
  RiBattery2Line,
} from "@remixicon/react";
import { convertAltitude } from "@/lib/units";
import { CADENCES } from "@/lib/queryCadences";
import { useUnits } from "@/providers/UnitsProvider";

const FRONTEND_VERSION = process.env.NEXT_PUBLIC_FRONTEND_VERSION ?? "unknown";

function StationInfo({ station }: { station: Station }) {
  const { system } = useUnits();
  const alt = convertAltitude(station.altitude, system);

  return (
    <div className="weather-card rounded-xl p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Station: {station.name || station.id}
      </h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-text-faint">Source</dt>
          <dd className="font-mono font-medium">{station.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-faint">Last Seen</dt>
          <dd className="font-medium">{timeAgo(station.last_seen)}</dd>
        </div>
        {station.model && (
          <div>
            <dt className="text-xs text-text-faint">Model</dt>
            <dd className="font-medium">{station.model}</dd>
          </div>
        )}
        {station.firmware_version && (
          <div>
            <dt className="text-xs text-text-faint">Firmware</dt>
            <dd className="font-medium">{station.firmware_version}</dd>
          </div>
        )}
        {station.latitude != null && station.longitude != null && (
          <div>
            <dt className="text-xs text-text-faint">Location</dt>
            <dd className="font-mono font-medium">
              {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
            </dd>
          </div>
        )}
        {station.altitude != null && (
          <div>
            <dt className="text-xs text-text-faint">Altitude</dt>
            <dd className="font-mono font-medium">{fmt(alt.value)} {alt.unit}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function BatteryDisplay({ id, info }: { id: string; info: BatteryInfo }) {
  let display: string;
  let level: "ok" | "low" | "unknown" = "unknown";

  if (info.type === "boolean") {
    const isOk = info.value === "OFF" || info.value === 0;
    display = isOk ? "OK" : "Low";
    level = isOk ? "ok" : "low";
  } else if (info.type === "voltage") {
    const v = Number(info.value);
    display = `${v.toFixed(2)} V`;
    level = v > 1.2 ? "ok" : "low";
  } else {
    const pct = Number(info.value);
    display = `${Math.round(pct)}%`;
    level = pct > 20 ? "ok" : "low";
  }

  const Icon = level === "low" ? RiBatteryLowLine : level === "ok" ? RiBatteryLine : RiBattery2Line;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${level === "low" ? "text-danger" : "text-success"}`} />
        <span className="text-sm font-medium text-text">{info.label}</span>
      </div>
      <span className={`font-mono text-sm font-medium tabular-nums ${level === "low" ? "text-danger" : "text-text-muted"}`}>
        {display}
      </span>
    </div>
  );
}

function DiagnosticsSection({ diagnostics }: { diagnostics: Diagnostics | null }) {
  if (!diagnostics) {
    return (
      <div className="weather-card rounded-xl p-5 text-sm text-text-muted">
        Diagnostics will appear once live data arrives.
      </div>
    );
  }

  const batteries = Object.entries(diagnostics.batteries);
  const gw = diagnostics.gateway;

  return (
    <>
      {/* Battery Levels */}
      {batteries.length > 0 && (
        <div className="weather-card rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Battery Levels
          </h3>
          <div className="space-y-2">
            {batteries.map(([id, info]) => (
              <BatteryDisplay key={id} id={id} info={info} />
            ))}
          </div>
        </div>
      )}

      {/* Gateway */}
      {(gw.runtime != null || gw.heap != null || gw.interval != null) && (
        <div className="weather-card rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Gateway
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {gw.runtime != null && (
              <div>
                <dt className="text-xs text-text-faint">Uptime</dt>
                <dd className="font-mono font-medium">{formatUptime(gw.runtime)}</dd>
              </div>
            )}
            {gw.heap != null && (
              <div>
                <dt className="text-xs text-text-faint">Free Memory</dt>
                <dd className="font-mono font-medium">{(gw.heap / 1024).toFixed(0)} KB</dd>
              </div>
            )}
            {gw.interval != null && (
              <div>
                <dt className="text-xs text-text-faint">Interval</dt>
                <dd className="font-mono font-medium">{gw.interval}s</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );
}

function useBackendVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/v1/version")
      .then((r) => r.json())
      .then((d) => setVersion(d.backend))
      .catch(() => setVersion("unavailable"));
  }, []);
  return version;
}

export default function SettingsPage() {
  // Station metadata (model, firmware, location) effectively never changes at
  // runtime; live diagnostics (battery, gateway) arrive via WebSocket, not HTTP.
  const { data: stationsResponse } = useListStations({
    query: { refetchInterval: CADENCES.none },
  });
  const { connected, diagnostics } = useWebSocket();
  const backendVersion = useBackendVersion();

  const stations = (stationsResponse?.data as Station[] | undefined) ?? [];

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header">
        <h1 className="mb-6 font-display text-2xl font-semibold text-text">Diagnostics</h1>
      </div>

      <div className="card-stagger max-w-2xl space-y-4">
        {/* Connection Status */}
        <div className="weather-card rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Connection
          </h3>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                connected ? "bg-success live-pulse" : "bg-danger"
              }`}
            />
            <span className="text-sm font-medium">
              WebSocket: {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Stations */}
        {stations.length > 0 ? (
          stations.map((s) => <StationInfo key={s.id} station={s} />)
        ) : (
          <div className="weather-card rounded-xl p-5 text-sm text-text-muted">
            No stations registered yet. Data will appear once the first
            observation arrives.
          </div>
        )}

        {/* Diagnostics */}
        <DiagnosticsSection diagnostics={diagnostics} />

        {/* About */}
        <div className="weather-card rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">About</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-text-faint">Application</dt>
              <dd className="font-medium">WaffleWeather</dd>
            </div>
            <div>
              <dt className="text-xs text-text-faint">Frontend</dt>
              <dd className="font-mono font-medium">{FRONTEND_VERSION}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-faint">Backend</dt>
              <dd className="font-mono font-medium">{backendVersion ?? "..."}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
