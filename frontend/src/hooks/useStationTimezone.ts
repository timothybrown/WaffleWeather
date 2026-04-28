import { useListStations } from "@/generated/stations/stations";

export interface StationTodayParts {
  year: number;
  month: number;
  day: number;
  startIso: string;
}

/**
 * Returns the station's IANA timezone identifier.
 * Falls back to the browser's timezone if station data is unavailable.
 */
export function useStationTimezone(): string {
  const { data: response } = useListStations();
  const stations = response?.data ?? [];
  return stations[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getZonedParts(timezone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMs(timezone: string, instant: Date): number {
  const parts = getZonedParts(timezone, instant);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return zonedAsUtc - instant.getTime();
}

function zonedMidnightToUtc(timezone: string, year: number, month: number, day: number): Date {
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let offset = getTimeZoneOffsetMs(timezone, new Date(localMidnightAsUtc));
  let utc = new Date(localMidnightAsUtc - offset);

  const settledOffset = getTimeZoneOffsetMs(timezone, utc);
  if (settledOffset !== offset) {
    offset = settledOffset;
    utc = new Date(localMidnightAsUtc - offset);
  }

  return utc;
}

export function getStationTodayParts(timezone: string, now = new Date()): StationTodayParts {
  const parts = getZonedParts(timezone, now);
  const start = zonedMidnightToUtc(timezone, parts.year, parts.month, parts.day);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    startIso: start.toISOString(),
  };
}

/**
 * Returns the UTC instant of midnight at the start of the station's current day.
 *
 * Uses the station's timezone, not the browser's: a viewer in a different
 * timezone than the station still gets the station's calendar day.
 */
export function getStationToday(timezone: string, now = new Date()): Date {
  return new Date(getStationTodayParts(timezone, now).startIso);
}
