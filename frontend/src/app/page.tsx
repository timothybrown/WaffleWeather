"use client";

import type { Observation } from "@/generated/models";
import { useGetLatestObservation } from "@/generated/observations/observations";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { timeAgo } from "@/lib/utils";
import { useTrends } from "@/hooks/useTrends";
import { useTodayExtremes } from "@/hooks/useTodayExtremes";
import { useSparklineData } from "@/hooks/useSparklineData";
import { CADENCES } from "@/lib/queryCadences";
import TemperatureCard from "@/components/dashboard/TemperatureCard";
import HumidityCard from "@/components/dashboard/HumidityCard";
import WindCard from "@/components/dashboard/WindCard";
import PressureCard from "@/components/dashboard/PressureCard";
import RainCard from "@/components/dashboard/RainCard";
import LightningCard from "@/components/dashboard/LightningCard";
import UTCICard from "@/components/dashboard/UTCICard";
import SunCard from "@/components/dashboard/SunCard";
import MoonCard from "@/components/dashboard/MoonCard";

export default function DashboardPage() {
  const { data: apiResponse, error } = useGetLatestObservation(undefined, {
    query: { refetchInterval: CADENCES.live },
  });
  const { latestObservation: wsData } = useWebSocket();
  const trends = useTrends();
  const extremes = useTodayExtremes();
  const sparklines = useSparklineData();

  const apiData = apiResponse?.data as Observation | undefined;
  const data: Observation | null = wsData
    ? ({ ...apiData, ...wsData } as Observation)
    : apiData ?? null;

  return (
    <div className="p-4 sm:p-6">
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

      <div className="card-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TemperatureCard data={data} trend={trends.temp_outdoor} dayMin={extremes.tempMin} dayMax={extremes.tempMax} sparkline={sparklines.temperature} />
        <HumidityCard data={data} trend={trends.humidity_outdoor} dayMin={extremes.humidityMin} dayMax={extremes.humidityMax} sparkline={sparklines.humidity} />
        <PressureCard data={data} trend={trends.pressure_rel} sparkline={sparklines.pressure} />
        <UTCICard data={data} />
        <RainCard data={data} trend={trends.rain_rate} />
        <WindCard data={data} trend={trends.wind_speed} />
        <SunCard data={data} solarTrend={trends.solar_radiation} uvTrend={trends.uv_index} />
        <MoonCard />
        <LightningCard data={data} />
      </div>
    </div>
  );
}
