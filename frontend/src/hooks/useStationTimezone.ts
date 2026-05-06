import { useListStations } from "@/generated/stations/stations";

export {
  getStationToday,
  getStationTodayParts,
  getStationTodayString,
  getZonedParts,
  zonedMidnightToUtc,
} from "@/lib/stationTime";
export type { StationTodayParts, ZonedParts } from "@/lib/stationTime";

export interface StationTimezoneStatus {
  timezone: string;
  isSettled: boolean;
}

function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns the station timezone plus whether station data has settled.
 * Before station data loads, the browser timezone is a transient fallback.
 */
export function useStationTimezoneStatus(): StationTimezoneStatus {
  const { data: response, isFetched, isError } = useListStations();
  const browserTimezone = getBrowserTimezone();
  const isSettled = Boolean(isFetched || isError || response);
  const stations = response?.data;

  if (!stations) {
    return {
      timezone: browserTimezone,
      isSettled,
    };
  }

  return {
    timezone: stations[0]?.timezone ?? browserTimezone,
    isSettled: true,
  };
}

/**
 * Returns the station's IANA timezone identifier.
 * Falls back to the browser's timezone if station data is unavailable.
 */
export function useStationTimezone(): string {
  return useStationTimezoneStatus().timezone;
}
