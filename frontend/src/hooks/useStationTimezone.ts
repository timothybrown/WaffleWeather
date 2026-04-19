import { useListStations } from "@/generated/stations/stations";

/**
 * Returns the station's IANA timezone identifier.
 * Falls back to the browser's timezone if station data is unavailable.
 */
export function useStationTimezone(): string {
  const { data: response } = useListStations();
  const stations = response?.data ?? [];
  return stations[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns the current date at the station (not the browser's local date).
 */
export function getStationToday(timezone: string): Date {
  const nowStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  return new Date(nowStr + "T00:00:00");
}
