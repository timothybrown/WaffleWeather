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
 * Returns the UTC instant of midnight at the start of the station's current day.
 *
 * Uses the station's timezone, not the browser's: a viewer in a different
 * timezone than the station still gets the station's calendar day.
 */
export function getStationToday(timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // en-US sometimes returns "24" for midnight; normalize to 0.
  const h = get("hour") % 24;
  const secondsIntoDay = h * 3600 + get("minute") * 60 + get("second");
  return new Date(Date.now() - secondsIntoDay * 1000);
}
