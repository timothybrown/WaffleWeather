import { useListStations } from "@/generated/stations/stations";

export {
  getStationToday,
  getStationTodayParts,
  getStationTodayString,
  getZonedParts,
  zonedMidnightToUtc,
} from "@/lib/stationTime";
export type { StationTodayParts, ZonedParts } from "@/lib/stationTime";

/**
 * Returns the station's IANA timezone identifier.
 * Falls back to the browser's timezone if station data is unavailable.
 */
export function useStationTimezone(): string {
  const { data: response } = useListStations();
  const stations = response?.data ?? [];
  return stations[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
