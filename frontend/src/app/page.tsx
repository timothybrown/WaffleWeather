"use client";

import type { Observation } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { timeAgo } from "@/lib/utils";
import { useTrends } from "@/hooks/useTrends";
import { useTodayExtremes } from "@/hooks/useTodayExtremes";
import TemperatureCard from "@/components/dashboard/TemperatureCard";
import HumidityCard from "@/components/dashboard/HumidityCard";
import WindCard from "@/components/dashboard/WindCard";
import PressureCard from "@/components/dashboard/PressureCard";
import RainCard from "@/components/dashboard/RainCard";
import SolarUVCard from "@/components/dashboard/SolarUVCard";
import LightningCard from "@/components/dashboard/LightningCard";
import UTCICard from "@/components/dashboard/UTCICard";
import SunCard from "@/components/dashboard/SunCard";
import MoonCard from "@/components/dashboard/MoonCard";

export default function DashboardPage() {
  const { data: apiResponse, error } = useGetLatestObservation();
  const { latestObservation: wsData } = useWebSocket();
  const trends = useTrends();
  const extremes = useTodayExtremes();

  // Orval wraps response as { data: Observation, status, headers }
  const apiData = apiResponse?.data as Observation | undefined;
  // Merge WS over REST so REST-only fields (e.g. zambretti_forecast) persist
  const data: Observation | null = wsData
    ? ({ ...apiData, ...wsData } as Observation)
    : apiData ?? null;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="page-header mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Observatory</h1>
          <p className="mt-1 text-sm text-text-muted">
            {error
              ? `Error: ${String(error)}`
              : data
                ? `Last update: ${timeAgo(data.timestamp)}`
                : "Waiting for data..."}
          </p>
        </div>
      </div>

      {/* Card Grid */}
      <div className="card-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <TemperatureCard data={data} trend={trends.temp_outdoor} dayMin={extremes.tempMin} dayMax={extremes.tempMax} />
        <HumidityCard data={data} trend={trends.humidity_outdoor} dayMin={extremes.humidityMin} dayMax={extremes.humidityMax} />
        <WindCard data={data} trend={trends.wind_speed} />
        <PressureCard data={data} trend={trends.pressure_rel} />
        <RainCard data={data} trend={trends.rain_rate} />
        <SolarUVCard data={data} solarTrend={trends.solar_radiation} uvTrend={trends.uv_index} />
        <LightningCard data={data} />
        <UTCICard data={data} />
        <SunCard />
        <MoonCard />
      </div>
    </div>
  );
}
